


'use server';

import { adminDb, adminAuth } from './firebase-admin';
import type { Timestamp as FirebaseAdminTimestamp } from 'firebase-admin/firestore';
import { Timestamp, FieldValue, FieldPath, getDocs, collection, query, where, orderBy, doc } from 'firebase-admin/firestore';
import type { Tournament, UserProfile, Team, Match, Standing, TournamentFormat, Player, MatchReport, Notification, RewardDetails, TeamMatchStats, MatchStatus, UnifiedTimestamp, PlayerStats, TournamentPerformancePoint, Highlight, Article, UserMembership, ReplayRequest, EarnedAchievement, PlayerTitle, PlatformSettings, Conversation, ChatMessage, PlayerRole, PushSubscription, TournamentAward, BankDetails, PrizeAllocation, Transaction, DisputedMatchInfo, Badge, TournamentStatus } from './types';
import { revalidatePath } from 'next/cache';
import { verifyMatchScores, type VerifyMatchScoresInput, type VerifyMatchScoresOutput } from '@/ai/flows/verify-match-scores';
import { getStorage } from 'firebase-admin/storage';
import { addHours, differenceInDays, isBefore, format, addDays, startOfDay, endOfDay, isPast, isToday, isAfter, subDays, startOfMonth, endOfMonth, eachMonthOfInterval, formatISO } from 'date-fns';
import { analyzePlayerPerformance, type PlayerPerformanceInput } from '@/ai/flows/analyze-player-performance';
import { predictMatchWinner, type PredictWinnerInput } from '@/ai/flows/predict-match-winner';
import { generateMatchSummary, type GenerateMatchSummaryInput } from '@/ai/flows/generate-match-summary';
import { allAchievements } from './achievements';
import { sendEmail } from './email';
import webpush from 'web-push';
import { toDate } from './utils';
import { getRoundName, generateCupRound } from './cup-tournament';
import { getCurrentCupRound, assertRoundCompleted, getWinnersForRound } from './cup-progression';
import { createWorldCupGroups, generateGroupStageFixtures, computeAllGroupStandings, seedKnockoutFromGroups, isGroupRound, isKnockoutRound } from './group-stage';

if (process.env.VAPID_PRIVATE_KEY && process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) {
    webpush.setVapidDetails(
        `mailto:${process.env.SMTP_USERNAME}`,
        process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
        process.env.VAPID_PRIVATE_KEY
    );
}

async function sendPushNotification(userId: string, payload: { title: string; body: string; url: string }) {
    if (!process.env.VAPID_PRIVATE_KEY) {
        console.log("Push notifications not sent. VAPID keys not configured.");
        return;
    }
    try {
        const subscriptionsSnapshot = await adminDb.collection('users').doc(userId).collection('pushSubscriptions').get();
        if (subscriptionsSnapshot.empty) {
            return;
        }

        const notificationPayload = JSON.stringify(payload);

        const promises = subscriptionsSnapshot.docs.map(doc => {
            const subscription = doc.data() as PushSubscription;
            return webpush.sendNotification(subscription, notificationPayload).catch(error => {
                // Handle common errors, e.g., subscription expired (410) or invalid (404)
                if (error.statusCode === 410 || error.statusCode === 404) {
                    console.log(`Subscription for user ${userId} has expired or is invalid. Deleting.`);
                    return doc.ref.delete();
                } else {
                    console.error('Failed to send push notification:', error);
                }
            });
        });
        await Promise.all(promises);
    } catch (error) {
        console.error(`Error sending push notification to user ${userId}:`, error);
    }
}


// Helper function to convert Firestore Timestamps to ISO strings recursively
function serializeData(data: any): any {
  if (data === null || data === undefined || typeof data !== 'object') {
    return data;
  }

  if (data instanceof Timestamp) {
    return data.toDate().toISOString();
  }
  
  if (data instanceof Date) {
      return data.toISOString();
  }

  if (Array.isArray(data)) {
    return data.map(serializeData);
  }

  // This handles plain objects
  const serializedObject: { [key: string]: any } = {};
  for (const key in data) {
    if (Object.prototype.hasOwnProperty.call(data, key)) {
      serializedObject[key] = serializeData(data[key]);
    }
  }
  return serializedObject;
}

const toAdminDate = (timestamp: UnifiedTimestamp): Date => {
    if (typeof timestamp === 'string') {
        return new Date(timestamp);
    }
    if (timestamp instanceof Timestamp) {
        return timestamp.toDate();
    }
    if (timestamp instanceof Date) {
      return timestamp;
    }
    throw new Error('Invalid timestamp format for server-side processing.');
};


// Helper function to generate a short unique code
function generateTournamentCode(length = 6) {
    const chars = 'ABCDEFGHIJKLMNPQRSTUVWXYZ123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

// Helper to send notifications
async function sendNotification(userId: string, notification: Omit<Notification, 'id' | 'createdAt' | 'isRead'>) {
    if (!userId) return;
    const userNotifsRef = adminDb.collection('users').doc(userId).collection('notifications');
    await userNotifsRef.add({
        ...notification,
        isRead: false,
        createdAt: FieldValue.serverTimestamp(),
    });

    if (notification.title.includes("payout")) {
        await sendPushNotification(userId, {
            title: notification.title,
            body: notification.body,
            url: notification.href,
        });
    }
}

// Helper to award badges to winning teams
async function awardBadges(tournamentId: string) {
    const tournamentDoc = await adminDb.collection('tournaments').doc(tournamentId).get();
    if (!tournamentDoc.exists) return;
    const tournament = tournamentDoc.data() as Tournament;

    const standingsSnapshot = await adminDb.collection('standings')
        .where('tournamentId', '==', tournamentId)
        .orderBy('ranking', 'asc')
        .limit(3)
        .get();
    
    if (standingsSnapshot.empty) return;

    for (const doc of standingsSnapshot.docs) {
        const standing = doc.data() as Standing;
        if (standing.ranking > 3) continue;

        const teamDoc = await adminDb.collection('tournaments').doc(tournamentId).collection('teams').doc(standing.teamId).get();
        if (!teamDoc.exists) continue;

        const team = teamDoc.data() as Team;
        const newBadge: Omit<Badge, 'id'> = {
            tournamentName: tournament.name,
            tournamentId: tournamentId,
            rank: standing.ranking,
            date: Timestamp.now(),
        };

        for (const player of team.players) {
            if (!player || !player.uid) continue;
            const userRef = adminDb.collection('users').doc(player.uid);
            
            const updateData: { badges: FieldValue, tournamentsWon?: FieldValue } = {
                badges: FieldValue.arrayUnion(newBadge)
            };
            if (standing.ranking === 1) {
                updateData.tournamentsWon = FieldValue.increment(1);
            }
            try {
                await userRef.update(updateData);
            } catch (error) {
                console.error(`Failed to update badges for player ${player.uid}:`, error);
                continue;
            }

            await sendNotification(player.uid, {
                userId: player.uid,
                tournamentId: tournament.id,
                title: `You Placed ${standing.ranking}${standing.ranking === 1 ? 'st' : standing.ranking === 2 ? 'nd' : 'rd'}!`,
                body: `Congratulations on your performance in ${tournament.name}.`,
                href: `/tournaments/${tournamentId}?tab=rewards`,
            });
             // Now check for achievements after awarding the badge
            await checkAndAwardAchievements(player.uid);
        }
    }
}


async function uploadFileAndGetPublicURL(bucketPath: string, file: File, forceContentType?: string): Promise<string> {
    const bucket = getStorage().bucket(process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET);
    const buffer = Buffer.from(await file.arrayBuffer());
    const filePath = `${bucketPath}/${Date.now()}_${file.name}`;
    const fileRef = bucket.file(filePath);

    await fileRef.save(buffer, {
        metadata: { contentType: forceContentType || file.type },
    });
    
    await fileRef.makePublic();

    return fileRef.publicUrl();
}

// User Actions
export async function updateUserProfile(uid: string, data: Partial<UserProfile>) {
  const userRef = adminDb.collection('users').doc(uid);
  await userRef.update(data);
  revalidatePath('/profile');
}

export async function updateUserProfilePhoto(userId: string, formData: FormData) {
  const photoFile = formData.get('photo') as File;
  if (!photoFile) {
    throw new Error('No photo file provided.');
  }

  const photoURL = await uploadFileAndGetPublicURL(`avatars/${userId}`, photoFile, photoFile.type);

  await adminAuth.updateUser(userId, { photoURL });
  await adminDb.collection('users').doc(userId).update({ photoURL });
  
  revalidatePath('/profile');
  return photoURL;
}

export async function getUserProfileById(userId: string): Promise<UserProfile | null> {
    const userProfileDoc = await adminDb.collection('users').doc(userId).get();
    if (userProfileDoc.exists) {
        return { uid: userProfileDoc.id, ...serializeData(userProfileDoc.data()) } as UserProfile;
    }
    return null;
}

export async function findUserByEmail(email: string): Promise<UserProfile | null> {
    try {
        const userRecord = await adminAuth.getUserByEmail(email);
        const userProfileDoc = await adminDb.collection('users').doc(userRecord.uid).get();
        if (userProfileDoc.exists) {
            const data = userProfileDoc.data();
            return { uid: userRecord.uid, ...serializeData(data) } as UserProfile;
        }
        return null;
    } catch (error) {
        console.error("Error finding user by email:", error);
        return null;
    }
}

export async function sendPasswordResetEmail(email: string) {
    try {
        const link = await adminAuth.generatePasswordResetLink(email);
        await sendEmail({
            to: email,
            subject: 'Reset your eArena Password',
            body: `Hello,\n\nYou requested a password reset. Please click the following link to reset your password:\n${link}\n\nIf you did not request this, please ignore this email.\n\nThanks,\nThe eArena Team`
        });
    } catch (error: any) {
        // Don't reveal if an email exists or not for security.
        console.error("Password reset error:", error);
        // We resolve successfully even if the user doesn't exist.
        return;
    }
}

export async function resendVerificationEmail(email: string) {
    try {
        const userRecord = await adminAuth.getUserByEmail(email);
        if (userRecord.emailVerified) {
            // The user's email is already verified, so no need to send another email.
            // We could optionally notify them that someone attempted to register with their email.
            return;
        }

        const link = await adminAuth.generateEmailVerificationLink(email);
        await sendEmail({
            to: email,
            subject: 'Verify your eArena Email',
            body: `Hello,\n\nPlease click the following link to verify your email and activate your eArena account:\n${link}\n\nIf you did not request this, please ignore this email.\n\nThanks,\nThe eArena Team`
        });
    } catch (error: any) {
        // This will catch \`auth/user-not-found\` if called improperly,
        // but for this flow it just means we don't spam emails for non-existent users.
        console.error("Resend verification email error:", error);
        // We don't throw an error back to the client to avoid revealing user existence.
    }
}

// Fetches admin UIDs based on emails in environment variables
async function getAdminUids(): Promise<string[]> {
    const adminEmails = (process.env.NEXT_PUBLIC_ADMIN_EMAILS || '')
        .split(',')
        .map(e => e.trim().toLowerCase())
        .filter(e => e); // Filter out empty strings

    if (adminEmails.length === 0) {
        return [];
    }

    try {
        const adminUsers = await adminAuth.getUsers(
            adminEmails.map(email => ({ email }))
        );
        return adminUsers.users.map(user => user.uid);
    } catch (error) {
        console.error("Error fetching admin UIDs:", error);
        return [];
    }
}

// This function is called after a new user signs up.
export async function handleNewUserSetup(newUserId: string) {
    const newUserRef = adminDb.collection('users').doc(newUserId);
    const adminUids = await getAdminUids();

    if (adminUids.length === 0) {
        return; // No admins to follow
    }
    
    // 1. New user follows all admins.
    await newUserRef.update({
        following: FieldValue.arrayUnion(...adminUids)
    });

    // 2. All admins follow the new user.
    const batch = adminDb.batch();
    adminUids.forEach(adminId => {
        const adminRef = adminDb.collection('users').doc(adminId);
        batch.update(adminRef, {
            followers: FieldValue.arrayUnion(newUserId)
        });
    });

    await batch.commit();
}

export async function followUser(currentUserId: string, targetUserId: string) {
    if (currentUserId === targetUserId) {
        throw new Error("You cannot follow yourself.");
    }
    
    const adminUids = await getAdminUids();

    const currentUserRef = adminDb.collection('users').doc(currentUserId);
    const targetUserRef = adminDb.collection('users').doc(targetUserId);

    await adminDb.runTransaction(async (transaction) => {
        const currentUserDoc = await transaction.get(currentUserRef);
        const currentUserProfile = currentUserDoc.data() as UserProfile;
        
        // Ensure user is following all admins as a sync mechanism
        const currentFollowing = currentUserProfile.following || [];
        const adminsToFollow = adminUids.filter(adminId => !currentFollowing.includes(adminId) && adminId !== currentUserId);

        transaction.update(currentUserRef, {
            following: FieldValue.arrayUnion(targetUserId, ...adminsToFollow)
        });
        transaction.update(targetUserRef, {
            followers: FieldValue.arrayUnion(currentUserId)
        });

        // Add the current user as a follower to any admins they weren't following
        if (adminsToFollow.length > 0) {
            for (const adminId of adminsToFollow) {
                const adminRef = adminDb.collection('users').doc(adminId);
                transaction.update(adminRef, {
                    followers: FieldValue.arrayUnion(currentUserId)
                });
            }
        }
    });

    const currentUser = await adminAuth.getUser(currentUserId);
    await sendNotification(targetUserId, {
        userId: targetUserId,
        tournamentId: targetUserId,
        title: "You have a new follower!",
        body: `${currentUser.displayName || 'A user'} is now following you.`,
        href: `/profile/${currentUserId}`,
    });

    revalidatePath(`/profile/${targetUserId}`);
    revalidatePath(`/profile/${currentUserId}`);
}

export async function unfollowUser(currentUserId: string, targetUserId: string) {
    const currentUserRef = adminDb.collection('users').doc(currentUserId);
    const targetUserRef = adminDb.collection('users').doc(targetUserId);

    await adminDb.runTransaction(async (transaction) => {
        transaction.update(currentUserRef, {
            following: FieldValue.arrayRemove(targetUserId)
        });
        transaction.update(targetUserRef, {
            followers: FieldValue.arrayRemove(currentUserId)
        });
    });
    
    revalidatePath(`/profile/${targetUserId}`);
    revalidatePath(`/profile/${currentUserId}`);
}


// Tournament Actions
export async function createTournament(values: any) {
  try {
    const {
        name, description, format, registrationDates, tournamentDates, maxTeams, rules, isPublic,
        matchLength, substitutions, extraTime, penalties, homeAndAway, squadRestrictions, rewardType,
        prizePool, recurringEnabled, recurringDays, organizerId, game, platform, injuries
    } = values;

    const registrationEndDate = toAdminDate(registrationDates.to);
    const tournamentStartDate = toAdminDate(tournamentDates.from);
    const tournamentEndDate = toAdminDate(tournamentDates.to);

    if (isAfter(registrationEndDate, tournamentStartDate)) {
        throw new Error("Registration must end on or before the tournament start date.");
    }
    if (isAfter(tournamentStartDate, tournamentEndDate)) {
        throw new Error("Tournament start date must be on or before the end date.");
    }
    
    const userRecord = await adminAuth.getUser(organizerId);
    const tournamentCode = generateTournamentCode();
    
    const rewardDetails: RewardDetails = {
      type: rewardType,
      prizePool: prizePool,
      currency: 'NGN',
      isPaidOut: false,
      paymentStatus: rewardType === 'money' ? 'pending' : 'not-applicable',
    };

    const newTournamentData: Omit<Tournament, 'id' | 'flyerUrl'> = {
      name,
      description,
      format,
      registrationStartDate: Timestamp.fromDate(toAdminDate(registrationDates.from)),
      registrationEndDate: Timestamp.fromDate(registrationEndDate),
      tournamentStartDate: Timestamp.fromDate(tournamentStartDate),
      tournamentEndDate: Timestamp.fromDate(tournamentEndDate),
      maxTeams,
      rules,
      isPublic,
      matchLength,
      substitutions,
      extraTime,
      penalties,
      homeAndAway,
      squadRestrictions,
      game: game || 'eFootball',
      platform: platform || 'Multi-Platform',
      organizerId: organizerId,
      organizerUsername: userRecord.displayName || userRecord.email,
      createdAt: FieldValue.serverTimestamp() as UnifiedTimestamp,
      status: rewardType === 'money' ? 'pending' : 'open_for_registration',
      teamCount: 0,
      code: tournamentCode,
      rewardDetails,
      injuries: injuries || false,
      recurring: {
          enabled: recurringEnabled,
          daysAfterEnd: recurringDays,
      }
    };

    const tournamentRef = await adminDb.collection('tournaments').add(newTournamentData as any);
    
    revalidatePath('/dashboard');

    let paymentUrl = null;
    if (rewardType === 'money' && prizePool > 0) {
        try {
            const paymentResult = await initializeTournamentPayment(tournamentRef.id, prizePool, userRecord.email || '', organizerId);
            paymentUrl = paymentResult.paymentUrl;
        } catch (paymentError: any) {
            console.error("Payment initialization failed:", paymentError);
        }
    }

    return { 
        tournamentId: tournamentRef.id,
        paymentUrl,
    };

  } catch (error: any) {
    console.error("Error creating tournament in server action: ", error);
    throw new Error(`A server error occurred while creating the tournament. Reason: ${error.message}`);
  }
}

export async function updateTournamentFlyer(tournamentId: string, flyerUrl: string) {
    if (!tournamentId || !flyerUrl) {
        throw new Error("Missing tournament ID or flyer URL.");
    }
    const tournamentRef = adminDb.collection('tournaments').doc(tournamentId);
    await tournamentRef.update({ flyerUrl });

    // Revalidate paths to show the new flyer
    revalidatePath(`/tournaments/${tournamentId}`);
    revalidatePath(`/tournaments`);
}


async function deleteCollection(collectionPath: string, batchSize: number) {
  const collectionRef = adminDb.collection(collectionPath);
  const q = collectionRef.orderBy('__name__').limit(batchSize);

  return new Promise((resolve, reject) => {
    deleteQueryBatch(q, resolve).catch(reject);
  });
}

async function deleteQueryBatch(q: FirebaseFirestore.Query, resolve: (value?: unknown) => void) {
  const snapshot = await q.get();

  const batchSize = snapshot.size;
  if (batchSize === 0) {
    resolve();
    return;
  }

  const batch = adminDb.batch();
  snapshot.docs.forEach((doc: any) => {
    batch.delete(doc.ref);
  });
  await batch.commit();

  process.nextTick(() => {
    deleteQueryBatch(q, resolve);
  });
}


export async function deleteTournament(tournamentId: string, organizerId: string) {
    const tournamentRef = adminDb.collection('tournaments').doc(tournamentId);
    const doc = await tournamentRef.get();
    if (!doc.exists || doc.data()?.organizerId !== organizerId) {
        throw new Error("You are not authorized to delete this tournament.");
    }
    
    // Use the robust deletion function
    await fullTournamentDelete(tournamentId);

    revalidatePath('/dashboard');
}

export async function getPublicTournaments(): Promise<Tournament[]> {
    try {
        const validStatuses: TournamentStatus[] = ['open_for_registration', 'generating_fixtures', 'in_progress', 'completed', 'ready_to_start'];
        const snapshot = await adminDb.collection('tournaments')
            .where('isPublic', '==', true)
            .get();
        
        let allTournaments = snapshot.docs.map(doc => ({ id: doc.id, ...serializeData(doc.data()) } as Tournament));
        allTournaments = allTournaments.filter(t => validStatuses.includes(t.status));
        
        // Sort manually to avoid needing a composite index
        allTournaments.sort((a, b) => {
            const dateA = toAdminDate(a.tournamentStartDate).getTime();
            const dateB = toAdminDate(b.tournamentStartDate).getTime();
            return dateB - dateA;
        });

        return allTournaments;

    } catch (error: any) {
        console.error("Error fetching public tournaments:", error);
        // It's better to just return empty than to crash.
        return [];
    }
}

export async function getTournamentById(id: string): Promise<Tournament | null> {
    const doc = await adminDb.collection('tournaments').doc(id).get();
    if (doc.exists) {
        return { id: doc.id, ...serializeData(doc.data()) } as Tournament;
    }
    return null;
}

export async function getTournamentsByIds(ids: string[]): Promise<Tournament[]> {
    if (ids.length === 0) return [];

    const tournaments: Tournament[] = [];
    // Firestore 'in' query limit is 30 documents
    for (let i = 0; i < ids.length; i += 30) {
        const chunk = ids.slice(i, i + 30);
        if (chunk.length > 0) {
            const snapshot = await adminDb.collection('tournaments').where(FieldPath.documentId(), 'in', chunk).get();
            const chunkTournaments = snapshot.docs.map(doc => ({ id: doc.id, ...serializeData(doc.data()) } as Tournament));
            tournaments.push(...chunkTournaments);
        }
    }

    return tournaments;
}

export async function findTournamentByCode(code: string): Promise<string | null> {
    const snapshot = await adminDb.collection('tournaments').where('code', '==', code).limit(1).get();
    if (!snapshot.empty) {
        return snapshot.docs[0].id;
    }
    return null;
}

export async function extendRegistration(tournamentId: string, hours: number, organizerId: string) {
    const tournamentRef = adminDb.collection('tournaments').doc(tournamentId);
    const tournamentDoc = await tournamentRef.get();
    if (!tournamentDoc.exists) {
        throw new Error("Tournament not found.");
    }
    const tournament = tournamentDoc.data() as Tournament;

    if (tournament.organizerId !== organizerId) {
        throw new Error("You are not authorized to perform this action.");
    }

    if (tournament.status !== 'open_for_registration' && tournament.status !== 'ready_to_start') {
        throw new Error("Registration can only be extended while it is open or ready to start.");
    }

    const currentEndDate = toAdminDate(tournament.registrationEndDate);
    const newEndDate = addHours(currentEndDate, hours);
    
    const tournamentStartDate = toAdminDate(tournament.tournamentStartDate);
    if (newEndDate > tournamentStartDate) {
        throw new Error("Cannot extend registration beyond the tournament start date.");
    }

    await tournamentRef.update({ registrationEndDate: Timestamp.fromDate(newEndDate) });
    revalidatePath(`/tournaments/${tournamentId}`);
}

// Team & Roster Actions
export async function addTeam(tournamentId: string, teamData: Omit<Team, 'id' | 'tournamentId' | 'playerIds' | 'players'>): Promise<Team> {
    const tournamentRef = adminDb.collection('tournaments').doc(tournamentId);
    const teamRef = tournamentRef.collection('teams').doc();
    const membershipRef = adminDb.collection('userMemberships').doc(`${teamData.captainId}_${tournamentId}`);

    const captainProfileDoc = await adminDb.collection('users').doc(teamData.captainId).get();
    const captainProfile = captainProfileDoc.data() as UserProfile;
    const needsApproval = captainProfile?.warnings && captainProfile.warnings >= 5;

    const newTeam: Omit<Team, 'id'> = {
        tournamentId,
        ...teamData,
        players: [teamData.captain],
        playerIds: [teamData.captainId],
        isApproved: !needsApproval,
        performancePoints: 0,
    };
    
    const newMembership: UserMembership = {
        userId: teamData.captainId,
        teamId: teamRef.id,
        tournamentId: tournamentId,
    };

    const batch = adminDb.batch();
    batch.set(teamRef, newTeam);
    batch.set(membershipRef, newMembership);
    batch.update(tournamentRef, { teamCount: FieldValue.increment(1) });
    await batch.commit();

    if (needsApproval) {
        const tournament = (await tournamentRef.get()).data() as Tournament;
        await sendNotification(tournament.organizerId, {
            userId: tournament.organizerId,
            tournamentId,
            title: "Team Requires Approval",
            body: `Team "${teamData.name}" has joined your tournament and requires manual approval due to their reputation.`,
            href: `/tournaments/${tournamentId}?tab=teams`,
        });
    }
    
    revalidatePath(`/tournaments/${tournamentId}`);
    return serializeData({ id: teamRef.id, ...newTeam });
}

export async function leaveTournament(tournamentId: string, teamId: string, userId: string) {
    const tournamentRef = adminDb.collection('tournaments').doc(tournamentId);
    const teamRef = tournamentRef.collection('teams').doc(teamId);
    const membershipRef = adminDb.collection('userMemberships').doc(`${userId}_${tournamentId}`);

    const teamDoc = await teamRef.get();
    if (!teamDoc.exists || teamDoc.data()?.captainId !== userId) {
        throw new Error("Only the captain can remove the team.");
    }
    
    const batch = adminDb.batch();
    batch.delete(teamRef);
    batch.delete(membershipRef);
    batch.update(tournamentRef, { teamCount: FieldValue.increment(-1) });
    await batch.commit();
    
    revalidatePath(`/tournaments/${tournamentId}`);
}

export async function removeTeamAsOrganizer(tournamentId: string, teamId: string, organizerId: string) {
    const tournamentRef = adminDb.collection('tournaments').doc(tournamentId);
    const tournamentDoc = await tournamentRef.get();
    if (tournamentDoc.data()?.organizerId !== organizerId) {
        throw new Error("You are not authorized to perform this action.");
    }
    
    const teamDoc = await tournamentRef.collection('teams').doc(teamId).get();
    if (!teamDoc.exists) {
        throw new Error("Team not found");
    }
    const teamCaptainId = teamDoc.data()?.captainId;

    await leaveTournament(tournamentId, teamId, teamCaptainId);
}

export async function updateTeamRoster(tournamentId: string, teamId: string, players: Player[], currentUserId: string) {
    const teamRef = adminDb.collection('tournaments').doc(tournamentId).collection('teams').doc(teamId);
    const teamDoc = await teamRef.get();
    if (!teamDoc.exists) throw new Error("Team not found.");

    const teamData = teamDoc.data() as Team;
    const currentUserRole = teamData.players.find(p => p.uid === currentUserId)?.role;

    if (currentUserRole !== 'captain' && currentUserRole !== 'co-captain') {
        throw new Error("You do not have permission to manage this roster.");
    }
    
    const playerIds = players.map(p => p.uid);
    await teamRef.update({ players, playerIds });
    revalidatePath(`/tournaments/${tournamentId}`);
}


export async function getUserTeamForTournament(tournamentId: string, userId: string): Promise<Team | null> {
    try {
        const teamsRef = adminDb.collection('tournaments').doc(tournamentId).collection('teams');
        const snapshot = await teamsRef.where('playerIds', 'array-contains', userId).limit(1).get();
        if (!snapshot.empty) {
            const doc = snapshot.docs[0];
            return { id: doc.id, ...serializeData(doc.data()) } as Team;
        }
    } catch (error) {
        console.error("Error fetching user team:", error);
    }
    return null;
}

export async function getJoinedTournamentIdsForUser(userId: string): Promise<string[]> {
    const snapshot = await adminDb.collection('userMemberships').where('userId', '==', userId).get();
    if (snapshot.empty) {
        return [];
    }
    return snapshot.docs.map(doc => doc.data().tournamentId);
}



// Fixture & Match Actions
function generateFixtures(teamIds: string[], format: TournamentFormat, homeAndAway: boolean): Omit<Match, 'id' | 'tournamentId' | 'matchDay' | 'status'>[] {
    if (teamIds.length < 2) return [];

    let fixtures: Omit<Match, 'id' | 'tournamentId' | 'matchDay' | 'status'>[] = [];

    if (format === 'league') {
        // Round Robin
        const schedule = (teams: string[]) => {
            for (let i = 0; i < teams.length; i++) {
                for (let j = i + 1; j < teams.length; j++) {
                    // Alternate home and away
                    if ((i + j) % 2 === 0) {
                        fixtures.push({ homeTeamId: teams[i], awayTeamId: teams[j], round: 'League Stage', hostId: teams[i], homeScore: null, awayScore: null, hostTransferRequested: false });
                    } else {
                        fixtures.push({ homeTeamId: teams[j], awayTeamId: teams[i], round: 'League Stage', hostId: teams[j], homeScore: null, awayScore: null, hostTransferRequested: false });
                    }
                }
            }
        };
        schedule(teamIds);
        if (homeAndAway) {
            const secondLegFixtures = fixtures.map(f => ({
                ...f,
                homeTeamId: f.awayTeamId,
                awayTeamId: f.homeTeamId,
                hostId: f.awayTeamId,
            }));
            fixtures.push(...secondLegFixtures);
        }
    } else if (format === 'double-elimination') {
        // Simple seeded single elimination for now
        const roundName = getRoundName(teamIds.length);
        fixtures = generateCupRound(teamIds, roundName);
    }
    // Swiss format logic would be much more complex and state-dependent per round, handled separately.

    return fixtures;
}

export async function startTournamentAndGenerateFixtures(tournamentId: string, organizerId: string) {
    const tournamentRef = adminDb.collection('tournaments').doc(tournamentId);
    const tournamentDoc = await tournamentRef.get();
    if (!tournamentDoc.exists) throw new Error("Tournament not found");
    const tournament = tournamentDoc.data() as Tournament;

    if (tournament.organizerId !== organizerId) {
        throw new Error("You are not authorized to perform this action.");
    }
    
    if (tournament.status !== 'open_for_registration') {
        throw new Error("Tournament is not open for registration.");
    }

    const teamsSnapshot = await tournamentRef.collection('teams').where('isApproved', '==', true).get();
    if (teamsSnapshot.docs.length < 4) {
        throw new Error("A minimum of 4 approved teams is required to start the tournament.");
    }
    
    await tournamentRef.update({ status: 'generating_fixtures' });
    revalidatePath(`/tournaments/${tournamentId}`);
    
    const teams = teamsSnapshot.docs.map(team => team.id);

    let fixtures: Omit<Match, 'id' | 'tournamentId' | 'matchDay' | 'status'>[] = [];
    if (tournament.format === 'cup') {
        // World Cup style: group stage first, then knockout via Progress to Next Stage
        const groups = createWorldCupGroups(teams, 4);
        fixtures = generateGroupStageFixtures(groups);
    } else {
        fixtures = generateFixtures(teams, tournament.format, tournament.homeAndAway);
    }
    
    if (!fixtures || fixtures.length === 0) {
        await tournamentRef.update({ status: 'open_for_registration' }); // Revert status
        revalidatePath(`/tournaments/${tournamentId}`);
        throw new Error("Failed to generate fixtures for this tournament. Please check team count and format settings.");
    }

    const batch = adminDb.batch();
    const playStartDate = toAdminDate(tournament.tournamentStartDate);
    const playEndDate = toAdminDate(tournament.tournamentEndDate);
    const totalDays = differenceInDays(playEndDate, playStartDate) + 1;

    fixtures.forEach((fixture, index) => {
        const matchRef = tournamentRef.collection('matches').doc();
        
        // Distribute matches across available days
        const dayOffset = index % totalDays;
        const matchDay = addDays(new Date(playStartDate), dayOffset);

        batch.set(matchRef, {
            ...fixture,
            id: matchRef.id,
            tournamentId,
            status: 'scheduled',
            matchDay: Timestamp.fromDate(matchDay),
        });
    });

    const isReadyEarly = isBefore(new Date(), playStartDate);
    const newStatus = isReadyEarly ? 'ready_to_start' : 'in_progress';
    batch.update(tournamentRef, { status: newStatus });
    
    await batch.commit();

    const organizer = await adminAuth.getUser(organizerId);
    if(organizer.email) {
        await sendEmail({
            to: organizer.email,
            subject: `Fixtures Generated for "${tournament.name}"`,
            body: `Hello ${organizer.displayName || 'Organizer'},\n\nThe fixtures for your tournament, "${tournament.name}", have been successfully generated. Visit the tournament page to manage the next steps.`
        });
    }

    if(newStatus === 'in_progress') {
        const allPlayerIds = (await teamsSnapshot.docs.map(doc => (doc.data() as Team).playerIds)).flat();
        const uniquePlayerIds = [...new Set(allPlayerIds)];

        for (const userId of uniquePlayerIds) {
            await sendNotification(userId, {
                userId,
                tournamentId,
                title: `"${tournament.name}" has started!`,
                body: "The fixtures have been generated. Check your schedule now.",
                href: `/tournaments/${tournamentId}?tab=my-matches`,
            });
        }
    }

    revalidatePath(`/tournaments/${tournamentId}`);
}

/**
 * DEV ONLY: Seed dummy approved teams so you can test flows with a single account.
 * This should never be used in production.
 */
export async function devSeedDummyTeams(tournamentId: string, organizerId: string, count: number = 8) {
    if (process.env.NODE_ENV === 'production') {
        throw new Error('Dev tools are disabled in production.');
    }

    const tournamentRef = adminDb.collection('tournaments').doc(tournamentId);
    const tournamentDoc = await tournamentRef.get();
    if (!tournamentDoc.exists) throw new Error('Tournament not found');

    const tournament = tournamentDoc.data() as Tournament;
    if (tournament.organizerId !== organizerId) throw new Error('You are not authorized to perform this action.');

    if (count < 4) throw new Error('Minimum is 4 teams.');
    if (count % 2 !== 0) throw new Error('Team count must be even.');
    if (tournament.format === 'cup' && count % 8 !== 0) {
        throw new Error('Cup (World Cup rules) requires 8 / 16 / 32 / ... teams.');
    }

    const batch = adminDb.batch();
    for (let i = 0; i < count; i++) {
        const teamRef = tournamentRef.collection('teams').doc();
        const captainId = `dev_${tournamentId}_captain_${i + 1}`;

        const captain: Player = {
            uid: captainId,
            role: 'captain',
            username: `Dev Captain ${i + 1}`,
            photoURL: '',
        };

        batch.set(teamRef, {
            id: teamRef.id,
            tournamentId,
            name: `Dev Team ${i + 1}`,
            logoUrl: '',
            captainId,
            captain,
            players: [captain],
            playerIds: [], // keep empty to avoid pushing notifications to fake users
            isApproved: true,
        } as Partial<Team>);
    }

    // Keep teamCount roughly accurate for organizer UI
    batch.update(tournamentRef, { teamCount: FieldValue.increment(count) });

    await batch.commit();
    revalidatePath(`/tournaments/${tournamentId}`);
    return { created: count };
}

/**
 * DEV ONLY: Auto-approve all matches in the current stage (group/swiss/knockout).
 * This should never be used in production.
 */
export async function devAutoApproveCurrentStageMatches(tournamentId: string, organizerId: string) {
    if (process.env.NODE_ENV === 'production') {
        throw new Error('Dev tools are disabled in production.');
    }

    const tournamentRef = adminDb.collection('tournaments').doc(tournamentId);
    const tournamentDoc = await tournamentRef.get();
    if (!tournamentDoc.exists) throw new Error('Tournament not found');

    const tournament = tournamentDoc.data() as Tournament;
    if (tournament.organizerId !== organizerId) throw new Error('You are not authorized to perform this action.');

    const matchesSnapshot = await tournamentRef.collection('matches').get();
    const matches = matchesSnapshot.docs.map(d => ({ id: d.id, ...(d.data() as any) } as Match));

    const groupMatches = matches.filter(m => isGroupRound(m.round));
    const knockoutMatches = matches.filter(m => isKnockoutRound(m.round));

    let target: Match[] = [];

    if (tournament.format === 'cup') {
        if (knockoutMatches.length === 0 && groupMatches.length > 0) {
            target = groupMatches;
        } else if (knockoutMatches.length > 0) {
            const currentRound = getCurrentCupRound(knockoutMatches);
            target = knockoutMatches.filter(m => (m.round || '') === currentRound);
        }
    } else {
        throw new Error('Dev auto-approve is only implemented for Cup format.');
    }

    if (target.length === 0) {
        console.warn(`No matches found for tournament ${tournamentId} at current stage. This may be normal if matches have already been approved or the tournament stage hasn't started.`);
        return { approved: 0 };
    }

    let approved = 0;

    for (const m of target) {
        if (m.status === 'approved') continue;

        let home = Math.floor(Math.random() * 4);
        let away = Math.floor(Math.random() * 4);

        // Avoid draws in knockout (otherwise progression can fail without penalties data)
        if (isKnockoutRound(m.round) && home === away) {
            away = (away + 1) % 4;
        }

        await approveMatchResult(tournamentId, m.id, home, away, 'DEV: auto-approved', false);
        approved++;
    }

    revalidatePath(`/tournaments/${tournamentId}`);
    return { approved };
}

/**
 * DEV ONLY: One-click "approve current stage AND advance".
 * - Approves all matches in the current stage
 * - Advances to next stage (or seeds knockout) when applicable
 */
export async function devAutoApproveAndProgress(tournamentId: string, organizerId: string) {
    if (process.env.NODE_ENV === 'production') {
        throw new Error('Dev tools are disabled in production.');
    }

    const approvedRes = await devAutoApproveCurrentStageMatches(tournamentId, organizerId);

    // If approving the final completed the tournament, no need to progress.
    const tournamentRef = adminDb.collection('tournaments').doc(tournamentId);
    const tournamentDoc = await tournamentRef.get();
    const tournament = tournamentDoc.exists ? (tournamentDoc.data() as Tournament) : null;
    if (!tournament) throw new Error('Tournament not found');
    if (tournament.status === 'completed') {
        revalidatePath(`/tournaments/${tournamentId}`);
        return { approved: approvedRes.approved, progressed: false, status: 'completed' as const };
    }

    try {
        await progressTournamentStage(tournamentId, organizerId);
        return { approved: approvedRes.approved, progressed: true, status: 'in_progress' as const };
    } catch (e: any) {
        // It's okay if there's nothing to progress yet (e.g., Swiss awaiting next round).
        return { approved: approvedRes.approved, progressed: false, error: e?.message || String(e) };
    } finally {
        revalidatePath(`/tournaments/${tournamentId}`);
    }
}

/**
 * DEV ONLY: Auto-run a Cup tournament to completion.
 * Seeds teams/fixtures are not created here; it assumes fixtures already exist.
 */
export async function devAutoRunCupToCompletion(tournamentId: string, organizerId: string, maxSteps: number = 10) {
    if (process.env.NODE_ENV === 'production') {
        throw new Error('Dev tools are disabled in production.');
    }

    const tournamentRef = adminDb.collection('tournaments').doc(tournamentId);
    const tournamentDoc = await tournamentRef.get();
    if (!tournamentDoc.exists) throw new Error('Tournament not found');
    const tournament = tournamentDoc.data() as Tournament;
    if (tournament.organizerId !== organizerId) throw new Error('You are not authorized to perform this action.');
    if (tournament.format !== 'cup') throw new Error('Auto-run is currently only available for Cup.');

    let steps = 0;
    while (steps < maxSteps) {
        const fresh = (await tournamentRef.get()).data() as Tournament | undefined;
        if (!fresh) throw new Error('Tournament not found');
        if (fresh.status === 'completed') break;

        await devAutoApproveAndProgress(tournamentId, organizerId);
        steps++;
    }

    const finalState = (await tournamentRef.get()).data() as Tournament | undefined;
    revalidatePath(`/tournaments/${tournamentId}`);
    return { steps, status: finalState?.status };
}

async function rescheduleFixtures(tournamentId: string, newStartDate: Date, newEndDate: Date) {
    const matchesRef = adminDb.collection('tournaments').doc(tournamentId).collection('matches');
    const matchesSnapshot = await matchesRef.orderBy('round').get();

    if (matchesSnapshot.empty) return;

    const totalDays = differenceInDays(newEndDate, newStartDate) + 1;
    const batch = adminDb.batch();

    matchesSnapshot.docs.forEach((doc, index) => {
        const dayOffset = index % totalDays;
        const matchDay = addDays(new Date(newStartDate), dayOffset);
        batch.update(doc.ref, { matchDay: Timestamp.fromDate(matchDay) });
    });

    await batch.commit();
}

export async function rescheduleTournamentAndStart(tournamentId: string, organizerId: string, newStartDateString: string) {
    const tournamentRef = adminDb.collection('tournaments').doc(tournamentId);
    const tournamentDoc = await tournamentRef.get();
    if (!tournamentDoc.exists) throw new Error("Tournament not found");
    const tournament = tournamentDoc.data() as Tournament;

    if (tournament.organizerId !== organizerId) throw new Error("You are not authorized to perform this action.");
    if (tournament.status !== 'ready_to_start') throw new Error("Tournament is not ready to be rescheduled.");

    const originalStartDate = toAdminDate(tournament.tournamentStartDate);
    const originalEndDate = toAdminDate(tournament.tournamentEndDate);
    const durationInDays = differenceInDays(originalEndDate, originalStartDate);

    const newStartDate = new Date(newStartDateString);
    const newEndDate = addDays(newStartDate, durationInDays);

    await tournamentRef.update({
        tournamentStartDate: Timestamp.fromDate(newStartDate),
        tournamentEndDate: Timestamp.fromDate(newEndDate),
        status: 'in_progress',
    });

    await rescheduleFixtures(tournamentId, newStartDate, newEndDate);

    const teamsSnapshot = await tournamentRef.collection('teams').get();
    const allPlayerIds = teamsSnapshot.docs.flatMap(doc => (doc.data() as Team).playerIds);
    const uniquePlayerIds = [...new Set(allPlayerIds)];

    for (const userId of uniquePlayerIds) {
        const player = await adminAuth.getUser(userId);
        const notificationBody = `The schedule has been updated. The tournament now runs from ${format(newStartDate, 'PPP')} to ${format(newEndDate, 'PPP')}.`;
        
        await sendNotification(userId, {
            userId,
            tournamentId,
            title: `Schedule Updated for "${tournament.name}"`,
            body: notificationBody,
            href: `/tournaments/${tournamentId}?tab=my-matches`,
        });

        if(player.email) {
            await sendEmail({
                to: player.email,
                subject: `Schedule Update for ${tournament.name}`,
                body: `Hello ${player.displayName || 'Player'},\n\n${notificationBody}\n\nPlease check the tournament page for your updated match days.`
            });
        }
    }

    revalidatePath(`/tournaments/${tournamentId}`);
}


export async function progressTournamentStage(tournamentId: string, organizerId: string) {
    const tournamentRef = adminDb.collection('tournaments').doc(tournamentId);
    const tournamentDoc = await tournamentRef.get();
    if (!tournamentDoc.exists) throw new Error("Tournament not found");
    const tournament = tournamentDoc.data() as Tournament;

    if (tournament.organizerId !== organizerId) throw new Error("You are not authorized to perform this action.");
    if (tournament.status !== 'in_progress') throw new Error("Tournament is not in progress.");
    if (tournament.format === 'league') throw new Error("Leagues do not have stages to progress.");

    // Get all matches
    const allMatchesSnapshot = await tournamentRef.collection('matches').get();
    const allMatches = allMatchesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Match));
    
    if (allMatches.length === 0) {
        throw new Error("No matches found. Cannot progress tournament.");
    }

    // Cup: group stage -> knockout -> final
    if (tournament.format === 'cup') {
        const groupMatches = allMatches.filter(m => isGroupRound(m.round));
        const knockoutMatches = allMatches.filter(m => isKnockoutRound(m.round));

        // If we have group matches but no knockout yet, this click should advance to the first knockout round.
        if (groupMatches.length > 0 && knockoutMatches.length === 0) {
            const unapprovedGroupMatches = groupMatches.filter(m => m.status !== 'approved');
            if (unapprovedGroupMatches.length > 0) {
                throw new Error(`Cannot progress: ${unapprovedGroupMatches.length} group stage match(es) are still not approved.`);
            }

            const standingsByGroup = computeAllGroupStandings(groupMatches);
            const nextRoundFixtures = seedKnockoutFromGroups(standingsByGroup);

            const latestGroupMatch = groupMatches.reduce((latest, match) => {
                const matchDate = toDate(match.matchDay);
                const latestDate = toDate(latest.matchDay);
                return matchDate > latestDate ? match : latest;
            }, groupMatches[0]);
            const lastMatchDay = toDate(latestGroupMatch.matchDay);
            const nextMatchDay = addDays(lastMatchDay, 1);

            const batch = adminDb.batch();
            nextRoundFixtures.forEach((fixture, index) => {
                const matchRef = tournamentRef.collection('matches').doc();
                const matchDay = addDays(nextMatchDay, Math.floor(index / 2));
                batch.set(matchRef, {
                    ...fixture,
                    id: matchRef.id,
                    tournamentId,
                    status: 'scheduled',
                    matchDay: Timestamp.fromDate(matchDay),
                });
            });

            await batch.commit();
            revalidatePath(`/tournaments/${tournamentId}`);
            return;
        }
    }

    // Knockout progression (ignore group matches)
    const knockoutMatchesOnly = allMatches.filter(m => isKnockoutRound(m.round));
    if (knockoutMatchesOnly.length === 0) {
        throw new Error("No knockout matches found.");
    }

    const currentRound = getCurrentCupRound(knockoutMatchesOnly);
    assertRoundCompleted(currentRound, knockoutMatchesOnly);
    const winners = getWinnersForRound(knockoutMatchesOnly, currentRound, { penalties: tournament.penalties });

    if (winners.length < 2) {
        throw new Error(`Not enough winners to progress. Need at least 2 teams, got ${winners.length}.`);
    }

    // Determine next round name
    const nextRoundName = getRoundName(winners.length);
    
    // Check if this is the final (only 2 teams left)
    if (winners.length === 2 && currentRound === 'Semi-finals') {
        // This is the final - tournament will complete after this
    } else if (winners.length === 1) {
        throw new Error("Tournament already has a winner. Cannot progress further.");
    }

    // Generate fixtures for next round
    const nextRoundFixtures = generateCupRound(winners, nextRoundName);

    // Find the latest match day to schedule next round after it
    const latestMatch = allMatches.reduce((latest, match) => {
        const matchDate = toDate(match.matchDay);
        const latestDate = toDate(latest.matchDay);
        return matchDate > latestDate ? match : latest;
    }, allMatches[0]);
    
    const lastMatchDay = toDate(latestMatch.matchDay);
    const nextMatchDay = addDays(lastMatchDay, 1); // Schedule next round 1 day after last match

    // Create matches for next round
    const batch = adminDb.batch();
    
    nextRoundFixtures.forEach((fixture, index) => {
        const matchRef = tournamentRef.collection('matches').doc();
        
        // Schedule matches on the same day or spread across days if multiple matches
        const matchDay = addDays(nextMatchDay, Math.floor(index / 2)); // 2 matches per day max
        
        batch.set(matchRef, {
            ...fixture,
            id: matchRef.id,
            tournamentId,
            status: 'scheduled',
            matchDay: Timestamp.fromDate(matchDay),
        });
    });
    
    await batch.commit();

    revalidatePath(`/tournaments/${tournamentId}`);
}

async function triggerAIVerification(tournamentId: string, matchId: string): Promise<VerifyMatchScoresOutput> {
    const matchRef = adminDb.collection('tournaments').doc(tournamentId).collection('matches').doc(matchId);
    const tournamentRef = adminDb.collection('tournaments').doc(tournamentId);

    const [matchDoc, tournamentDoc] = await Promise.all([matchRef.get(), tournamentRef.get()]);
    if (!matchDoc.exists) throw new Error("Match not found for AI verification.");
    if (!tournamentDoc.exists) throw new Error("Tournament not found for AI verification.");

    const match = matchDoc.data() as Match;
    const tournament = tournamentDoc.data() as Tournament;

    const homeTeamDoc = await tournamentRef.collection('teams').doc(match.homeTeamId).get();
    const awayTeamDoc = await tournamentRef.collection('teams').doc(match.awayTeamId).get();
    if (!homeTeamDoc.exists || !awayTeamDoc.exists) throw new Error("Teams not found for AI verification.");

    const evidence = [];
    if (match.homeTeamReport?.evidenceUrl) evidence.push({ type: 'match_stats' as const, imageUri: match.homeTeamReport.evidenceUrl, teamName: homeTeamDoc.data()!.name });
    if (match.awayTeamReport?.evidenceUrl) evidence.push({ type: 'match_stats' as const, imageUri: match.awayTeamReport.evidenceUrl, teamName: awayTeamDoc.data()!.name });
    if (match.homeTeamSecondaryReport?.evidenceUrl) evidence.push({ type: 'match_history' as const, imageUri: match.homeTeamSecondaryReport.evidenceUrl, teamName: homeTeamDoc.data()!.name });
    if (match.awayTeamSecondaryReport?.evidenceUrl) evidence.push({ type: 'match_history' as const, imageUri: match.awayTeamSecondaryReport.evidenceUrl, teamName: awayTeamDoc.data()!.name });

    if (evidence.length === 0) {
        throw new Error("No evidence provided for AI verification.");
    }
    
    const aiInput: VerifyMatchScoresInput = {
        evidence,
        homeTeamName: homeTeamDoc.data()!.name,
        awayTeamName: awayTeamDoc.data()!.name,
        scheduledDate: toAdminDate(match.matchDay).toISOString(),
        roomCodeSetAt: match.roomCodeSetAt ? toAdminDate(match.roomCodeSetAt).toISOString() : undefined,
    };
    
    return await verifyMatchScores(aiInput);
}


export async function submitMatchResult(tournamentId: string, matchId: string, teamId: string, userId: string, formData: FormData) {
    const homeScoreRaw = formData.get('homeScore');
    const awayScoreRaw = formData.get('awayScore');
    const evidenceFile = formData.get('evidence') as File;
    const highlightUrl = formData.get('highlightUrl') as string | null;

    if (homeScoreRaw === null || awayScoreRaw === null || !evidenceFile || evidenceFile.size === 0) {
        throw new Error("Missing score or evidence file.");
    }
    const homeScore = Number(homeScoreRaw);
    const awayScore = Number(awayScoreRaw);

    const evidenceUrl = await uploadFileAndGetPublicURL(`tournaments/${tournamentId}/evidence`, evidenceFile, evidenceFile.type);
    
    const matchRef = adminDb.collection('tournaments').doc(tournamentId).collection('matches').doc(matchId);
    
    const report: Partial<MatchReport> = {
        reportedBy: userId,
        homeScore,
        awayScore,
        evidenceUrl,
        reportedAt: Timestamp.now(),
    };

    if (highlightUrl) {
      report.highlightUrl = highlightUrl;
    }
    
    const matchDoc = await matchRef.get();
    if (!matchDoc.exists) throw new Error("Match not found.");
    const matchData = matchDoc.data() as Match;
    const isHomeTeam = matchData.homeTeamId === teamId;
    
    const updateData: Partial<Match> & { status?: MatchStatus } = {};
    if (isHomeTeam) {
        updateData.homeTeamReport = report as MatchReport;
    } else {
        updateData.awayTeamReport = report as MatchReport;
    }
    
    await matchRef.update(updateData);
    
    const updatedMatchDoc = await matchRef.get();
    const updatedMatchData = updatedMatchDoc.data() as Match;

    // Phase 1 Immediate Processing: If both have submitted primary evidence, trigger AI now.
    if (updatedMatchData.homeTeamReport && updatedMatchData.awayTeamReport) {
      try {
        const result = await triggerAIVerification(tournamentId, matchId);
        await handleAIVerificationResult(tournamentId, matchId, result);
      } catch (error: any) {
        console.error(`AI Verification failed for match ${matchId}:`, error);
        await matchRef.update({ status: 'disputed', resolutionNotes: `AI verification failed: ${error.message}`});
      }
    } else {
      await matchRef.update({ status: 'awaiting_confirmation' });
    }

    revalidatePath(`/tournaments/${tournamentId}`);
}

export async function submitSecondaryEvidence(tournamentId: string, matchId: string, teamId: string, userId: string, formData: FormData) {
    const evidenceFile = formData.get('evidence') as File;
    if (!evidenceFile || evidenceFile.size === 0) throw new Error("Missing evidence file.");

    const evidenceUrl = await uploadFileAndGetPublicURL(`tournaments/${tournamentId}/evidence`, evidenceFile, evidenceFile.type);
    const matchRef = adminDb.collection('tournaments').doc(tournamentId).collection('matches').doc(matchId);

    const report: MatchReport = {
        reportedBy: userId,
        homeScore: -1, 
        awayScore: -1,
        evidenceUrl,
        reportedAt: Timestamp.now(),
    };
    
    const currentMatch = (await matchRef.get()).data() as Match;
    const isHomeTeam = currentMatch.homeTeamId === teamId;
    
    const updateData: Partial<Match> = {};
    if (isHomeTeam) {
        updateData.homeTeamSecondaryReport = report;
    } else {
        updateData.awayTeamSecondaryReport = report;
    }
    await matchRef.update(updateData);

    // Wait for the second report before triggering verification
    if (updatedMatchData.homeTeamSecondaryReport && updatedMatchData.awayTeamSecondaryReport) {
        try {
            const result = await triggerAIVerification(tournamentId, matchId);
            await handleAIVerificationResult(tournamentId, matchId, result);
        } catch (error: any) {
            console.error(`AI Verification failed for match ${matchId}:`, error);
            await matchRef.update({ status: 'disputed', resolutionNotes: `AI verification failed: ${error.message}`});
        }
    }

    revalidatePath(`/tournaments/${tournamentId}`);
}

function calculatePerformancePointsForTeam(match: Match, teamStats: TeamMatchStats, isHomeTeam: boolean): number {
    let points = 0;
    const playerScore = isHomeTeam ? match.homeScore! : match.awayScore!;
    const opponentScore = isHomeTeam ? match.awayScore! : match.homeScore!;

    if (playerScore > opponentScore) points += 10; // Win
    if (playerScore === opponentScore) points += 5; // Draw
    if (opponentScore === 0) points += 5; // Clean Sheet
    points += playerScore; // Each Goal Scored
    if (teamStats.shotsOnTarget) points += Math.floor(teamStats.shotsOnTarget / 2); // Shots on Target
    if (teamStats.interceptions) points += Math.floor(teamStats.interceptions / 10); // Interceptions
    if (teamStats.tackles) points += Math.floor(teamStats.tackles / 5); // Tackles
    if (teamStats.saves) points += teamStats.saves; // Saves
    if (teamStats.possession > 50) points += 2; // Possession
    if (teamStats.passes > 0 && (teamStats.successfulPasses / teamStats.passes) > 0.75) points += 2; // Pass Accuracy
    if (teamStats.fouls === 0 && teamStats.offsides === 0) points += 2; // Fair Play

    return points;
}

async function updatePlayerAndTeamStatsForMatch(tournamentId: string, match: Match, applyStatsPenalty: boolean, forfeitingPlayerId?: string) {
    const tournamentDoc = await adminDb.collection('tournaments').doc(tournamentId).get();
    if (!tournamentDoc.exists) {
        console.error("Tournament not found for stat update");
        return;
    }
    const tournamentName = tournamentDoc.data()!.name;

    const homeTeamRef = adminDb.collection('tournaments').doc(tournamentId).collection('teams').doc(match.homeTeamId);
    const awayTeamRef = adminDb.collection('tournaments').doc(tournamentId).collection('teams').doc(match.awayTeamId);

    const [homeTeamDoc, awayTeamDoc] = await Promise.all([homeTeamRef.get(), awayTeamRef.get()]);
    if (!homeTeamDoc.exists || !awayTeamDoc.exists) {
        console.error("Could not find teams to update stats.");
        return;
    }
    
    const homeTeam = homeTeamDoc.data() as Team;
    const awayTeam = awayTeamDoc.data() as Team;

    let homePerfPoints = 0;
    let awayPerfPoints = 0;
    if (match.homeTeamStats) homePerfPoints = calculatePerformancePointsForTeam(match, match.homeTeamStats, true);
    if (match.awayTeamStats) awayPerfPoints = calculatePerformancePointsForTeam(match, match.awayTeamStats, false);
    
    // Update team performance points
    await Promise.all([
        homeTeamRef.update({ performancePoints: FieldValue.increment(homePerfPoints) }),
        awayTeamRef.update({ performancePoints: FieldValue.increment(awayPerfPoints) }),
    ]);

    const playersToUpdate = [
        { captainId: homeTeam.captainId, isHome: true },
        { captainId: awayTeam.captainId, isHome: false }
    ];

    for (const player of playersToUpdate) {
        await adminDb.runTransaction(async (transaction) => {
            const statsRef = adminDb.collection('playerStats').doc(player.captainId);
            const statsDoc = await transaction.get(statsRef);
            const stats = statsDoc.exists ? statsDoc.data() as PlayerStats : createDefaultPlayerStats(player.captainId);
            
            let localPenalty = applyStatsPenalty || (forfeitingPlayerId === player.captainId);
            updateSinglePlayerStats(stats, tournamentId, tournamentName, match, player.isHome, localPenalty);
            
            transaction.set(statsRef, stats);
        });
    }
}


function createDefaultPlayerStats(uid: string): PlayerStats {
  return {
    uid,
    totalMatches: 0,
    totalWins: 0,
    totalLosses: 0,
    totalDraws: 0,
    totalGoals: 0,
    totalConceded: 0,
    totalCleanSheets: 0,
    avgPossession: 0,
    totalPassPercentageSum: 0,
    matchesWithPassStats: 0,
    totalShots: 0,
    totalShotsOnTarget: 0,
    totalPasses: 0,
    totalTackles: 0,
    totalInterceptions: 0,
    totalSaves: 0,
    performanceHistory: [],
  };
}

function updateSinglePlayerStats(stats: PlayerStats, tournamentId: string, tournamentName: string, match: Match, isHomePlayer: boolean, applyStatsPenalty: boolean) {
  stats.totalMatches++;

  const playerScore = isHomePlayer ? match.homeScore! : match.awayScore!;
  const opponentScore = isHomePlayer ? match.awayScore! : match.homeScore!;

  if (playerScore > opponentScore) stats.totalWins++;
  else if (playerScore < opponentScore) stats.totalLosses++;
  else stats.totalDraws++;

  stats.totalGoals += playerScore;
  stats.totalConceded += opponentScore;
  if (opponentScore === 0) stats.totalCleanSheets++;
  
  const playerMatchStats = isHomePlayer ? match.homeTeamStats : match.awayTeamStats;

  if (playerMatchStats && !applyStatsPenalty) {
      if (playerMatchStats.passes > 0 && playerMatchStats.successfulPasses !== undefined) {
        const passPercentage = (playerMatchStats.successfulPasses / playerMatchStats.passes) * 100;
        stats.totalPassPercentageSum = (stats.totalPassPercentageSum || 0) + passPercentage;
        stats.matchesWithPassStats = (stats.matchesWithPassStats || 0) + 1;
      }
      stats.totalShots += playerMatchStats.shots || 0;
      stats.totalShotsOnTarget += playerMatchStats.shotsOnTarget || 0;
      stats.totalPasses += playerMatchStats.passes || 0;
      stats.totalTackles += playerMatchStats.tackles || 0;
      stats.totalInterceptions += playerMatchStats.interceptions || 0;
      stats.totalSaves += playerMatchStats.saves || 0;
  }
  
  if (stats.matchesWithPassStats > 0) {
    stats.avgPossession = Math.round(stats.totalPassPercentageSum! / stats.matchesWithPassStats);
  } else {
    stats.avgPossession = stats.avgPossession || 0;
  }

  let perfPoint = stats.performanceHistory.find(p => p.tournamentId === tournamentId);
  if (perfPoint) {
      perfPoint.matchesPlayed++;
      perfPoint.goals += playerScore;
  } else {
      stats.performanceHistory.push({
          tournamentId,
          tournamentName,
          goals: playerScore,
          assists: 0, // Placeholder
          matchesPlayed: 1,
      });
  }
}

export async function approveMatchResult(tournamentId: string, matchId: string, homeScore: number, awayScore: number, notes?: string, applyStatsPenalty: boolean = false, homeStats?: TeamMatchStats, awayStats?: TeamMatchStats, forfeitingPlayerId?: string, wasAutoForfeited: boolean = false) {
    const batch = adminDb.batch();
    const matchRef = adminDb.collection('tournaments').doc(tournamentId).collection('matches').doc(matchId);
    
    const matchDoc = await matchRef.get();
    if (!matchDoc.exists) throw new Error("Match not found while trying to approve.");
    const matchData = matchDoc.data() as Match;

    let highlightUrl: string | undefined = undefined;
    
    // Prioritize winner's highlight
    if (homeScore > awayScore) {
        highlightUrl = matchData.homeTeamReport?.highlightUrl || matchData.awayTeamReport?.highlightUrl;
    } else if (awayScore > homeScore) {
        highlightUrl = matchData.awayTeamReport?.highlightUrl || matchData.homeTeamReport?.highlightUrl;
    } else { // On a draw, take home team's first, then away
        highlightUrl = matchData.homeTeamReport?.highlightUrl || matchData.awayTeamReport?.highlightUrl;
    }

    const updateData: any = {
        status: 'approved',
        homeScore,
        awayScore,
        resolutionNotes: notes || "Result approved.",
        wasAutoForfeited,
    };
    if (homeStats) updateData.homeTeamStats = homeStats;
    if (awayStats) updateData.awayStats = awayStats;
    if (highlightUrl) {
      updateData.highlightUrl = highlightUrl;
    }
    
    // Call the summary generation flow
    try {
        const homeTeamDoc = await adminDb.collection('tournaments').doc(tournamentId).collection('teams').doc(matchData.homeTeamId).get();
        const awayTeamDoc = await adminDb.collection('tournaments').doc(tournamentId).collection('teams').doc(matchData.awayTeamId).get();

        if (homeTeamDoc.exists && awayTeamDoc.exists) {
            const summaryInput: GenerateMatchSummaryInput = {
                homeTeam: {
                    name: homeTeamDoc.data()!.name,
                    score: homeScore,
                    shotsOnTarget: homeStats?.shotsOnTarget,
                    possession: homeStats?.possession,
                    saves: homeStats?.saves
                },
                awayTeam: {
                    name: awayTeamDoc.data()!.name,
                    score: awayScore,
                    shotsOnTarget: awayStats?.shotsOnTarget,
                    possession: awayStats?.possession,
                    saves: awayStats?.saves
                }
            };
            const summaryResult = await generateMatchSummary(summaryInput);
            updateData.summary = summaryResult.summary;
        }
    } catch (e) {
        console.error("AI Match Summary generation failed:", e);
        // Do not block match approval if summary fails
    }


    batch.update(matchRef, updateData);
    
    await batch.commit();

    const updatedMatchDoc = await matchRef.get();
    const approvedMatch = updatedMatchDoc.data() as Match;
    await updatePlayerAndTeamStatsForMatch(tournamentId, approvedMatch, applyStatsPenalty, forfeitingPlayerId);
    
    // Check achievements for both players after stats update
    const homeTeamDoc = await adminDb.collection('tournaments').doc(tournamentId).collection('teams').doc(approvedMatch.homeTeamId).get();
    const awayTeamDoc = await adminDb.collection('tournaments').doc(tournamentId).collection('teams').doc(approvedMatch.awayTeamId).get();
    const homeCaptainId = homeTeamDoc.data()?.captainId;
    const awayCaptainId = awayTeamDoc.data()?.captainId;
    if(homeCaptainId) await checkAndAwardAchievements(homeCaptainId);
    if(awayCaptainId) await checkAndAwardAchievements(awayCaptainId);
    
    await updateStandings(tournamentId);

    // Finalize tournament
    // IMPORTANT:
    // - League can complete when all matches are approved
    // - Bracket formats (Cup, Champions League Swiss->Knockout, Double-elimination) should complete ONLY when the Final is approved.
    const tournamentRef = adminDb.collection('tournaments').doc(tournamentId);
    const tournamentData = (await tournamentRef.get()).data() as Tournament | undefined;

    const allMatchesSnapshot = await tournamentRef.collection('matches').get();
    const allMatchesApproved = allMatchesSnapshot.docs.every(doc => doc.data().status === 'approved');

    const finalMatchDoc = allMatchesSnapshot.docs.find(doc => (doc.data().round || '').toLowerCase() === 'final');
    const finalApproved = !!finalMatchDoc && finalMatchDoc.data().status === 'approved';

    const shouldComplete =
        tournamentData?.format === 'league'
            ? allMatchesApproved
            : finalApproved;

    if (shouldComplete) {
        await tournamentRef.update({ status: 'completed' });
        await awardBadges(tournamentId);

        if (tournamentData) {
            const organizerNotification: Omit<Notification, 'id' | 'createdAt' | 'isRead'> = {
                userId: tournamentData.organizerId,
                tournamentId,
                title: `"${tournamentData.name}" has concluded!`,
                body: "The tournament is complete. Check out the results and rewards.",
                href: `/tournaments/${tournamentId}?tab=standings`,
            };
            await sendNotification(tournamentData.organizerId, organizerNotification);
        }
    }

    revalidatePath(`/tournaments/${tournamentId}`);
}

export async function deleteMatchReport(tournamentId: string, matchId: string, userId: string) {
    const matchRef = adminDb.collection('tournaments').doc(tournamentId).collection('matches').doc(matchId);
    const matchDoc = await matchRef.get();
    if (!matchDoc.exists) throw new Error("Match not found.");
    
    const matchData = matchDoc.data() as Match;
    
    const updateData: any = { status: 'scheduled' };
    if (matchData.homeTeamReport?.reportedBy === userId) {
        updateData.homeTeamReport = FieldValue.delete();
    }
    if (matchData.awayTeamReport?.reportedBy === userId) {
        updateData.awayTeamReport = FieldValue.delete();
    }
    
    await matchRef.update(updateData);
    revalidatePath(`/tournaments/${tournamentId}`);
}

export async function scheduleRematch(tournamentId: string, matchId: string, notes: string) {
    const matchRef = adminDb.collection('tournaments').doc(tournamentId).collection('matches').doc(matchId);
    const matchDoc = await matchRef.get();
    if (!matchDoc.exists) throw new Error("Match not found");
    const matchData = matchDoc.data() as Match;
    
    const tournamentRef = adminDb.collection('tournaments').doc(tournamentId);
    const tournamentDoc = await tournamentRef.get();
    if (!tournamentDoc.exists) throw new Error("Tournament not found");
    const tournamentData = tournamentDoc.data() as Tournament;

    let newMatchDay: Date;

    if (tournamentData.format === 'cup') {
        newMatchDay = toAdminDate(matchData.matchDay); // Replay on the same day for cups
    } else { // League format
        const allMatchesSnapshot = await tournamentRef.collection('matches').orderBy('matchDay', 'desc').get();
        const lastMatchDay = allMatchesSnapshot.empty ? toAdminDate(tournamentData.tournamentStartDate) : toAdminDate(allMatchesSnapshot.docs[0].data().matchDay);
        newMatchDay = addDays(lastMatchDay, 1);
        if(isAfter(newMatchDay, toAdminDate(tournamentData.tournamentEndDate))) {
            // If the new date is past the end date, just schedule it for the last day
            newMatchDay = toAdminDate(tournamentData.tournamentEndDate);
        }
    }
    
    await matchRef.update({
        status: 'scheduled',
        homeScore: null,
        awayScore: null,
        homeTeamReport: FieldValue.delete(),
        awayTeamReport: FieldValue.delete(),
        homeTeamSecondaryReport: FieldValue.delete(),
        awayTeamSecondaryReport: FieldValue.delete(),
        homeTeamStats: FieldValue.delete(),
        awayTeamStats: FieldValue.delete(),
        resolutionNotes: `Rematch ordered: ${notes}`,
        wasAutoForfeited: false,
        replayRequest: FieldValue.delete(),
        matchDay: Timestamp.fromDate(newMatchDay),
        isReplay: true,
    });

    const homeTeamDoc = await adminDb.collection('tournaments').doc(tournamentId).collection('teams').doc(matchData.homeTeamId).get();
    const awayTeamDoc = await adminDb.collection('tournaments').doc(tournamentId).collection('teams').doc(matchData.awayTeamId).get();
    
    const homeTeamCaptainId = homeTeamDoc.data()?.captainId;
    const awayTeamCaptainId = awayTeamDoc.data()?.captainId;

    const notification = {
        tournamentId,
        title: "Rematch Ordered!",
        body: `Your match has been reset. Please play again on ${format(newMatchDay, 'PPP')}.`,
        href: `/tournaments/${tournamentId}?tab=my-matches`,
    };

    if(homeTeamCaptainId) await sendNotification(homeTeamCaptainId, {...notification, userId: homeTeamCaptainId, body: `Your match vs ${awayTeamDoc.data()?.name} has been reset. Please play again on ${format(newMatchDay, 'PPP')}. Reason: ${notes}`});
    if(awayTeamCaptainId) await sendNotification(awayTeamCaptainId, {...notification, userId: awayTeamCaptainId, body: `Your match vs ${homeTeamDoc.data()?.name} has been reset. Please play again on ${format(newMatchDay, 'PPP')}. Reason: ${notes}`});
    
    revalidatePath(`/tournaments/${tournamentId}`);
}

function revertSinglePlayerStats(stats: PlayerStats, tournamentId: string, tournamentName: string, match: Match, isHomePlayer: boolean) {
    if (!match || match.homeScore === null || match.awayScore === null) return;
    
    if (stats.totalMatches > 0) stats.totalMatches--;

    const homeScore = match.homeScore!;
    const awayScore = match.awayScore!;

    const goalsFor = isHomePlayer ? homeScore : awayScore;
    const goalsAgainst = isHomePlayer ? awayScore : homeScore;

    if (goalsFor > goalsAgainst) {
        if (stats.totalWins > 0) stats.totalWins--;
    } else if (goalsFor < goalsAgainst) {
        if (stats.totalLosses > 0) stats.totalLosses--;
    } else {
        if (stats.totalDraws > 0) stats.totalDraws--;
    }

    stats.totalGoals = Math.max(0, stats.totalGoals - goalsFor);
    stats.totalConceded = Math.max(0, (stats.totalConceded || 0) - goalsAgainst);

    if (goalsAgainst === 0 && stats.totalCleanSheets > 0) {
        stats.totalCleanSheets--;
    }

    const playerMatchStats = isHomePlayer ? match.homeTeamStats : match.awayTeamStats;

    if (playerMatchStats) {
        if (playerMatchStats.passes > 0 && playerMatchStats.successfulPasses !== undefined) {
            const passPercentage = (playerMatchStats.successfulPasses / playerMatchStats.passes) * 100;
            if (stats.totalPassPercentageSum) stats.totalPassPercentageSum -= passPercentage;
            if (stats.matchesWithPassStats) stats.matchesWithPassStats -= 1;
        }
        stats.totalShots = Math.max(0, stats.totalShots - (playerMatchStats.shots || 0));
        stats.totalShotsOnTarget = Math.max(0, stats.totalShotsOnTarget - (playerMatchStats.shotsOnTarget || 0));
        stats.totalPasses = Math.max(0, stats.totalPasses - (playerMatchStats.passes || 0));
        stats.totalTackles = Math.max(0, stats.totalTackles - (playerMatchStats.tackles || 0));
        stats.totalInterceptions = Math.max(0, stats.totalInterceptions - (playerMatchStats.interceptions || 0));
        stats.totalSaves = Math.max(0, stats.totalSaves - (playerMatchStats.saves || 0));
    }
    
    if (stats.matchesWithPassStats && stats.matchesWithPassStats > 0) {
        stats.avgPossession = Math.round(stats.totalPassPercentageSum! / stats.matchesWithPassStats);
    } else {
        stats.avgPossession = 0;
    }

    let perfPoint = stats.performanceHistory.find(p => p.tournamentId === tournamentId);
    if (perfPoint) {
        if (perfPoint.matchesPlayed > 1) {
            perfPoint.matchesPlayed--;
            perfPoint.goals = Math.max(0, perfPoint.goals - goalsFor);
        } else {
            // Remove the performance point if this was the only match
            stats.performanceHistory = stats.performanceHistory.filter(p => p.tournamentId !== tournamentId);
        }
    }
}

function revertTeamPerformancePoints(match: Match, isHomeTeam: boolean) {
    if (!match || match.homeScore === null || match.awayScore === null) return 0;
    const teamStats = isHomeTeam ? match.homeTeamStats : match.awayTeamStats;
    if (!teamStats) return 0;
    return calculatePerformancePointsForTeam(match, teamStats, isHomeTeam);
}

export async function organizerForceReplay(tournamentId: string, matchId: string, organizerId: string, reason: string) {
    const tournamentRef = adminDb.collection('tournaments').doc(tournamentId);
    const matchRef = tournamentRef.collection('matches').doc(matchId);

    // --- Transaction Phase ---
    await adminDb.runTransaction(async (transaction) => {
        // --- READS ---
        const tournamentDoc = await transaction.get(tournamentRef);
        if (!tournamentDoc.exists || tournamentDoc.data()?.organizerId !== organizerId) {
            throw new Error("You are not authorized to perform this action.");
        }
        const tournament = tournamentDoc.data() as Tournament;

        const matchDoc = await transaction.get(matchRef);
        if (!matchDoc.exists) throw new Error("Match not found.");
        const match = matchDoc.data() as Match;

        let homeCaptainStats: PlayerStats | undefined;
        let awayCaptainStats: PlayerStats | undefined;
        let homeTeamDoc;
        let awayTeamDoc;
        
        if (match.status === 'approved') {
            const homeTeamRef = tournamentRef.collection('teams').doc(match.homeTeamId);
            const awayTeamRef = tournamentRef.collection('teams').doc(match.awayTeamId);
            homeTeamDoc = await transaction.get(homeTeamRef);
            awayTeamDoc = await transaction.get(awayTeamRef);

            if (homeTeamDoc.exists && awayTeamDoc.exists) {
                const homeTeam = homeTeamDoc.data() as Team;
                const awayTeam = awayTeamDoc.data() as Team;

                const homeCaptainStatsDoc = await transaction.get(adminDb.collection('playerStats').doc(homeTeam.captainId));
                const awayCaptainStatsDoc = await transaction.get(adminDb.collection('playerStats').doc(awayTeam.captainId));

                if (homeCaptainStatsDoc.exists) homeCaptainStats = homeCaptainStatsDoc.data() as PlayerStats;
                if (awayCaptainStatsDoc.exists) awayCaptainStats = awayCaptainStatsDoc.data() as PlayerStats;
            }
        }

        // --- COMPUTES (In Memory) ---
        if (homeCaptainStats && homeTeamDoc?.exists) {
            revertSinglePlayerStats(homeCaptainStats, tournamentId, tournament.name, match, true);
        }
        if (awayCaptainStats && awayTeamDoc?.exists) {
            revertSinglePlayerStats(awayCaptainStats, tournamentId, tournament.name, match, false);
        }

        // --- WRITES ---
        if (homeCaptainStats && homeTeamDoc?.exists) {
            const homeStatsRef = adminDb.collection('playerStats').doc((homeTeamDoc.data() as Team).captainId);
            transaction.set(homeStatsRef, homeCaptainStats);
            const homeTeamRef = tournamentRef.collection('teams').doc(match.homeTeamId);
            const pointsToRevert = revertTeamPerformancePoints(match, true);
            transaction.update(homeTeamRef, { performancePoints: FieldValue.increment(-pointsToRevert) });
        }
        if (awayCaptainStats && awayTeamDoc?.exists) {
            const awayStatsRef = adminDb.collection('playerStats').doc((awayTeamDoc.data() as Team).captainId);
            transaction.set(awayStatsRef, awayCaptainStats);
            const awayTeamRef = tournamentRef.collection('teams').doc(match.awayTeamId);
            const pointsToRevert = revertTeamPerformancePoints(match, false);
            transaction.update(awayTeamRef, { performancePoints: FieldValue.increment(-pointsToRevert) });
        }
        
        transaction.update(matchRef, {
            status: 'scheduled',
            homeScore: null,
            awayScore: null,
            homeTeamReport: FieldValue.delete(),
            awayTeamReport: FieldValue.delete(),
            homeTeamSecondaryReport: FieldValue.delete(),
            awayTeamSecondaryReport: FieldValue.delete(),
            homeTeamStats: FieldValue.delete(),
            awayTeamStats: FieldValue.delete(),
            resolutionNotes: `Organizer forced replay: ${reason}`,
            wasAutoForfeited: false,
            replayRequest: FieldValue.delete(),
            matchDay: Timestamp.fromDate(toAdminDate(match.matchDay)),
            isReplay: true,
        });
    });
    
    await updateStandings(tournamentId);
    revalidatePath(`/tournaments/${tournamentId}`);
}

export async function updateStandings(tournamentId: string) {
    const tournamentDoc = await adminDb.collection('tournaments').doc(tournamentId).get();
    const tournament = tournamentDoc.exists ? (tournamentDoc.data() as Tournament) : null;
    const teamsSnapshot = await adminDb.collection('tournaments').doc(tournamentId).collection('teams').get();
    if (teamsSnapshot.empty) return;

    const teamStatsList = teamsSnapshot.docs.map(doc => ({
        teamId: doc.id,
        matchesPlayed: 0,
        wins: 0,
        losses: 0,
        draws: 0,
        goalsFor: 0,
        goalsAgainst: 0,
        points: 0,
        cleanSheets: 0
    }));

    let matchesQuery = adminDb.collection('tournaments').doc(tournamentId).collection('matches')
        .where('status', '==', 'approved');

    const matchesSnapshot = await matchesQuery.get();
    
    matchesSnapshot.docs.forEach(doc => {
        const match = doc.data() as Match;
        if (match.homeScore === null || match.awayScore === null) return;
        
        const homeStats = teamStatsList.find(s => s.teamId === match.homeTeamId);
        const awayStats = teamStatsList.find(s => s.teamId === match.awayTeamId);

        if (!homeStats || !awayStats) return;

        homeStats.matchesPlayed++;
        awayStats.matchesPlayed++;
        homeStats.goalsFor += match.homeScore;
        awayStats.goalsFor += match.awayScore;
        homeStats.goalsAgainst += match.awayScore;
        awayStats.goalsAgainst += match.homeScore;

        if (match.homeScore > match.awayScore) {
            homeStats.wins++;
            homeStats.points += 3;
            awayStats.losses++;
        } else if (match.awayScore > match.homeScore) {
            awayStats.wins++;
            awayStats.points += 3;
            homeStats.losses++;
        } else {
            homeStats.draws++;
            awayStats.draws++;
            homeStats.points++;
            awayStats.points++;
        }

        if (match.awayScore === 0) homeStats.cleanSheets++;
        if (match.homeScore === 0) awayStats.cleanSheets++;
    });

    const goalDifferences = new Map<string, number>();
    teamStatsList.forEach(team => {
        goalDifferences.set(team.teamId, team.goalsFor - team.goalsAgainst);
    });

    teamStatsList.sort((a, b) => {
        if (b.points !== a.points) return b.points - a.points;
        const gdA = goalDifferences.get(a.teamId) ?? 0;
        const gdB = goalDifferences.get(b.teamId) ?? 0;
        if (gdB !== gdA) return gdB - gdA;
        if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
        return a.wins - b.wins;
    });

    const batch = adminDb.batch();
    const standingsRef = adminDb.collection('standings');
    
    const oldStandingsSnapshot = await standingsRef.where('tournamentId', '==', tournamentId).get();
    oldStandingsSnapshot.docs.forEach(doc => batch.delete(doc.ref));

    teamStatsList.forEach((team, index) => {
        const docRef = standingsRef.doc(`${tournamentId}_${team.teamId}`);
        const standingData = {
            ...team,
            tournamentId,
            ranking: index + 1
        };
        batch.set(docRef, standingData);
    });

    await batch.commit();
    revalidatePath(`/tournaments/${tournamentId}`);
}


async function resolveOverdueMatches(tournamentId: string) {
    const tournamentRef = adminDb.collection('tournaments').doc(tournamentId);
    
    const overdueSnapshot = await tournamentRef.collection('matches')
        .where('status', 'in', ['scheduled', 'awaiting_confirmation', 'needs_secondary_evidence', 'disputed'])
        .get();

    if (overdueSnapshot.empty) return 0;
    
    const tournamentDoc = await tournamentRef.get();
    if (!tournamentDoc.exists) return 0;
    const tournament = tournamentDoc.data() as Tournament;
    
    let resolvedCount = 0;
    for (const doc of overdueSnapshot.docs) {
        const match = doc.data() as Match;
        
        // Match day must be fully in the past.
        if (!isPast(endOfDay(toAdminDate(match.matchDay)))) {
            continue;
        }

        resolvedCount++;
        try {
            // CUP REPLAY FORFEIT LOGIC
            if (match.isReplay && tournament.format === 'cup') {
                await approveMatchResult(tournamentId, doc.id, 0, 0, 'Double forfeit. Replay was not completed by the match day deadline.', true, undefined, undefined, undefined, true);
                continue;
            }

            // Both players failed to submit anything.
            if (match.status === 'scheduled') {
                await approveMatchResult(tournamentId, doc.id, 0, 0, 'Match recorded as 0-0 draw due to no reports submitted.', true, undefined, undefined, undefined, true);
            } 
            // Only one player submitted a primary report.
            else if (match.status === 'awaiting_confirmation') {
                const result = await triggerAIVerification(tournamentId, doc.id);
                // Even with one screenshot, the AI should be able to verify it and extract stats.
                // We award a 3-0 forfeit win to the player who submitted.
                const submittingPlayerIsHome = !!match.homeTeamReport;
                await approveMatchResult(
                    tournamentId, 
                    doc.id, 
                    submittingPlayerIsHome ? 3 : 0, 
                    submittingPlayerIsHome ? 0 : 3, 
                    'Approved by forfeit. Opponent failed to report in time.', 
                    false, // Do not apply stats penalty to the winner
                    result.homeStats, 
                    result.awayStats, 
                    submittingPlayerIsHome ? match.awayTeamId : match.homeTeamId, 
                    true
                );
            } 
            // Players submitted conflicting primary/secondary reports, but failed to resolve by deadline.
            else if (match.status === 'needs_secondary_evidence' || match.status === 'disputed') {
                const result = await triggerAIVerification(tournamentId, doc.id);
                await handleAIVerificationResult(tournamentId, doc.id, result);
            }
        } catch (error: any) {
             console.error(`Failed to resolve overdue match ${doc.id}:`, error);
             const safeErrorMessage = `Automated resolution failed. Organizer review required.`.substring(0, 200);
             try {
                 await doc.ref.update({ status: 'disputed', resolutionNotes: safeErrorMessage });
             } catch (updateError) {
                 console.error(`Failed to even update match ${doc.id} to disputed status:`, updateError);
             }
        }
    }
    return resolvedCount;
}

export async function organizerResolveOverdueMatches(tournamentId: string, organizerId: string) {
    const tournamentRef = adminDb.collection('tournaments').doc(tournamentId);
    const tournamentDoc = await tournamentRef.get();
    if (!tournamentDoc.exists || tournamentDoc.data()?.organizerId !== organizerId) {
        throw new Error("You are not authorized to perform this action.");
    }
    
    // Prevent spamming the function
    const lastResolved = tournamentDoc.data()?.lastAutoResolvedAt;
    if (lastResolved) {
        const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000); 
        if (toAdminDate(lastResolved) > fifteenMinutesAgo) {
            throw new Error("Resolution can only be run once every 15 minutes to ensure stability.");
        }
    }
    await tournamentRef.update({ lastAutoResolvedAt: FieldValue.serverTimestamp() });
    
    const count = await resolveOverdueMatches(tournamentId);
    
    if (count > 0) {
        revalidatePath(`/tournaments/${tournamentId}`);
    }
    return count;
}


async function handleAIVerificationResult(tournamentId: string, matchId: string, result: VerifyMatchScoresOutput) {
    const matchRef = adminDb.collection('tournaments').doc(tournamentId).collection('matches').doc(matchId);
    
    if (result.cheatingFlag) {
        const userToWarnRef = adminDb.collection('users').doc(result.cheatingFlag);
        await userToWarnRef.update({
            warnings: FieldValue.increment(1),
            incidentLog: FieldValue.arrayUnion({
                reason: "AI flagged submission of falsified match evidence.",
                date: FieldValue.serverTimestamp(),
                tournamentId: tournamentId,
            })
        });
    }

    if (result.verificationStatus === 'verified' && result.verifiedScores) {
        const applyStatsPenalty = !result.homeStats || !result.awayStats;
        await approveMatchResult(tournamentId, matchId, result.verifiedScores.homeScore, result.verifiedScores.awayScore, `AI: ${result.reasoning}`, applyStatsPenalty, result.homeStats, result.awayStats, undefined, false);
    } else if (result.verificationStatus === 'needs_secondary_evidence') {
        await matchRef.update({ status: 'needs_secondary_evidence', resolutionNotes: `AI: ${result.reasoning}` });
    } else if (result.verificationStatus === 'replay_required') {
        await scheduleRematch(tournamentId, matchId, `AI: ${result.reasoning}`);
    } else { // 'disputed'
        await matchRef.update({ status: 'disputed', resolutionNotes: `AI Review Failed: ${result.reasoning}` });
    }
}


// Communication Actions
export async function postTournamentMessage(tournamentId: string, userId: string, username: string, photoURL: string, message: string) {
    const chatRef = adminDb.collection('tournaments').doc(tournamentId).collection('messages');
    await chatRef.add({ tournamentId, userId, username, photoURL: photoURL || '', message, timestamp: FieldValue.serverTimestamp() });
}

export async function postTeamMessage(tournamentId: string, teamId: string, userId: string, username: string, photoURL: string, message: string) {
    const chatRef = adminDb.collection('tournaments').doc(tournamentId).collection('teams').doc(teamId).collection('messages');
    await chatRef.add({ tournamentId, teamId, userId, username, photoURL: photoURL || '', message, timestamp: FieldValue.serverTimestamp() });
}

export async function postMatchMessage(tournamentId: string, matchId: string, userId: string, username: string, photoURL: string, message: string) {
    const chatRef = adminDb.collection('tournaments').doc(tournamentId).collection('matches').doc(matchId).collection('messages');
    await chatRef.add({ tournamentId, matchId, userId, username, photoURL: photoURL || '', message, timestamp: FieldValue.serverTimestamp() });
}

export async function postAnnouncement(tournamentId: string, organizerId: string, title: string, content: string) {
    const announcementRef = adminDb.collection('tournaments').doc(tournamentId).collection('announcements');
    await announcementRef.add({
        tournamentId,
        organizerId,
        title,
        content,
        timestamp: FieldValue.serverTimestamp(),
    });

    const teamsSnapshot = await adminDb.collection('tournaments').doc(tournamentId).collection('teams').get();
    const allPlayerIds = teamsSnapshot.docs.flatMap(doc => (doc.data() as Team).playerIds);
    const uniquePlayerIds = [...new Set(allPlayerIds)];

    for (const userId of uniquePlayerIds) {
        await sendNotification(userId, {
            userId,
            tournamentId,
            title: `New Announcement: ${title}`,
            body: content.substring(0, 100),
            href: `/tournaments/${tournamentId}?tab=chat`
        });
    }
}

// Direct Messaging Actions
export async function getUsersByIds(uids: string[]): Promise<UserProfile[]> {
  if (!uids || uids.length === 0) {
    return [];
  }
  const users: UserProfile[] = [];
  // Firestore 'in' query limit is 30
  for (let i = 0; i < uids.length; i += 30) {
    const chunk = uids.slice(i, i + 30);
    if(chunk.length > 0) {
        const snapshot = await adminDb.collection('users').where('uid', 'in', chunk).get();
        snapshot.forEach(doc => {
            users.push({ uid: doc.id, ...doc.data() } as UserProfile);
        });
    }
  }
  return serializeData(users);
}

export async function startConversation(userId1: string, userId2: string): Promise<string> {
    if (userId1 === userId2) {
        throw new Error("Cannot start a conversation with yourself.");
    }
    
    const participants = [userId1, userId2].sort();
    const conversationId = participants.join('_');

    const conversationRef = adminDb.collection('conversations').doc(conversationId);
    const doc = await conversationRef.get();

    if (!doc.exists) {
        await conversationRef.set({
            participantIds: participants,
            createdAt: FieldValue.serverTimestamp(),
            lastMessage: null,
        });
    }

    return conversationId;
}

export async function getConversationsForUser(userId: string): Promise<Conversation[]> {
    const conversationsRef = adminDb.collection('conversations');
    const snapshot = await conversationsRef
        .where('participantIds', 'array-contains', userId)
        .orderBy('lastMessage.timestamp', 'desc')
        .get();

    if (snapshot.empty) {
        return [];
    }

    const conversations: Conversation[] = await Promise.all(snapshot.docs.map(async (doc) => {
        const data = doc.data();
        
        const participantProfiles = await Promise.all(
            data.participantIds.map((id: string) => getUserProfileById(id))
        );

        return {
            id: doc.id,
            participantIds: data.participantIds,
            createdAt: data.createdAt,
            lastMessage: data.lastMessage,
            participants: participantProfiles.filter(p => p !== null) as UserProfile[],
        };
    }));

    return serializeData(conversations);
}

export async function getConversationById(conversationId: string, currentUserId: string): Promise<Omit<Conversation, 'messages'> | null> {
    const conversationRef = adminDb.collection('conversations').doc(conversationId);
    const conversationDoc = await conversationRef.get();

    if (!conversationDoc.exists) return null;
    
    const conversationData = conversationDoc.data();
    if (!conversationData) return null;

    if (!conversationData.participantIds.includes(currentUserId)) {
        throw new Error("You are not authorized to view this conversation.");
    }
    
    const participantProfiles = await Promise.all(
        conversationData.participantIds.map((id: string) => getUserProfileById(id))
    );

    const conversationDetails: Omit<Conversation, 'messages'> = {
        id: conversationDoc.id,
        participantIds: conversationData.participantIds,
        createdAt: conversationData.createdAt,
        lastMessage: conversationData.lastMessage,
        participants: participantProfiles.filter(p => p !== null) as UserProfile[],
    };

    return serializeData(conversationDetails);
}

export async function postDirectMessage(conversationId: string, messageText: string, senderId: string) {
    const userProfile = await getUserProfileById(senderId);
    if (!userProfile) throw new Error("Sender profile not found.");

    const conversationRef = adminDb.collection('conversations').doc(conversationId);
    const messageRef = conversationRef.collection('messages').doc();

    const timestamp = FieldValue.serverTimestamp();

    const newMessage: Omit<ChatMessage, 'id' | 'timestamp'> = {
        message: messageText,
        userId: senderId,
        username: userProfile.username || 'User',
        photoURL: userProfile.photoURL || '',
    };

    const batch = adminDb.batch();
    batch.set(messageRef, { ...newMessage, timestamp });
    batch.update(conversationRef, {
        lastMessage: {
            message: messageText,
            timestamp: timestamp,
        }
    });
    
    await batch.commit();

    const recipientId = (await conversationRef.get()).data()?.participantIds.find((id: string) => id !== senderId);
    if (recipientId) {
        await sendNotification(recipientId, {
            userId: recipientId,
            title: `New message from ${userProfile.username}`,
            body: messageText,
            href: `/messages/${conversationId}`
        });
        await sendPushNotification(recipientId, {
            title: `New message from ${userProfile.username}`,
            body: messageText,
            url: `/messages/${conversationId}`,
        });
    }
}

// Notifications
export async function markNotificationsAsRead(userId: string) {
    const notificationsRef = adminDb.collection('users').doc(userId).collection('notifications');
    const snapshot = await notificationsRef.where('isRead', '==', false).get();
    if (snapshot.empty) return;

    const batch = adminDb.batch();
    snapshot.docs.forEach(doc => {
        batch.update(doc.ref, { isRead: true });
    });
    await batch.commit();
}


// Rewards
export async function getPrizeDistribution(tournamentId: string): Promise<PrizeDistributionItem[]> {
    const tournamentDoc = await getTournamentById(tournamentId);
    if (!tournamentDoc || !tournamentDoc.rewardDetails || tournamentDoc.rewardDetails.type === 'virtual') {
        return [];
    }
    const prizePool = tournamentDoc.rewardDetails.prizePool;
    const allocation = tournamentDoc.rewardDetails.prizeAllocation || {
        first_place: 35,
        second_place: 20,
        third_place: 15,
        best_overall: 10,
        highest_scoring: 5,
        best_defensive: 5,
        best_attacking: 5,
    };
    
    const distributablePool = prizePool * 0.95; // After 5% platform fee
    
    const awards = await getTournamentAwards(tournamentId);
    
    const distribution: PrizeDistributionItem[] = [];

    const rankCategories = [
        { key: 'first_place', rank: 1, label: '1st Place' },
        { key: 'second_place', rank: 2, label: '2nd Place' },
        { key: 'third_place', rank: 3, label: '3rd Place' }
    ];

    const standingsSnapshot = await adminDb.collection('standings')
        .where('tournamentId', '==', tournamentId)
        .where('ranking', 'in', [1, 2, 3])
        .get();
        
    const standingsByRank = new Map<number, Standing>();
    standingsSnapshot.forEach(doc => {
        const s = doc.data() as Standing;
        standingsByRank.set(s.ranking, s);
    });

    for (const cat of rankCategories) {
        const standing = standingsByRank.get(cat.rank);
        const teamDoc = standing ? await adminDb.collection('tournaments').doc(tournamentId).collection('teams').doc(standing.teamId).get() : null;

        distribution.push({
            category: cat.label,
            percentage: (allocation as any)[cat.key],
            amount: distributablePool * ((allocation as any)[cat.key] / 100),
            winner: teamDoc?.exists ? {
                teamId: teamDoc.id,
                teamName: teamDoc.data()!.name,
                logoUrl: teamDoc.data()!.logoUrl,
                captainId: teamDoc.data()!.captainId,
            } : null,
        });
    }
    
    const specialAwardCategories = [
        { key: 'best_overall', label: 'Best Overall Team', awardKey: 'bestOverall' },
        { key: 'highest_scoring', label: 'Highest Scoring Team', awardKey: 'highestScoring' },
        { key: 'best_defensive', label: 'Best Defensive Team', awardKey: 'bestDefensive' },
        { key: 'best_attacking', label: 'Best Attacking Team', awardKey: 'bestAttacking' },
    ];
    
    for (const cat of specialAwardCategories) {
        const award = (awards as any)[cat.awardKey];
        distribution.push({
            category: cat.label,
            percentage: (allocation as any)[cat.key],
            amount: distributablePool * ((allocation as any)[cat.key] / 100),
            winner: award ? {
                teamId: award.team.id,
                teamName: award.team.name,
                logoUrl: award.team.logoUrl,
                captainId: award.team.captainId,
            } : null,
        });
    }

    return serializeData(distribution);
}

export async function getTournamentAwards(tournamentId: string): Promise<Record<string, TournamentAward>> {
    const teamsSnapshot = await adminDb.collection('tournaments').doc(tournamentId).collection('teams').get();
    if(teamsSnapshot.empty) return {};

    const teams = teamsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Team));
    const standingsSnapshot = await adminDb.collection('standings').where('tournamentId', '==', tournamentId).get();
    const standings = standingsSnapshot.docs.map(doc => doc.data() as Standing);

    const awards: Record<string, TournamentAward> = {};
    
    if (standings.length > 0) {
        // Best Overall Team
        const bestOverall = teams.reduce((prev, current) => ((prev.performancePoints || 0) > (current.performancePoints || 0)) ? prev : current, teams[0]);
        if(bestOverall) {
            awards.bestOverall = { awardTitle: 'Best Overall Team', team: bestOverall, reason: `${bestOverall.performancePoints || 0} Performance Points`};
        }

        // Highest Scoring
        const highestScoringStanding = standings.reduce((prev, current) => (prev.goalsFor > current.goalsFor) ? prev : current, standings[0] || {});
        const highestScoringTeam = teams.find(t => t.id === highestScoringStanding.teamId);
        if(highestScoringTeam) {
            awards.highestScoring = { awardTitle: 'Highest Scoring Team', team: highestScoringTeam, reason: `${highestScoringStanding.goalsFor} Goals Scored`};
        }
        
        // Best Defense
        const bestDefensiveStanding = standings.sort((a,b) => a.goalsAgainst - b.goalsAgainst || b.cleanSheets - a.cleanSheets)[0];
        const bestDefensiveTeam = teams.find(t => t.id === bestDefensiveStanding.teamId);
        if(bestDefensiveTeam) {
            awards.bestDefensive = { awardTitle: 'Best Defensive Team', team: bestDefensiveTeam, reason: `${bestDefensiveStanding.goalsAgainst} Goals Conceded, ${bestDefensiveStanding.cleanSheets} Clean Sheets`};
        }

        // Best Attacking (requires iterating matches)
        const matchesSnapshot = await adminDb.collection('tournaments').doc(tournamentId).collection('matches').where('status', '==', 'approved').get();
        const matches = matchesSnapshot.docs.map(d => d.data() as Match);

        let bestAttackingScore = -1;
        let bestAttackingTeamId = '';
        
        for (const team of teams) {
            let attackingScore = 0;
            const teamMatches = matches.filter(m => m.homeTeamId === team.id || m.awayTeamId === team.id);
            for(const match of teamMatches) {
                const isHome = match.homeTeamId === team.id;
                const goals = isHome ? match.homeScore : match.awayScore;
                const stats = isHome ? match.homeTeamStats : match.awayTeamStats;
                if(goals === null || !stats) continue;
                
                const passAccuracyBonus = (stats.passes > 0 && (stats.successfulPasses / stats.passes) > 0.75) ? 1 : 0;
                attackingScore += (goals * 5) + (stats.shotsOnTarget * 2) + (passAccuracyBonus * 3);
            }
            if(attackingScore > bestAttackingScore) {
                bestAttackingScore = attackingScore;
                bestAttackingTeamId = team.id;
            }
        }
        
        const bestAttackingTeam = teams.find(t => t.id === bestAttackingTeamId);
        if(bestAttackingTeam) {
            awards.bestAttacking = { awardTitle: 'Best Attacking Team', team: bestAttackingTeam, reason: `${Math.round(bestAttackingScore)} Attack Score`};
        }
    }

    return serializeData(awards);
}


export async function initiatePayouts(tournamentId: string) {
    const tournamentRef = adminDb.collection('tournaments').doc(tournamentId);
    const tournamentDoc = await tournamentRef.get();
    if (!tournamentDoc.exists) throw new Error("Tournament not found.");
    const tournament = tournamentDoc.data() as Tournament;

    if (tournament.status !== 'completed') throw new Error("Tournament is not yet complete.");

    // Pay platform fee only on the first run
    if (!tournament.payoutInitiated) {
        const prizePool = tournament.rewardDetails.prizePool;
        const platformFee = prizePool * 0.05;
        await adminDb.collection('platformSummary').doc('summary').set({
            totalPlatformFees: FieldValue.increment(platformFee),
            lastUpdated: FieldValue.serverTimestamp(),
        }, { merge: true });
    }

    const distribution = await getPrizeDistribution(tournamentId);
    const existingPayouts = new Set((tournament.payoutLog || []).map(p => p.category));
    const payoutsToProcess = distribution.filter(item => !existingPayouts.has(item.category));
    
    if (payoutsToProcess.length === 0) {
        throw new Error("No pending payouts to process.");
    }

    const newLogEntries: any[] = [];
    const userRef = adminDb.collection('users');

    for (const item of payoutsToProcess) {
        if (!item.winner || !item.winner.captainId) {
            console.log(`Skipping payout for ${item.category}: No winner found.`);
            continue;
        };

        const winnerId = item.winner.captainId;
        const winnerDoc = await userRef.doc(winnerId).get();
        if (!winnerDoc.exists) {
            console.error(`Winner profile not found for ID: ${winnerId}`);
            continue;
        };

        const userProfile = winnerDoc.data() as UserProfile;
        if (!userProfile.bankDetails?.confirmedForPayout) {
            await sendNotification(winnerId, {
                userId: winnerId,
                title: "Action Required for Payout",
                body: `Please confirm your bank details in your profile to receive your ₦${item.amount.toLocaleString()} prize from ${tournament.name}.`,
                href: "/profile",
            });
            continue;
        }

        const bankDetails = userProfile.bankDetails;
        let recipientCode = bankDetails.recipientCode;

        if (!recipientCode) {
            const recipientResponse = await fetch('https://api.paystack.co/transferrecipient', {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    type: "nuban",
                    name: bankDetails.accountName,
                    account_number: bankDetails.accountNumber,
                    bank_code: bankDetails.bankCode,
                    currency: "NGN",
                }),
            });
            const recipientData = await recipientResponse.json();
            if (!recipientData.status) {
                console.error(`Failed to create recipient for ${winnerId}`);
                continue;
            }
            recipientCode = recipientData.data.recipient_code;
            await userRef.doc(winnerId).update({ 'bankDetails.recipientCode': recipientCode });
        }
        
        const transactionRef = adminDb.collection('transactions').doc();

        const transferResponse = await fetch('https://api.paystack.co/transfer', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                source: "balance",
                reason: `${tournament.name} - ${item.category}`,
                amount: Math.floor(item.amount * 100), // in kobo
                recipient: recipientCode,
                reference: transactionRef.id,
            }),
        });

        const transferData = await transferResponse.json();
        
        const txLog = {
            id: transactionRef.id,
            uid: winnerId,
            tournamentId,
            category: item.category,
            amount: item.amount,
            status: transferData.data.status,
            paystackTransferCode: transferData.data.transfer_code,
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
            recipientName: bankDetails.accountName,
            recipientBank: bankDetails.bankName,
            recipientAccountNumber: bankDetails.accountNumber
        };
        
        await transactionRef.set(txLog);
        newLogEntries.push({ ...txLog, status: txLog.status as any });
    }

    await tournamentRef.update({
      payoutInitiated: true,
      payoutCompletedAt: FieldValue.serverTimestamp(),
      payoutLog: FieldValue.arrayUnion(...newLogEntries),
    });
    
    revalidatePath(`/tournaments/${tournamentId}`);
    revalidatePath('/admin/tournaments');
    revalidatePath('/admin/payouts');

    return { success: true, message: `Payout process initiated for ${newLogEntries.length} categories.` };
}

export async function confirmUserDetailsForPayout(userId: string) {
    const userRef = adminDb.collection('users').doc(userId);
    const userDoc = await userRef.get();
    if(!userDoc.exists) throw new Error("User not found.");

    if(!userDoc.data()?.bankDetails?.accountNumber) {
        throw new Error("No bank details saved to confirm.");
    }
    
    await userRef.update({
        'bankDetails.confirmedForPayout': true
    });

    revalidatePath(`/profile`);
}

export async function getAdminDashboardAnalytics() {
    const usersPromise = adminDb.collection('users').count().get();
    const activeTournamentsPromise = adminDb.collection('tournaments').where('status', '==', 'in_progress').count().get();
    const platformSummaryPromise = adminDb.collection('platformSummary').doc('summary').get();

    const thirtyDaysAgo = subDays(new Date(), 30);
    const userGrowthQuery = adminDb.collection('users').where('createdAt', '>=', thirtyDaysAgo);

    const sixMonthsAgo = startOfMonth(subDays(new Date(), 150)); // Approx 5 months back to get 6 full months
    const tournamentActivityQuery = adminDb.collection('tournaments').where('createdAt', '>=', sixMonthsAgo);

    const [usersResult, activeTournamentsResult, platformSummaryDoc, userGrowthSnapshot, tournamentActivitySnapshot] = await Promise.all([
        usersPromise,
        activeTournamentsPromise,
        platformSummaryPromise,
        userGrowthQuery.get(),
        tournamentActivitySnapshot.get()
    ]);

    const userGrowthData: { [date: string]: number } = {};
    for (let i = 0; i < 30; i++) {
        const date = format(subDays(new Date(), i), 'MMM d');
        userGrowthData[date] = 0;
    }
    userGrowthSnapshot.forEach(doc => {
        const date = format(toAdminDate(doc.data().createdAt), 'MMM d');
        if (userGrowthData[date] !== undefined) {
            userGrowthData[date]++;
        }
    });

    const tournamentActivityData: { [month: string]: number } = {};
    const months = eachMonthOfInterval({ start: sixMonthsAgo, end: new Date() });
    months.forEach(month => {
        const monthKey = format(month, 'MMM yyyy');
        tournamentActivityData[monthKey] = 0;
    });
    tournamentActivitySnapshot.forEach(doc => {
        const monthKey = format(toAdminDate(doc.data().createdAt), 'MMM yyyy');
        if (tournamentActivityData[monthKey] !== undefined) {
            tournamentActivityData[monthKey]++;
        }
    });

    return {
        totalUsers: usersResult.data().count,
        activeTournaments: activeTournamentsResult.data().count,
        totalPlatformFees: platformSummaryDoc.exists ? platformSummaryDoc.data()?.totalPlatformFees || 0 : 0,
        userGrowth: Object.entries(userGrowthData).map(([date, count]) => ({ date, count })).reverse(),
        tournamentActivity: Object.entries(tournamentActivityData).map(([month, count]) => ({ month, count }))
    };
}

export async function adminGetAllTransactions(): Promise<Transaction[]> {
    const transactionsSnapshot = await adminDb.collection('transactions').orderBy('createdAt', 'desc').limit(100).get();
    return transactionsSnapshot.docs.map(doc => serializeData({ id: doc.id, ...doc.data() }) as Transaction);
}

export async function retryPayout(transactionId: string): Promise<{ success: boolean; message: string }> {
    const paystackSecret = process.env.PAYSTACK_SECRET_KEY;
    if (!paystackSecret) throw new Error("Paystack secret key is not configured.");

    const transactionRef = adminDb.collection('transactions').doc(transactionId);
    const transactionDoc = await transactionRef.get();
    if (!transactionDoc.exists) throw new Error("Transaction not found.");
    
    const transaction = transactionDoc.data() as Transaction;
    if (transaction.status !== 'failed' && transaction.status !== 'reversed') {
        throw new Error("Only failed or reversed transfers can be retried.");
    }
    
    // Use Paystack's retry endpoint for failed transfers
    const response = await fetch('https://api.paystack.co/transfer/retry', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${paystackSecret}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ transfer_code: transaction.paystackTransferCode }),
    });

    const data = await response.json();
    if (!data.status) {
        throw new Error(data.message || "Failed to retry payout.");
    }

    // The webhook will handle the status update, so we don't need to do anything here.
    return { success: true, message: 'Payout retry initiated.' };
}

export async function adminGetAllDisputedMatches(): Promise<DisputedMatchInfo[]> {
    // This function is rewritten to avoid collection group queries which require manual index creation.
    // Instead, we iterate through active tournaments and query their subcollections.
    const activeTournamentsSnapshot = await getDocs(query(collection(adminDb, 'tournaments'), where('status', 'in', ['in_progress', 'completed'])));

    const allProblemMatches: Match[] = [];
    const seenMatchIds = new Set<string>();

    for (const tournamentDoc of activeTournamentsSnapshot.docs) {
        const matchesRef = collection(tournamentDoc.ref, 'matches');

        const disputedMatchesSnapshot = await getDocs(query(matchesRef,
            where('status', 'in', ['disputed', 'needs_secondary_evidence'])
        ));

        const replayRequestSnapshot = await getDocs(query(matchesRef,
            where('replayRequest.status', 'in', ['pending', 'accepted'])
        ));

        const processSnapshot = (snapshot: FirebaseFirestore.QuerySnapshot) => {
            snapshot.docs.forEach(doc => {
                if (!seenMatchIds.has(doc.id)) {
                    allProblemMatches.push({ id: doc.id, ...doc.data() } as Match);
                    seenMatchIds.add(doc.id);
                }
            });
        }
        
        processSnapshot(disputedMatchesSnapshot);
        processSnapshot(replayRequestSnapshot);
    }
    
    if (allProblemMatches.length === 0) return [];
    
    // Enrich with tournament and team data
    const tournamentIds = new Set(allProblemMatches.map(m => m.tournamentId));
    
    const tournamentsMap = new Map<string, Tournament>();
    for (const id of Array.from(tournamentIds)) {
        const doc = await adminDb.collection('tournaments').doc(id).get();
        if (doc.exists) {
            tournamentsMap.set(id, { id: doc.id, ...doc.data() } as Tournament);
        }
    }
    
    const teamsMap = new Map<string, Team>();
    for (const tournamentId of tournamentIds) {
        const teamsSnapshot = await adminDb.collection('tournaments').doc(tournamentId).collection('teams').get();
        teamsSnapshot.forEach(doc => teamsMap.set(doc.id, { id: doc.id, ...doc.data() } as Team));
    }
    
    const enrichedMatches: DisputedMatchInfo[] = allProblemMatches.map(match => {
        const tournament = tournamentsMap.get(match.tournamentId);
        const homeTeam = teamsMap.get(match.homeTeamId);
        const awayTeam = teamsMap.get(match.awayTeamId);

        return {
            ...match,
            tournamentName: tournament?.name || 'Unknown',
            homeTeam: homeTeam || {} as Team,
            awayTeam: awayTeam || {} as Team
        };
    }).filter(m => m.tournamentName !== 'Unknown' && m.homeTeam.id && m.awayTeam.id);
    
    // Sort by match day descending
    enrichedMatches.sort((a, b) => toAdminDate(b.matchDay).getTime() - toAdminDate(a.matchDay).getTime());

    return serializeData(enrichedMatches);
}

export async function deleteMatchMessage(tournamentId: string, matchId: string, messageId: string, currentUserId: string) {
    const tournamentRef = adminDb.collection('tournaments').doc(tournamentId);
    const tournamentDoc = await tournamentRef.get();
    if(tournamentDoc.data()?.organizerId !== currentUserId) {
        throw new Error("You are not authorized to delete messages in this tournament.");
    }
    const messageRef = tournamentRef.collection('matches').doc(matchId).collection('messages').doc(messageId);
    await messageRef.delete();
}

export async function deleteTournamentMessage(tournamentId: string, messageId: string, currentUserId: string) {
    const tournamentRef = adminDb.collection('tournaments').doc(tournamentId);
    const tournamentDoc = await tournamentRef.get();
    if(tournamentDoc.data()?.organizerId !== currentUserId) {
        throw new Error("You are not authorized to delete messages in this tournament.");
    }
    const messageRef = tournamentRef.collection('messages').doc(messageId);
    await messageRef.delete();
}

export async function forfeitMatch(tournamentId: string, matchId: string, forfeitingUserId: string) {
    const matchRef = adminDb.collection('tournaments').doc(tournamentId).collection('matches').doc(matchId);
    const matchDoc = await matchRef.get();
    if (!matchDoc.exists) throw new Error("Match not found.");

    const match = matchDoc.data() as Match;

    const isHomeCaptain = match.homeTeamId && (await adminDb.collection('tournaments').doc(tournamentId).collection('teams').doc(match.homeTeamId).get()).data()?.captainId === forfeitingUserId;
    const isAwayCaptain = match.awayTeamId && (await adminDb.collection('tournaments').doc(tournamentId).collection('teams').doc(match.awayTeamId).get()).data()?.captainId === forfeitingUserId;

    if (!isHomeCaptain && !isAwayCaptain) {
        throw new Error("You are not a captain in this match and cannot forfeit.");
    }

    const homeScore = isHomeCaptain ? 0 : 3;
    const awayScore = isAwayCaptain ? 0 : 3;

    await approveMatchResult(
        tournamentId,
        matchId,
        homeScore,
        awayScore,
        `Match forfeited by ${isHomeCaptain ? 'home team' : 'away team'}.`,
        true, // Apply stats penalty
        undefined, // No home stats
        undefined, // No away stats
        forfeitingUserId, // ID of the forfeiting player's captain
        true // Mark as auto-forfeited
    );

    revalidatePath(`/tournaments/${tournamentId}`);
}

export async function getTeamsForTournament(tournamentId: string): Promise<Team[]> {
    const snapshot = await adminDb.collection('tournaments').doc(tournamentId).collection('teams').get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...serializeData(doc.data()) } as Team));
}

export async function getStandingsForTournament(tournamentId: string): Promise<Standing[]> {
    const snapshot = await adminDb.collection('standings').where('tournamentId', '==', tournamentId).orderBy('ranking', 'asc').get();
    return snapshot.docs.map(doc => serializeData(doc.data()) as Standing);
}

export async function getGroupTablesForTournament(tournamentId: string) {
    const tournamentRef = adminDb.collection('tournaments').doc(tournamentId);
    const matchesSnapshot = await tournamentRef.collection('matches').get();
    const matches = matchesSnapshot.docs.map(doc => ({ id: doc.id, ...serializeData(doc.data()) } as Match));
    const groupMatches = matches.filter(m => isGroupRound(m.round));
    const tables = computeAllGroupStandings(groupMatches);
    return serializeData(tables);
}

export async function getLiveMatches(): Promise<{ match: Match; homeTeam: Team; awayTeam: Team; }[]> {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(today.getDate() + 1);

        const matchesSnapshot = await adminDb.collectionGroup('matches')
            .where('matchDay', '>=', today)
            .where('matchDay', '<', tomorrow)
            .where('status', '==', 'scheduled')
            .get();

        if (matchesSnapshot.empty) {
            return [];
        }

        const liveMatches: { match: Match; homeTeam: Team; awayTeam: Team; }[] = [];

        for (const doc of matchesSnapshot.docs) {
            const match = doc.data() as Match;
            if (match.streamLinks && Object.keys(match.streamLinks).length > 0) {
                 const tournamentDoc = await adminDb.collection('tournaments').doc(match.tournamentId).get();
                 if (!tournamentDoc.exists) continue;

                 const homeTeamDoc = await adminDb.collection('tournaments').doc(match.tournamentId).collection('teams').doc(match.homeTeamId).get();
                 const awayTeamDoc = await adminDb.collection('tournaments').doc(match.tournamentId).collection('teams').doc(match.awayTeamId).get();

                 if (homeTeamDoc.exists && awayTeamDoc.exists) {
                    liveMatches.push({
                        match: {id: doc.id, ...match},
                        homeTeam: {id: homeTeamDoc.id, ...homeTeamDoc.data()} as Team,
                        awayTeam: {id: awayTeamDoc.id, ...awayTeamDoc.data()} as Team,
                    });
                 }
            }
        }
        
        return serializeData(liveMatches);

    } catch (error: any) {
         if (error.code === 9) { // FAILED_PRECONDITION, indicates missing index
            console.warn(
                `[eArena] Firestore index missing for live matches. Please create the required index in your Firebase console for the 'matches' collection group. The app will function, but the live page will be empty. Required Index: status ASC, matchDay ASC`
            );
            return [];
        }
        console.error("Error fetching live matches:", error);
        throw new Error("Could not fetch live matches.");
    }
}

export async function exportStandingsToCSV(tournamentId: string): Promise<{ csv: string, filename: string }> {
    const tournamentDoc = await adminDb.collection('tournaments').doc(tournamentId).get();
    if (!tournamentDoc.exists) {
        throw new Error("Tournament not found");
    }
    const tournament = tournamentDoc.data() as Tournament;

    const standings = await getStandingsForTournament(tournamentId);
    const teams = await getTeamsForTournament(tournamentId);

    if (standings.length === 0) {
        throw new Error("No standings available to export.");
    }

    const teamsMap = new Map(teams.map(team => [team.id, team]));

    const headers = ["Rank", "Team", "MP", "W", "D", "L", "GF", "GA", "GD", "CS", "Pts"];
    const rows = standings.map(s => {
        const teamName = teamsMap.get(s.teamId)?.name || 'Unknown Team';
        const gd = s.goalsFor - s.goalsAgainst;
        return [
            s.ranking,
            `"${teamName.replace(/"/g, '""')}"`, // escape double quotes
            s.matchesPlayed,
            s.wins,
            s.draws,
            s.losses,
            s.goalsFor,
            s.goalsAgainst,
            gd,
            s.cleanSheets,
            s.points,
        ].join(',');
    });

    const csv = [headers.join(','), ...rows].join('\n');
    const filename = `${tournament.name.replace(/ /g, '_')}_standings.csv`;
    
    return { csv, filename };
}

export async function findUsersByUsername(query: string): Promise<UserProfile[]> {
    if (!query || !query.trim()) {
        return [];
    }
    const usersRef = adminDb.collection('users');
    const searchTerm = query.trim().toLowerCase();
    
    // Query by lowercase username
    const usernameQuery = usersRef
        .orderBy('username_lowercase')
        .startAt(searchTerm)
        .endAt(searchTerm + '\uf8ff')
        .limit(10)
        .get();

    // Query by email
    const emailQuery = usersRef
        .orderBy('email')
        .startAt(searchTerm)
        .endAt(searchTerm + '\uf8ff')
        .limit(10)
        .get();
        
    const [usernameSnapshot, emailSnapshot] = await Promise.all([usernameQuery, emailQuery]);
    
    const resultsMap = new Map<string, UserProfile>();

    usernameSnapshot.docs.forEach(doc => {
        resultsMap.set(doc.id, {uid: doc.id, ...doc.data()} as UserProfile);
    });

    emailSnapshot.docs.forEach(doc => {
        if (!resultsMap.has(doc.id)) {
            resultsMap.set(doc.id, {uid: doc.id, ...doc.data()} as UserProfile);
        }
    });

    return serializeData(Array.from(resultsMap.values()));
}

export async function savePushSubscription(userId: string, subscription: PushSubscription) {
    if (!userId || !subscription) {
        throw new Error('User ID and subscription are required.');
    }
    const subscriptionRef = adminDb.collection('users').doc(userId).collection('pushSubscriptions').doc(subscription.endpoint.substring(subscription.endpoint.lastIndexOf('/') + 1));
    await subscriptionRef.set(subscription);
}

export async function deletePushSubscription(userId: string, endpoint: string) {
    if (!userId || !endpoint) {
        throw new Error('User ID and endpoint are required.');
    }
    const subscriptionId = endpoint.substring(endpoint.lastIndexOf('/') + 1);
    const subscriptionRef = adminDb.collection('users').doc(userId).collection('pushSubscriptions').doc(subscriptionId);
    await subscriptionRef.delete();
}



    