
'use server';

import { adminDb, adminAuth } from './firebase-admin';
import { Timestamp, FieldValue, FieldPath } from 'firebase-admin/firestore';
import type { Tournament, UserProfile, Team, Match, Standing, TournamentFormat, Player, MatchReport, Notification, RewardDetails, TeamMatchStats, MatchStatus, Badge, UnifiedTimestamp, PlayerStats, TournamentPerformancePoint, Highlight, Article, UserMembership, ReplayRequest, EarnedAchievement, PlayerTitle, PlatformSettings, Conversation, ChatMessage, PlayerRole } from './types';
import { revalidatePath } from 'next/cache';
import { generateTournamentFixtures } from '@/ai/flows/generate-tournament-fixtures';
import { verifyMatchScores, type VerifyMatchScoresInput, type VerifyMatchScoresOutput } from '@/ai/flows/verify-match-scores';
import { calculateTournamentStandings, type CalculateTournamentStandingsInput } from '@/ai/flows/calculate-tournament-standings';
import { getStorage } from 'firebase-admin/storage';
import { addHours, differenceInDays, isBefore, format, addDays, startOfDay, endOfDay, isPast, isToday, isAfter } from 'date-fns';
import { analyzePlayerPerformance, type PlayerPerformanceInput } from '@/ai/flows/analyze-player-performance';
import { predictMatchWinner, type PredictWinnerInput } from '@/ai/flows/predict-match-winner';
import { allAchievements } from './achievements';
import { sendEmail } from './email';

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
        const newBadge: Badge = {
            tournamentName: tournament.name,
            tournamentId: tournament.id,
            rank: standing.ranking,
            date: Timestamp.now(),
        };

        for (const player of team.players) {
            const userRef = adminDb.collection('users').doc(player.uid);
            
            const updateData: { badges: FieldValue, tournamentsWon?: FieldValue } = {
                badges: FieldValue.arrayUnion(newBadge)
            };
            if (standing.ranking === 1) {
                updateData.tournamentsWon = FieldValue.increment(1);
            }
            await userRef.update(updateData);

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


async function uploadFileAndGetPublicURL(tournamentId: string, teamId: string, file: File): Promise<string> {
    const bucket = getStorage().bucket(process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET);
    const buffer = Buffer.from(await file.arrayBuffer());
    const filePath = `tournaments/${tournamentId}/evidence/${teamId}_${Date.now()}_${file.name}`;
    const fileRef = bucket.file(filePath);

    await fileRef.save(buffer, {
        metadata: { contentType: file.type },
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

  const bucket = getStorage().bucket(process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET);
  const buffer = Buffer.from(await photoFile.arrayBuffer());
  const filePath = `avatars/${userId}/${Date.now()}_${photoFile.name}`;
  const fileRef = bucket.file(filePath);

  await fileRef.save(buffer, {
    metadata: { contentType: photoFile.type },
  });
  
  await fileRef.makePublic();
  const photoURL = fileRef.publicUrl();

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

export async function findUsersByUsername(username: string): Promise<UserProfile[]> {
    if (!username.trim()) {
        return [];
    }
    const usersRef = adminDb.collection('users');
    const snapshot = await usersRef
        .orderBy('username')
        .startAt(username)
        .endAt(username + '\uf8ff')
        .limit(5)
        .get();

    if (snapshot.empty) {
        return [];
    }

    return snapshot.docs.map(doc => serializeData(doc.data()) as UserProfile);
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


export async function followUser(currentUserId: string, targetUserId: string) {
    if (currentUserId === targetUserId) {
        throw new Error("You cannot follow yourself.");
    }

    const currentUserRef = adminDb.collection('users').doc(currentUserId);
    const targetUserRef = adminDb.collection('users').doc(targetUserId);

    await adminDb.runTransaction(async (transaction) => {
        transaction.update(currentUserRef, {
            following: FieldValue.arrayUnion(targetUserId)
        });
        transaction.update(targetUserRef, {
            followers: FieldValue.arrayUnion(currentUserId)
        });
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
export async function createTournament(data: Omit<Tournament, 'id' | 'organizerUsername' | 'createdAt' | 'status' | 'teamCount' | 'code' | 'rewardDetails'>) {
  try {
    const registrationEndDate = toAdminDate((data as any).registrationEndDate);
    const tournamentStartDate = toAdminDate((data as any).tournamentStartDate);
    const tournamentEndDate = toAdminDate((data as any).tournamentEndDate);

    if (isAfter(registrationEndDate, tournamentStartDate)) {
        throw new Error("Registration must end on or before the tournament start date.");
    }
    if (isAfter(tournamentStartDate, tournamentEndDate)) {
        throw new Error("Tournament start date must be on or before the end date.");
    }
    
    const userRecord = await adminAuth.getUser(data.organizerId);
    const tournamentCode = generateTournamentCode();
    
    const rewardDetails: RewardDetails = {
      type: data.rewardType,
      prizePool: data.prizePool || 0,
      currency: 'NGN',
      isPaidOut: false,
      paymentStatus: data.rewardType === 'money' ? 'pending' : 'not-applicable',
    };

    const newTournamentData: Omit<Tournament, 'id'> = {
      ...data,
      organizerUsername: userRecord.displayName || userRecord.email,
      createdAt: FieldValue.serverTimestamp() as UnifiedTimestamp,
      status: data.rewardType === 'money' ? 'pending' : 'open_for_registration',
      teamCount: 0,
      code: tournamentCode,
      rewardDetails,
      registrationStartDate: Timestamp.fromDate(toAdminDate((data as any).registrationStartDate)),
      registrationEndDate: Timestamp.fromDate(registrationEndDate),
      tournamentStartDate: Timestamp.fromDate(tournamentStartDate),
      tournamentEndDate: Timestamp.fromDate(tournamentEndDate),
    };
    
    delete (newTournamentData as any).registrationDates;
    delete (newTournamentData as any).tournamentDates;
    delete (newTournamentData as any).schedulingPreset;
    delete (newTournamentData as any).duration;


    const tournamentRef = await adminDb.collection('tournaments').add(newTournamentData as any);
    
    revalidatePath('/dashboard');

    return { 
        tournamentId: tournamentRef.id,
        paymentUrl: null, // This will be handled by a separate initialization step
    };

  } catch (error: any) {
    console.error("Error creating tournament in server action: ", error);
    throw new Error(`A server error occurred while creating the tournament. Reason: ${error.message}`);
  }
}

async function deleteCollection(collectionPath: string, batchSize: number) {
  const collectionRef = adminDb.collection(collectionPath);
  const query = collectionRef.orderBy('__name__').limit(batchSize);

  return new Promise((resolve, reject) => {
    deleteQueryBatch(query, resolve).catch(reject);
  });
}

async function deleteQueryBatch(query: FirebaseFirestore.Query, resolve: (value?: unknown) => void) {
  const snapshot = await query.get();

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
    deleteQueryBatch(query, resolve);
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
        const snapshot = await adminDb.collection('tournaments')
            .where('isPublic', '==', true)
            .get();
        
        const tournaments = snapshot.docs.map(doc => ({ id: doc.id, ...serializeData(doc.data()) } as Tournament));
        
        // Sort manually to avoid needing a composite index
        tournaments.sort((a, b) => {
            const dateA = toAdminDate(a.tournamentStartDate).getTime();
            const dateB = toAdminDate(b.tournamentStartDate).getTime();
            return dateB - dateA;
        });

        return tournaments;

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

export async function updateTeamRoster(tournamentId: string, teamId: string, players: Player[]) {
    const teamRef = adminDb.collection('tournaments').doc(tournamentId).collection('teams').doc(teamId);
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
    const teams = teamsSnapshot.docs.map(doc => ({id: doc.id, ...doc.data()}) as Team);
    const teamIds = teams.map(team => team.id);
    
    await tournamentRef.update({ status: 'generating_fixtures' });
    revalidatePath(`/tournaments/${tournamentId}`);

    const fixtures = await generateTournamentFixtures({ teamIds, format: tournament.format });

    const batch = adminDb.batch();
    const playStartDate = toAdminDate(tournament.tournamentStartDate);
    const playEndDate = toAdminDate(tournament.tournamentEndDate);
    const totalDays = differenceInDays(playEndDate, playStartDate) + 1;

    fixtures.forEach((fixture, index) => {
        const matchRef = tournamentRef.collection('matches').doc();
        const hostId = Math.random() < 0.5 ? fixture.homeTeamId : fixture.awayTeamId;
        
        // Distribute matches across available days
        const dayOffset = index % totalDays;
        const matchDay = addDays(new Date(playStartDate), dayOffset);

        batch.set(matchRef, {
            ...fixture,
            id: matchRef.id,
            tournamentId,
            hostId: hostId,
            hostTransferRequested: false,
            homeScore: null,
            awayScore: null,
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
        // Send notifications to all players that it has started
        const allPlayerIds = teams.flatMap(team => team.playerIds);
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

    // Check if all matches in the current stage are completed
    const currentRoundsSnapshot = await tournamentRef.collection('matches')
        .where('status', '!=', 'approved')
        .get();
    
    // Filter to only check rounds that are part of the current stage (e.g. Group stages)
    const uncompletedMatches = currentRoundsSnapshot.docs.filter(doc => doc.data().round?.toLowerCase().includes('group'));

    if (uncompletedMatches.length > 0) {
        throw new Error(`Cannot progress: ${uncompletedMatches.length} group stage match(es) are still not approved.`);
    }
    
    // Find the current stage and determine the next one
    const matchesSnapshot = await tournamentRef.collection('matches').orderBy('matchDay', 'desc').limit(1).get();
    let lastMatchDay = new Date();
    if(!matchesSnapshot.empty) {
        lastMatchDay = toAdminDate(matchesSnapshot.docs[0].data().matchDay);
    }
    
    // Placeholder for advancing logic
    const standingsSnapshot = await adminDb.collection('standings').where('tournamentId', '==', tournamentId).orderBy('ranking', 'asc').limit(8).get();
    if (standingsSnapshot.docs.length < 2) throw new Error("Not enough ranked teams to progress.");
    
    const advancingTeamIds = standingsSnapshot.docs.map(doc => doc.data().teamId);
    
    const fixtures = await generateTournamentFixtures({
        teamIds: advancingTeamIds,
        format: 'cup', // Simplified to generate a simple knockout
    });

    const batch = adminDb.batch();
    
    fixtures.forEach((fixture, index) => {
        const matchRef = tournamentRef.collection('matches').doc();
        const hostId = Math.random() < 0.5 ? fixture.homeTeamId : fixture.awayTeamId;
        
        // Schedule knockout matches with a one day interval
        const matchDay = new Date(lastMatchDay.getTime());
        const dayOffset = Math.floor(index / (fixtures.length / 2)) + 1; // Simplified logic for day intervals
        matchDay.setDate(matchDay.getDate() + dayOffset);


        batch.set(matchRef, {
            ...fixture,
            id: matchRef.id,
            tournamentId,
            hostId: hostId,
            homeScore: null,
            awayScore: null,
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

    const evidenceUrl = await uploadFileAndGetPublicURL(tournamentId, teamId, evidenceFile);
    
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
      const result = await triggerAIVerification(tournamentId, matchId);
      await handleAIVerificationResult(tournamentId, matchId, result);
    } else {
      await matchRef.update({ status: 'awaiting_confirmation' });
    }

    revalidatePath(`/tournaments/${tournamentId}`);
}

export async function submitSecondaryEvidence(tournamentId: string, matchId: string, teamId: string, userId: string, formData: FormData) {
    const evidenceFile = formData.get('evidence') as File;
    if (!evidenceFile || evidenceFile.size === 0) throw new Error("Missing evidence file.");

    const evidenceUrl = await uploadFileAndGetPublicURL(tournamentId, teamId, evidenceFile);
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

    // Now, fetch the updated doc and check if both have submitted
    const updatedMatchDoc = await matchRef.get();
    const updatedMatchData = updatedMatchDoc.data() as Match;

    // Wait for the second report before triggering verification
    if (updatedMatchData.homeTeamSecondaryReport && updatedMatchData.awayTeamSecondaryReport) {
        const result = await triggerAIVerification(tournamentId, matchId);
        await handleAIVerificationResult(tournamentId, matchId, result);
    }

    revalidatePath(`/tournaments/${tournamentId}`);
}


async function updatePlayerStatsForMatch(tournamentId: string, match: Match, applyStatsPenalty: boolean, forfeitingPlayerId?: string) {
  const tournamentDoc = await adminDb.collection('tournaments').doc(tournamentId).get();
  const tournamentName = tournamentDoc.exists ? (tournamentDoc.data() as Tournament).name : 'Unknown Tournament';

  const homeTeamDoc = await adminDb.collection('tournaments').doc(tournamentId).collection('teams').doc(match.homeTeamId).get();
  const awayTeamDoc = await adminDb.collection('tournaments').doc(tournamentId).collection('teams').doc(match.awayTeamId).get();

  if (!homeTeamDoc.exists || !awayTeamDoc.exists) {
    console.error("Could not find teams to update stats.");
    return;
  }
  
  const homeTeam = homeTeamDoc.data() as Team;
  const awayTeam = awayTeamDoc.data() as Team;

  const homeCaptainId = homeTeam.captainId;
  const awayCaptainId = awayTeam.captainId;
  
  const playersToUpdate = [
      { captainId: homeCaptainId, isHome: true },
      { captainId: awayCaptainId, isHome: false }
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
      if (playerMatchStats.passes && playerMatchStats.passes > 0 && playerMatchStats.successfulPasses !== undefined) {
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
  
  if (stats.matchesWithPassStats && stats.matchesWithPassStats > 0) {
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
    if (awayStats) updateData.awayTeamStats = awayStats;
    if (highlightUrl) {
      updateData.highlightUrl = highlightUrl;
    }
    
    batch.update(matchRef, updateData);
    
    await batch.commit();

    const updatedMatchDoc = await matchRef.get();
    const approvedMatch = updatedMatchDoc.data() as Match;
    await updatePlayerStatsForMatch(tournamentId, approvedMatch, applyStatsPenalty, forfeitingPlayerId);
    
    // Check achievements for both players after stats update
    const homeTeamDoc = await adminDb.collection('tournaments').doc(tournamentId).collection('teams').doc(approvedMatch.homeTeamId).get();
    const awayTeamDoc = await adminDb.collection('tournaments').doc(tournamentId).collection('teams').doc(approvedMatch.awayTeamId).get();
    const homeCaptainId = homeTeamDoc.data()?.captainId;
    const awayCaptainId = awayTeamDoc.data()?.captainId;
    if(homeCaptainId) await checkAndAwardAchievements(homeCaptainId);
    if(awayCaptainId) await checkAndAwardAchievements(awayCaptainId);
    
    await updateStandings(tournamentId);

    // Finalize tournament if all matches are approved
    const allMatchesSnapshot = await adminDb.collection('tournaments').doc(tournamentId).collection('matches').get();
    const allMatchesApproved = allMatchesSnapshot.docs.every(doc => doc.data().status === 'approved');

    if (allMatchesApproved) {
        const tournamentRef = adminDb.collection('tournaments').doc(tournamentId);
        await tournamentRef.update({ status: 'completed' });
        await awardBadges(tournamentId);
        
        const tournamentData = (await tournamentRef.get()).data() as Tournament;
        if(tournamentData) {
             const organizerNotification: Omit<Notification, 'id' | 'createdAt' | 'isRead'> = {
                userId: tournamentData.organizerId,
                tournamentId,
                title: `"${tournamentData.name}" has concluded!`,
                body: "All matches are complete. Check out the final standings and rewards.",
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

    if (tournamentData.format === 'cup' || tournamentData.format === 'champions-league') {
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
        if (playerMatchStats.passes && playerMatchStats.passes > 0 && playerMatchStats.successfulPasses !== undefined) {
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
        let homeTeam: Team | undefined;
        let awayTeam: Team | undefined;
        
        if (match.status === 'approved') {
            const homeTeamDoc = await transaction.get(tournamentRef.collection('teams').doc(match.homeTeamId));
            const awayTeamDoc = await transaction.get(tournamentRef.collection('teams').doc(match.awayTeamId));
            homeTeam = homeTeamDoc.data() as Team;
            awayTeam = awayTeamDoc.data() as Team;

            if (homeTeam && awayTeam) {
                const homeCaptainStatsDoc = await transaction.get(adminDb.collection('playerStats').doc(homeTeam.captainId));
                const awayCaptainStatsDoc = await transaction.get(adminDb.collection('playerStats').doc(awayTeam.captainId));

                if (homeCaptainStatsDoc.exists) homeCaptainStats = homeCaptainStatsDoc.data() as PlayerStats;
                if (awayCaptainStatsDoc.exists) awayCaptainStats = awayCaptainStatsDoc.data() as PlayerStats;
            }
        }

        // --- COMPUTES (In Memory) ---
        if (homeCaptainStats && homeTeam) {
            revertSinglePlayerStats(homeCaptainStats, tournamentId, tournament.name, match, true);
        }
        if (awayCaptainStats && awayTeam) {
            revertSinglePlayerStats(awayCaptainStats, tournamentId, tournament.name, match, false);
        }

        // --- WRITES ---
        if (homeCaptainStats && homeTeam) {
            const homeStatsRef = adminDb.collection('playerStats').doc(homeTeam.captainId);
            transaction.set(homeStatsRef, homeCaptainStats);
        }
        if (awayCaptainStats && awayTeam) {
            const awayStatsRef = adminDb.collection('playerStats').doc(awayTeam.captainId);
            transaction.set(awayStatsRef, awayCaptainStats);
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

    const matchesSnapshot = await adminDb.collection('tournaments').doc(tournamentId).collection('matches')
        .where('status', '==', 'approved').get();
    
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
    
    const tournamentDoc = await adminDb.collection('tournaments').doc(tournamentId).get();
    const tournamentData = tournamentDoc.data() as Tournament;

    const standingsInput: CalculateTournamentStandingsInput = {
        teamsWithStats: teamStatsList,
        tieBreakerRules: tournamentData.rules,
    };

    const rankedStandings = await calculateTournamentStandings(standingsInput);
    
    const batch = adminDb.batch();
    const standingsRef = adminDb.collection('standings');
    
    const oldStandingsSnapshot = await standingsRef.where('tournamentId', '==', tournamentId).get();
    oldStandingsSnapshot.docs.forEach(doc => batch.delete(doc.ref));

    rankedStandings.forEach(standing => {
        const docRef = standingsRef.doc(`${tournamentId}_${standing.teamId}`);
        batch.set(docRef, { ...standing, tournamentId });
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
            if (match.isReplay && (tournament.format === 'cup' || tournament.format === 'champions-league')) {
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
    await chatRef.add({ tournamentId, userId, username, photoURL, message, timestamp: FieldValue.serverTimestamp() });
}

export async function postTeamMessage(tournamentId: string, teamId: string, userId: string, username: string, photoURL: string, message: string) {
    const chatRef = adminDb.collection('tournaments').doc(tournamentId).collection('teams').doc(teamId).collection('messages');
    await chatRef.add({ tournamentId, teamId, userId, username, photoURL, message, timestamp: FieldValue.serverTimestamp() });
}

export async function postMatchMessage(tournamentId: string, matchId: string, userId: string, username: string, photoURL: string, message: string) {
    const chatRef = adminDb.collection('tournaments').doc(tournamentId).collection('matches').doc(matchId).collection('messages');
    await chatRef.add({ tournamentId, matchId, userId, username, photoURL, message, timestamp: FieldValue.serverTimestamp() });
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
        const data = doc.data() as Omit<Conversation, 'participants'>;
        
        const participantProfiles = await Promise.all(
            data.participantIds.map(id => getUserProfileById(id))
        );

        return {
            id: doc.id,
            ...data,
            participants: participantProfiles.filter(p => p !== null) as UserProfile[],
        };
    }));

    return serializeData(conversations);
}

export async function getConversationById(conversationId: string, currentUserId: string): Promise<Conversation | null> {
    const conversationRef = adminDb.collection('conversations').doc(conversationId);
    const conversationDoc = await conversationRef.get();

    if (!conversationDoc.exists) return null;
    
    const conversationData = conversationDoc.data() as Omit<Conversation, 'participants' | 'messages'>;

    if (!conversationData.participantIds.includes(currentUserId)) {
        throw new Error("You are not authorized to view this conversation.");
    }

    const messagesSnapshot = await conversationRef.collection('messages').orderBy('timestamp', 'asc').limit(50).get();
    const messages = messagesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ChatMessage));
    
    const participantProfiles = await Promise.all(
        conversationData.participantIds.map(id => getUserProfileById(id))
    );

    const fullConversation: Conversation = {
        id: conversationDoc.id,
        ...conversationData,
        participants: participantProfiles.filter(p => p !== null) as UserProfile[],
        messages,
    };

    return serializeData(fullConversation);
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
        photoURL: userProfile.photoURL,
    };

    const batch = adminDb.batch();
    batch.set(messageRef, { ...newMessage, timestamp });
    batch.update(conversationRef, {
        lastMessage: {
            text: messageText,
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
export async function getPrizeDistribution(tournamentId: string): Promise<any[]> {
    const tournamentDoc = await getTournamentById(tournamentId);
    if (!tournamentDoc || !tournamentDoc.rewardDetails || tournamentDoc.rewardDetails.type === 'virtual') {
        return [];
    }
    const prizePool = tournamentDoc.rewardDetails.prizePool;
    const distribution = [
        { category: '1st Place', percentage: 50 },
        { category: '2nd Place', percentage: 30 },
        { category: '3rd Place', percentage: 20 },
    ];
    
    const results = await Promise.all(distribution.map(async (item, index) => {
        let winnerData = null;
        if (tournamentDoc.status === 'completed') {
            const rank = index + 1;
            const standingSnapshot = await adminDb.collection('standings')
                .where('tournamentId', '==', tournamentId)
                .where('ranking', '==', rank)
                .limit(1)
                .get();

            if (!standingSnapshot.empty) {
                const teamId = standingSnapshot.docs[0].data().teamId;
                const teamDoc = await adminDb.collection('tournaments').doc(tournamentId).collection('teams').doc(teamId).get();
                if (teamDoc.exists) {
                    winnerData = {
                        teamId: teamDoc.id,
                        teamName: teamDoc.data()!.name,
                        logoUrl: teamDoc.data()!.logoUrl,
                    };
                }
            }
        }
        return {
            ...item,
            amount: (prizePool * item.percentage) / 100,
            winner: winnerData
        };
    }));

    return serializeData(results);
}


export async function transferHost(tournamentId: string, matchId: string, currentHostId: string) {
    const matchRef = adminDb.collection('tournaments').doc(tournamentId).collection('matches').doc(matchId);
    const matchDoc = await matchRef.get();
    if(!matchDoc.exists) throw new Error("Match not found");
    
    const matchData = matchDoc.data() as Match;
    const teamDoc = await adminDb.collection('tournaments').doc(tournamentId).collection('teams').doc(matchData.hostId).get();
    if(!teamDoc.exists) throw new Error("Host team not found");
    
    if(teamDoc.data()!.captainId !== currentHostId) throw new Error("Only the current host can transfer hosting duties.");

    const newHostId = matchData.homeTeamId === matchData.hostId ? matchData.awayTeamId : matchData.homeTeamId;

    await matchRef.update({
        hostId: newHostId,
        hostTransferRequested: true
    });
    revalidatePath(`/tournaments/${tournamentId}`);
}

export async function setMatchRoomCode(tournamentId: string, matchId: string, code: string) {
    const matchRef = adminDb.collection('tournaments').doc(tournamentId).collection('matches').doc(matchId);
    await matchRef.update({ 
        roomCode: code,
        roomCodeSetAt: FieldValue.serverTimestamp(),
    });
    revalidatePath(`/tournaments/${tournamentId}`);
}

export async function approveTeamRegistration(tournamentId: string, teamId: string, organizerId: string) {
  const tournamentRef = adminDb.collection('tournaments').doc(tournamentId);
  const tournamentDoc = await tournamentRef.get();
  if (tournamentDoc.data()?.organizerId !== organizerId) {
    throw new Error("You are not authorized to perform this action.");
  }
  
  const teamRef = tournamentRef.collection('teams').doc(teamId);
  await teamRef.update({ isApproved: true });
  
  revalidatePath(`/tournaments/${tournamentId}`);
}

export async function getPlayerStats(userId: string): Promise<PlayerStats> {
    const statsDocRef = adminDb.collection('playerStats').doc(userId);
    const statsDoc = await statsDocRef.get();

    if (!statsDoc.exists) {
        return serializeData(createDefaultPlayerStats(userId));
    }
    
    const data = statsDoc.data() as PlayerStats;
    data.totalPassPercentageSum = data.totalPassPercentageSum || 0;
    data.matchesWithPassStats = data.matchesWithPassStats || 0;
    
    return serializeData(data);
}

export async function getHighlights(): Promise<Highlight[]> {
    try {
        const matchesSnapshot = await adminDb.collectionGroup('matches')
            .where('status', '==', 'approved')
            .where('highlightUrl', '!=', null)
            .get();

        if (matchesSnapshot.empty) {
            return [];
        }

        let matches = matchesSnapshot.docs.map(doc => doc.data() as Match);

        // Sort by date descending and limit to the most recent 20
        matches.sort((a, b) => toAdminDate(b.matchDay).getTime() - toAdminDate(a.matchDay).getTime());
        matches = matches.slice(0, 20);

        const tournamentIds = new Set<string>();
        matches.forEach(match => tournamentIds.add(match.tournamentId));

        const tournamentsMap = new Map<string, Tournament>();
        if (tournamentIds.size > 0) {
            const tournamentDocs = await adminDb.collection('tournaments').where(FieldPath.documentId(), 'in', Array.from(tournamentIds)).get();
            tournamentDocs.forEach(doc => tournamentsMap.set(doc.id, { id: doc.id, ...doc.data() } as Tournament));
        }

        const highlights: Highlight[] = await Promise.all(matches.map(async (match) => {
            const tournament = tournamentsMap.get(match.tournamentId);

            const homeTeamDoc = await adminDb.collection('tournaments').doc(match.tournamentId).collection('teams').doc(match.homeTeamId).get();
            const awayTeamDoc = await adminDb.collection('tournaments').doc(match.tournamentId).collection('teams').doc(match.awayTeamId).get();

            const homeTeam = homeTeamDoc.exists ? homeTeamDoc.data() as Team : null;
            const awayTeam = awayTeamDoc.exists ? awayTeamDoc.data() as Team : null;

            return {
                id: match.id,
                tournamentId: match.tournamentId,
                highlightUrl: match.highlightUrl!,
                homeScore: match.homeScore,
                awayScore: match.awayScore,
                matchDay: match.matchDay,
                tournamentName: tournament?.name || 'Unknown Tournament',
                homeTeamName: homeTeam?.name || 'Unknown Team',
                homeTeamLogo: homeTeam?.logoUrl,
                awayTeamName: awayTeam?.name || 'Unknown Team',
                awayTeamLogo: awayTeam?.logoUrl,
            };
        }));
        
        const validHighlights = highlights.filter(h => h.homeTeamName !== 'Unknown Team' && h.awayTeamName !== 'Unknown Team');

        return serializeData(validHighlights);

    } catch (error: any) {
         if (error.code === 9) {
            console.warn(
                `[eArena] Firestore index missing. Please create the required index in your Firebase console for the 'matches' collection group to enable highlights. The app will function, but the highlights page may be empty. Required Index: status ASC, highlightUrl ASC, matchDay DESC`
            );
            return [];
        }
        console.error("Error fetching highlights:", error);
        throw new Error("Could not fetch highlights.");
    }
}

// Community Hub Actions
async function seedArticles() {
  const articlesRef = adminDb.collection('articles');
  const batch = adminDb.batch();

  const articlesToSeed: Omit<Article, 'id'>[] = [
    {
      slug: 'welcome-to-the-community-hub',
      title: 'Welcome to the New eArena Community Hub!',
      content: 'This is your new home for all official news, updates, and helpful guides. We\'re excited to launch this new section to keep you informed and help you improve your game.\n\nCheck back regularly for patch notes, tournament announcements, and pro tips!',
      excerpt: 'The central place for all official eArena news, updates, and guides.',
      authorName: 'eArena Staff',
      authorId: 'system',
      type: 'news',
      tags: ['platform-update'],
      createdAt: Timestamp.now(),
    },
    {
      slug: 'mastering-dribbling-in-efootball',
      title: 'Mastering Dribbling in eFootball',
      content: 'Dribbling is a key skill in eFootball. To improve, focus on these three areas:\n\n1.  **Use the Right Stick:** Don\'t just rely on the left stick. Use the right stick for sharp, quick touches to change direction and beat defenders.\n\n2.  **Shielding the Ball:** Use the L2/LT button to shield the ball when a defender is close. This protects possession and allows you to wait for an opening or draw a foul.\n\n3.  **Vary Your Pace:** Don\'t sprint all the time. Mix in slow dribbling with sudden bursts of speed to keep your opponent guessing.',
      excerpt: 'Learn the fundamentals of dribbling to beat defenders and control the game.',
      authorName: 'Pro Player',
      authorId: 'system',
      type: 'guide',
      tags: ['gameplay-tips', 'dribbling'],
      createdAt: Timestamp.now(),
    },
    {
      slug: 'efootball-patch-notes-3-5-0',
      title: 'eFootball Patch Notes v3.5.0',
      content: 'The latest patch brings a host of changes, including:\n\n- Adjusted goalkeeper AI for more realistic saves.\n- Improved player responsiveness during skill moves.\n\n- Fixed a bug where player stamina would not drain correctly in extra time.\n\n- Updated several player likenesses and team kits.',
      excerpt: 'Key changes in the latest game update, including AI adjustments and bug fixes.',
      authorName: 'eArena Staff',
      authorId: 'system',
      type: 'news',
      tags: ['patch-notes'],
      createdAt: Timestamp.now(),
    },
  ];

  articlesToSeed.forEach(article => {
    const docRef = articlesRef.doc(article.slug);
    batch.set(docRef, article);
  });

  await batch.commit();
}


export async function getArticles(): Promise<Article[]> {
  const articlesRef = adminDb.collection('articles');
  let snapshot = await articlesRef.orderBy('createdAt', 'desc').get();
  
  if (snapshot.empty) {
      await seedArticles();
      snapshot = await articlesRef.orderBy('createdAt', 'desc').get();
  }

  return snapshot.docs.map(doc => ({ id: doc.id, ...serializeData(doc.data()) } as Article));
}

export async function getArticleBySlug(slug: string): Promise<Article | null> {
    const docRef = adminDb.collection('articles').doc(slug);
    const doc = await docRef.get();
    if (doc.exists) {
        return { id: doc.id, ...serializeData(doc.data()) } as Article;
    }
    return null;
}

export async function getPlayerPerformanceAnalysis(stats: PlayerStats): Promise<{ archetype: string; analysis: string }> {
    if (!stats || stats.totalMatches === 0) {
        return {
            archetype: "Newcomer",
            analysis: "Play some matches to get your performance analysis! We're excited to see what you can do.",
        };
    }
    // Map the PlayerStats object to the schema expected by the Genkit flow.
    const inputForAI: PlayerPerformanceInput = {
        totalMatches: stats.totalMatches,
        totalWins: stats.totalWins,
        totalLosses: stats.totalLosses,
        totalDraws: stats.totalDraws,
        totalGoals: stats.totalGoals,
        totalConceded: stats.totalConceded,
        totalCleanSheets: stats.totalCleanSheets,
        avgPossession: stats.avgPossession,
        totalShots: stats.totalShots,
        totalShotsOnTarget: stats.totalShotsOnTarget,
        totalPasses: stats.totalPasses,
        totalTackles: stats.totalTackles,
        totalInterceptions: stats.totalInterceptions,
        totalSaves: stats.totalSaves,
    };
    const result = await analyzePlayerPerformance(inputForAI);
    return result;
}

export async function setOrganizerStreamUrl(tournamentId: string, matchId: string, streamUrl: string, organizerId: string) {
    const tournamentRef = adminDb.collection('tournaments').doc(tournamentId);
    const tournamentDoc = await tournamentRef.get();
    if (!tournamentDoc.exists || tournamentDoc.data()?.organizerId !== organizerId) {
        throw new Error("You are not authorized to perform this action.");
    }
    const organizerProfile = await adminAuth.getUser(organizerId);

    const matchRef = tournamentRef.collection('matches').doc(matchId);
    const fieldPath = `streamLinks.organizer`;
    await matchRef.update({
        [fieldPath]: { username: `${organizerProfile.displayName || 'Organizer'} (Official)`, url: streamUrl }
    });

    revalidatePath(`/tournaments/${tournamentId}`);
}

export async function submitPlayerStreamUrl(tournamentId: string, matchId: string, userId: string, username: string, streamUrl: string) {
    const matchRef = adminDb.collection('tournaments').doc(tournamentId).collection('matches').doc(matchId);
    const matchDoc = await matchRef.get();
    if (!matchDoc.exists) throw new Error("Match not found.");

    const matchData = matchDoc.data() as Match;
    const homeTeamDoc = await adminDb.collection('tournaments').doc(tournamentId).collection('teams').doc(matchData.homeTeamId).get();
    const awayTeamDoc = await adminDb.collection('tournaments').doc(tournamentId).collection('teams').doc(matchData.awayTeamId).get();
    if (!homeTeamDoc.exists || !awayTeamDoc.exists) throw new Error("Teams not found.");
    
    const homeTeam = homeTeamDoc.data() as Team;
    const awayTeam = awayTeamDoc.data() as Team;

    if (userId !== homeTeam.captainId && userId !== awayTeam.captainId) {
        throw new Error("You are not a participant in this match.");
    }

    const fieldPath = `streamLinks.${userId}`;
    await matchRef.update({
        [fieldPath]: { username, url: streamUrl }
    });
    revalidatePath(`/tournaments/${tournamentId}`);
}

export async function getMatchPrediction(matchId: string, tournamentId: string) {
    const matchRef = adminDb.collection('tournaments').doc(tournamentId).collection('matches').doc(matchId);
    const matchDoc = await matchRef.get();
    if (!matchDoc.exists) throw new Error("Match not found.");
    const match = matchDoc.data() as Match;

    const homeTeamDoc = await adminDb.collection('tournaments').doc(tournamentId).collection('teams').doc(match.homeTeamId).get();
    const awayTeamDoc = await adminDb.collection('tournaments').doc(tournamentId).collection('teams').doc(match.awayTeamId).get();
    if (!homeTeamDoc.exists || !awayTeamDoc.exists) throw new Error("Team details not found.");
    const homeTeam = homeTeamDoc.data() as Team;
    const awayTeam = awayTeamDoc.data() as Team;

    const [homePlayerStats, awayPlayerStats] = await Promise.all([
        getPlayerStats(homeTeam.captainId),
        getPlayerStats(awayTeam.captainId)
    ]);

    const formatStatsForAI = (stats: PlayerStats, teamName: string) => ({
        teamName,
        winPercentage: stats.totalMatches > 0 ? Math.round((stats.totalWins / stats.totalMatches) * 100) : 0,
        avgGoalsFor: stats.totalMatches > 0 ? parseFloat((stats.totalGoals / stats.totalMatches).toFixed(1)) : 0,
        avgGoalsAgainst: stats.totalMatches > 0 ? parseFloat((stats.totalConceded / stats.totalMatches).toFixed(1)) : 0,
    });

    const aiInput: PredictWinnerInput = {
        homeTeam: formatStatsForAI(homePlayerStats, homeTeam.name),
        awayTeam: formatStatsForAI(awayPlayerStats, awayTeam.name),
    };

    const prediction = await predictMatchWinner(aiInput);
    return serializeData(prediction);
}

export async function regenerateTournamentFixtures(tournamentId: string, organizerId: string) {
    const tournamentRef = adminDb.collection('tournaments').doc(tournamentId);
    const tournamentDoc = await tournamentRef.get();
    if (!tournamentDoc.exists) throw new Error("Tournament not found");
    const tournament = tournamentDoc.data() as Tournament;

    if (tournament.organizerId !== organizerId) {
        throw new Error("You are not authorized to perform this action.");
    }
    
    if (tournament.status !== 'ready_to_start' && tournament.status !== 'in_progress') {
        throw new Error("Fixtures can only be regenerated for tournaments that are ready to start or in progress.");
    }

    // Check if any match has a report
    const matchesSnapshot = await tournamentRef.collection('matches').get();
    const hasPlayedMatches = matchesSnapshot.docs.some(doc => doc.data().status !== 'scheduled');
    if (hasPlayedMatches) {
        throw new Error("Cannot regenerate fixtures after matches have been played or reported.");
    }

    // Delete existing fixtures
    const batchDelete = adminDb.batch();
    matchesSnapshot.docs.forEach(doc => batchDelete.delete(doc.ref));
    await batchDelete.commit();

    // Start the generation process again
    await startTournamentAndGenerateFixtures(tournamentId, organizerId);

    revalidatePath(`/tournaments/${tournamentId}`);
}

export async function requestPlayerReplay(tournamentId: string, matchId: string, requesterId: string, reason: string) {
    const matchRef = adminDb.collection('tournaments').doc(tournamentId).collection('matches').doc(matchId);
    const request: ReplayRequest = {
        requestedBy: requesterId,
        reason,
        status: 'pending',
    };
    await matchRef.update({ replayRequest: request });
    
    const matchDoc = await matchRef.get();
    const matchData = matchDoc.data() as Match;
    
    const homeTeamDoc = await adminDb.collection('tournaments').doc(tournamentId).collection('teams').doc(matchData.homeTeamId).get();
    const awayTeamDoc = await adminDb.collection('tournaments').doc(tournamentId).collection('teams').doc(matchData.awayTeamId).get();

    const opponentCaptainId = requesterId === homeTeamDoc.data()?.captainId ? awayTeamDoc.data()?.captainId : homeTeamDoc.data()?.captainId;
    const requesterUsername = requesterId === homeTeamDoc.data()?.captainId ? homeTeamDoc.data()?.name : awayTeamDoc.data()?.name;
    
    if (opponentCaptainId) {
        await sendNotification(opponentCaptainId, {
            userId: opponentCaptainId,
            tournamentId,
            title: "Replay Request",
            body: `${requesterUsername} has requested a replay for your match.`,
            href: `/tournaments/${tournamentId}?tab=my-matches`
        });
    }

    revalidatePath(`/tournaments/${tournamentId}`);
}

export async function respondToPlayerReplay(tournamentId: string, matchId: string, responderId: string, accepted: boolean) {
    const matchRef = adminDb.collection('tournaments').doc(tournamentId).collection('matches').doc(matchId);
    const tournamentRef = adminDb.collection('tournaments').doc(tournamentId);

    const matchDoc = await matchRef.get();
    const matchData = matchDoc.data() as Match;

    if (!matchData.replayRequest || matchData.replayRequest.status !== 'pending') {
        throw new Error("No active replay request found.");
    }
    
    const newStatus = accepted ? 'accepted' : 'rejected';
    await matchRef.update({
        'replayRequest.status': newStatus,
        'replayRequest.respondedBy': responderId
    });

    const tournamentDoc = await tournamentRef.get();
    const tournament = tournamentDoc.data() as Tournament;

    await sendNotification(tournament.organizerId, {
        userId: tournament.organizerId,
        tournamentId,
        title: "Replay Request Responded",
        body: `A replay request for a match in "${tournament.name}" has been ${newStatus}. Your approval may be required.`,
        href: `/tournaments/${tournamentId}?tab=schedule`
    });

    revalidatePath(`/tournaments/${tournamentId}`);
}

export async function organizerApproveReplay(tournamentId: string, matchId: string, organizerId: string, approve: boolean) {
    const tournamentRef = adminDb.collection('tournaments').doc(tournamentId);
    const tournamentDoc = await tournamentRef.get();
    if(tournamentDoc.data()?.organizerId !== organizerId) throw new Error("Not authorized.");

    const matchRef = tournamentRef.collection('matches').doc(matchId);
    const matchDoc = await matchRef.get();
    const request = matchDoc.data()?.replayRequest as ReplayRequest;

    if (request.status !== 'accepted') throw new Error("Replay was not accepted by both players.");

    if (approve) {
        await scheduleRematch(tournamentId, matchId, "Replay approved by organizer after player agreement.");
    } else {
        await matchRef.update({
            'replayRequest.status': 'organizer-rejected'
        });
    }
    revalidatePath(`/tournaments/${tournamentId}`);
}

export async function organizerExtendLeagueDeadline(tournamentId: string, matchId: string, organizerId: string, hours: number) {
    const tournamentRef = adminDb.collection('tournaments').doc(tournamentId);
    const tournamentDoc = await tournamentRef.get();
    if (!tournamentDoc.exists || tournamentDoc.data()?.organizerId !== organizerId) {
        throw new Error("You are not authorized to perform this action.");
    }
    const tournamentData = tournamentDoc.data() as Tournament;
    if (tournamentData.format !== 'league') {
        throw new Error("This action is only available for league tournaments.");
    }
    
    const matchRef = tournamentRef.collection('matches').doc(matchId);
    const matchDoc = await matchRef.get();
    if (!matchDoc.exists) {
        throw new Error("Match not found.");
    }
    const match = matchDoc.data() as Match;

    const currentMatchDay = toAdminDate(match.matchDay);
    const newMatchDay = addHours(currentMatchDay, hours);
    
    const updateData: any = {
        matchDay: Timestamp.fromDate(newMatchDay),
        deadlineExtended: true,
    };
    
    // If the match was forfeited, we need to reset it.
    if (match.status === 'approved' && match.wasAutoForfeited) {
        // Revert player stats
        const homeTeamDoc = await tournamentRef.collection('teams').doc(match.homeTeamId).get();
        const awayTeamDoc = await tournamentRef.collection('teams').doc(match.awayTeamId).get();
        if (homeTeamDoc.exists && awayTeamDoc.exists) {
            const homeTeam = homeTeamDoc.data() as Team;
            const awayTeam = awayTeamDoc.data() as Team;
            
            await adminDb.runTransaction(async (transaction) => {
                const homeStatsRef = adminDb.collection('playerStats').doc(homeTeam.captainId);
                const awayStatsRef = adminDb.collection('playerStats').doc(awayTeam.captainId);
                const homeStatsDoc = await transaction.get(homeStatsRef);
                const awayStatsDoc = await transaction.get(awayStatsRef);
                
                if (homeStatsDoc.exists) {
                    const stats = homeStatsDoc.data() as PlayerStats;
                    revertSinglePlayerStats(stats, tournamentId, tournamentData.name, match, true);
                    transaction.set(homeStatsRef, stats);
                }
                if (awayStatsDoc.exists) {
                    const stats = awayStatsDoc.data() as PlayerStats;
                    revertSinglePlayerStats(stats, tournamentId, tournamentData.name, match, false);
                    transaction.set(awayStatsRef, stats);
                }
            });
        }
        
        // Reset match properties
        updateData.status = 'scheduled';
        updateData.homeScore = null;
        updateData.awayScore = null;
        updateData.resolutionNotes = `Deadline extended by organizer. Previous result voided.`;
        updateData.wasAutoForfeited = false;
        updateData.homeTeamReport = FieldValue.delete();
        updateData.awayTeamReport = FieldValue.delete();
        updateData.homeTeamStats = FieldValue.delete();
        updateData.awayTeamStats = FieldValue.delete();
    }
    
    await matchRef.update(updateData);
    
    // Re-calculate standings if a result was reversed
    if (match.status === 'approved' && match.wasAutoForfeited) {
        await updateStandings(tournamentId);
    }
    
    revalidatePath(`/tournaments/${tournamentId}`);
}

export async function organizerForceReplayProblematicMatches(tournamentId: string, organizerId: string, reason: string) {
    const tournamentRef = adminDb.collection('tournaments').doc(tournamentId);
    
    const tournamentDoc = await tournamentRef.get();
    if (!tournamentDoc.exists || tournamentDoc.data()?.organizerId !== organizerId) {
        throw new Error("You are not authorized to perform this action.");
    }
    const tournament = tournamentDoc.data() as Tournament;
    
    const allMatchesSnapshot = await tournamentRef.collection('matches').get();
    const problematicMatches = allMatchesSnapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() } as Match))
        .filter(match => {
            const isAutoForfeit = match.status === 'approved' && match.wasAutoForfeited === true;
            const isStuck = ['awaiting_confirmation', 'needs_secondary_evidence', 'disputed'].includes(match.status);
            return isStuck || isAutoForfeit;
        });

    if (problematicMatches.length === 0) {
        throw new Error("No problematic matches found to replay.");
    }

    const matchesToRevertStats = problematicMatches.filter(m => m.status === 'approved');
    
    // Batch all reads first
    const teamIds = new Set<string>();
    matchesToRevertStats.forEach(match => {
        teamIds.add(match.homeTeamId);
        teamIds.add(match.awayTeamId);
    });
    
    const teamsMap = new Map<string, Team>();
    const playerStatsMap = new Map<string, PlayerStats>();

    if (teamIds.size > 0) {
        const teamRefs = Array.from(teamIds).map(id => tournamentRef.collection('teams').doc(id));
        const teamDocs = await adminDb.getAll(...teamRefs);
        const captainIds = new Set<string>();
        teamDocs.forEach(doc => {
            if (doc.exists) {
                const team = { id: doc.id, ...doc.data() } as Team;
                teamsMap.set(doc.id, team);
                captainIds.add(team.captainId);
            }
        });

        if(captainIds.size > 0) {
            const playerStatsRefs = Array.from(captainIds).map(id => adminDb.collection('playerStats').doc(id));
            const playerStatsDocs = await adminDb.getAll(...playerStatsRefs);
            playerStatsDocs.forEach(doc => {
                if (doc.exists) {
                    playerStatsMap.set(doc.id, doc.data() as PlayerStats);
                }
            });
        }
    }

    // Perform calculations in memory
    for (const match of matchesToRevertStats) {
        const homeTeam = teamsMap.get(match.homeTeamId);
        const awayTeam = teamsMap.get(match.awayTeamId);
        if (!homeTeam || !awayTeam) continue;

        const homeCaptainStats = playerStatsMap.get(homeTeam.captainId);
        const awayCaptainStats = playerStatsMap.get(awayTeam.captainId);

        if (homeCaptainStats) revertSinglePlayerStats(homeCaptainStats, tournamentId, tournament.name, match, true);
        if (awayCaptainStats) revertSinglePlayerStats(awayCaptainStats, tournamentId, tournament.name, match, false);
    }
    
    // Batch all writes
    const writeBatch = adminDb.batch();

    playerStatsMap.forEach((stats, userId) => {
        const statsRef = adminDb.collection('playerStats').doc(userId);
        writeBatch.set(statsRef, stats);
    });

    const fullReason = `Organizer forced mass replay: ${reason}`;
    for (const match of problematicMatches) {
        const matchRef = tournamentRef.collection('matches').doc(match.id);
        writeBatch.update(matchRef, {
            status: 'scheduled',
            homeScore: null,
            awayScore: null,
            homeTeamReport: FieldValue.delete(),
            awayTeamReport: FieldValue.delete(),
            homeTeamSecondaryReport: FieldValue.delete(),
            awayTeamSecondaryReport: FieldValue.delete(),
            homeTeamStats: FieldValue.delete(),
            awayTeamStats: FieldValue.delete(),
            resolutionNotes: fullReason,
            wasAutoForfeited: false,
            replayRequest: FieldValue.delete(),
            matchDay: Timestamp.fromDate(toAdminDate(match.matchDay)),
            isReplay: true,
        });
    }

    await writeBatch.commit();
    
    await updateStandings(tournamentId);
    revalidatePath(`/tournaments/${tournamentId}`);
    return problematicMatches.length;
}

export async function checkAndAwardAchievements(userId: string) {
    const userRef = adminDb.collection('users').doc(userId);
    const statsRef = adminDb.collection('playerStats').doc(userId);

    const [userDoc, statsDoc] = await Promise.all([userRef.get(), statsRef.get()]);

    if (!userDoc.exists) {
        console.error(`User profile not found for achievement check: ${userId}`);
        return;
    }
    const userProfile = userDoc.data() as UserProfile;
    const playerStats = statsDoc.exists ? statsDoc.data() as PlayerStats : createDefaultPlayerStats(userId);
    
    const updates: Record<string, any> = {};
    const newTitles: PlayerTitle[] = [];

    for (const achievement of allAchievements) {
        const progress = achievement.evaluator(userProfile, playerStats);
        const currentTierIndex = userProfile.earnedAchievements?.[achievement.id]?.tier ?? -1;
        const nextTier = achievement.tiers[currentTierIndex + 1];
        
        if (nextTier && progress >= nextTier.value) {
            const unlockedTierIndex = currentTierIndex + 1;
            const unlockedTier = achievement.tiers[unlockedTierIndex];
            
            updates[`earnedAchievements.${achievement.id}`] = {
                achievementId: achievement.id,
                tier: unlockedTierIndex,
                unlockedAt: Timestamp.now(),
                progress: progress,
            };

            await sendNotification(userId, {
                userId,
                title: 'Achievement Unlocked!',
                body: `You've earned the ${unlockedTier.name} ${achievement.name} badge!`,
                href: `/profile/${userId}`,
            });

            // Logic to award titles for Gold tier achievements
            if (unlockedTier.name === 'Gold') {
                const titleMap: Record<string, string> = {
                    'tournament-victor': 'Tournament Champion',
                    'earena-veteran': 'eArena Veteran',
                    'golden-boot': 'Golden Boot',
                    'iron-wall': 'The Unbreakable Wall'
                };
                if (titleMap[achievement.id]) {
                     const newTitle: PlayerTitle = {
                        title: titleMap[achievement.id],
                        unlockedAt: Timestamp.now(),
                        sourceAchievementId: achievement.id,
                     };
                     newTitles.push(newTitle);
                }
            }
        } else if (userProfile.earnedAchievements?.[achievement.id]) {
            // If achievement exists, just update its progress
            updates[`earnedAchievements.${achievement.id}.progress`] = progress;
        }
    }

    if (newTitles.length > 0) {
        updates['playerTitles'] = FieldValue.arrayUnion(...newTitles);
    }
    
    if (Object.keys(updates).length > 0) {
        await userRef.update(updates);
        revalidatePath(`/profile/${userId}`);
    }
}


export async function updateUserActiveTitle(userId: string, title: string | null) {
    const userRef = adminDb.collection('users').doc(userId);
    await userRef.update({ activeTitle: title || FieldValue.delete() });
    revalidatePath(`/profile/${userId}`);
}


// Leaderboards
export async function getLeaderboardByWins() {
    const statsSnapshot = await adminDb.collection('playerStats')
        .orderBy('totalWins', 'desc')
        .limit(20)
        .get();

    if (statsSnapshot.empty) return [];
    
    const userIds = statsSnapshot.docs.map(doc => doc.id);
    const usersSnapshot = await adminDb.collection('users').where('uid', 'in', userIds).get();
    const usersMap = new Map<string, UserProfile>();
    usersSnapshot.docs.forEach(doc => usersMap.set(doc.id, doc.data() as UserProfile));
    
    const leaderboard = statsSnapshot.docs.map(doc => {
        const stats = doc.data() as PlayerStats;
        const profile = usersMap.get(doc.id);
        return {
            ...profile,
            ...stats,
        };
    }).filter(item => item.uid); // Ensure profile was found

    return serializeData(leaderboard);
}

export async function getLeaderboardByTournamentsWon() {
    const usersSnapshot = await adminDb.collection('users')
        .orderBy('tournamentsWon', 'desc')
        .limit(20)
        .get();

    if (usersSnapshot.empty) return [];

    return usersSnapshot.docs.map(doc => serializeData(doc.data()) as UserProfile);
}

export async function getLeaderboardByGoals() {
    const statsSnapshot = await adminDb.collection('playerStats')
        .orderBy('totalGoals', 'desc')
        .limit(20)
        .get();

    if (statsSnapshot.empty) return [];
    
    const userIds = statsSnapshot.docs.map(doc => doc.id);
    const usersSnapshot = await adminDb.collection('users').where('uid', 'in', userIds).get();
    const usersMap = new Map<string, UserProfile>();
    usersSnapshot.docs.forEach(doc => usersMap.set(doc.id, doc.data() as UserProfile));
    
    const leaderboard = statsSnapshot.docs.map(doc => {
        const stats = doc.data() as PlayerStats;
        const profile = usersMap.get(doc.id);
        return {
            ...profile,
            ...stats,
        };
    }).filter(item => item.uid);

    return serializeData(leaderboard);
}

export async function getLeaderboardByReputation() {
    const usersSnapshot = await adminDb.collection('users')
        .orderBy('warnings', 'asc')
        .limit(20)
        .get();
        
    if (usersSnapshot.empty) return [];

    return usersSnapshot.docs.map(doc => serializeData(doc.data()) as UserProfile);
}

// Admin Actions

export async function adminGetAllUsers(): Promise<UserProfile[]> {
    const usersSnapshot = await adminDb.collection('users').get();
    return usersSnapshot.docs.map(doc => serializeData({ uid: doc.id, ...doc.data()}) as UserProfile);
}

export async function adminGetAllTournaments(): Promise<Tournament[]> {
    const tourneysSnapshot = await adminDb.collection('tournaments').orderBy('createdAt', 'desc').get();
    return tourneysSnapshot.docs.map(doc => serializeData({ id: doc.id, ...doc.data()}) as Tournament);
}

export async function adminUpdateUser(uid: string, data: Partial<UserProfile>) {
    const userRef = adminDb.collection('users').doc(uid);
    await userRef.update(data);
    if (typeof data.isBanned !== 'undefined') {
        await adminAuth.updateUser(uid, { disabled: data.isBanned });
    }
    revalidatePath('/admin/user-management');
}

async function fullTournamentDelete(tournamentId: string) {
    const subcollections = ['teams', 'matches', 'announcements', 'messages'];
    for (const subcollection of subcollections) {
        await deleteCollection(`tournaments/${tournamentId}/${subcollection}`, 100);
    }
    // Delete associated standings
    const standingsQuery = adminDb.collection('standings').where('tournamentId', '==', tournamentId);
    const standingsSnapshot = await standingsQuery.get();
    const standingsBatch = adminDb.batch();
    standingsSnapshot.docs.forEach(doc => standingsBatch.delete(doc.ref));
    await standingsBatch.commit();
    
    // Delete user memberships
    const membershipsQuery = adminDb.collection('userMemberships').where('tournamentId', '==', tournamentId);
    const membershipsSnapshot = await membershipsQuery.get();
    const membershipsBatch = adminDb.batch();
    membershipsSnapshot.docs.forEach(doc => membershipsBatch.delete(doc.ref));
    await membershipsBatch.commit();

    // Finally delete the tournament doc
    await adminDb.collection('tournaments').doc(tournamentId).delete();
}


export async function adminDeleteTournament(tournamentId: string) {
    await fullTournamentDelete(tournamentId);
    revalidatePath('/admin/tournaments');
}

export async function adminCreateArticle(data: Omit<Article, 'id' | 'createdAt'>) {
    const slug = data.slug;
    const docRef = adminDb.collection('articles').doc(slug);
    const doc = await docRef.get();
    if (doc.exists) {
        throw new Error(`An article with the slug "${slug}" already exists.`);
    }
    
    const articleData: Omit<Article, 'id'> = {
        ...data,
        createdAt: FieldValue.serverTimestamp() as UnifiedTimestamp,
    };
    
    await docRef.set(articleData);
    revalidatePath('/community');
    revalidatePath(`/community/articles/${slug}`);
    revalidatePath('/admin/community');
}

export async function adminUpdateArticle(slug: string, data: Partial<Omit<Article, 'id' | 'slug' | 'createdAt'>>) {
    const docRef = adminDb.collection('articles').doc(slug);
    await docRef.update(data);

    revalidatePath('/community');
    revalidatePath(`/community/articles/${slug}`);
    revalidatePath(`/admin/community/edit/${slug}`);
}

export async function adminDeleteArticle(slug: string) {
    const docRef = adminDb.collection('articles').doc(slug);
    await docRef.delete();
    revalidatePath('/community');
    revalidatePath('/admin/community');
}

export async function getPlatformSettings(): Promise<PlatformSettings> {
    const settingsRef = adminDb.collection('platformSettings').doc('config');
    const doc = await settingsRef.get();
    if (!doc.exists) {
        const defaultSettings = {
            isMaintenanceMode: false,
            allowNewTournaments: true,
        };
        await settingsRef.set(defaultSettings);
        return defaultSettings;
    }
    return doc.data() as PlatformSettings;
}

export async function updatePlatformSettings(data: PlatformSettings) {
    const settingsRef = adminDb.collection('platformSettings').doc('config');
    await settingsRef.set(data, { merge: true });
    revalidatePath('/admin/settings');
}
