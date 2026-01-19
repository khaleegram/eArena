

'use server';

import { adminDb, adminAuth } from '@/lib/firebase-admin';
import type { UserProfile, PlayerStats, Conversation, PlayerTitle } from '@/lib/types';
import { FieldValue } from 'firebase-admin/firestore';
import { revalidatePath } from 'next/cache';
import { getAdminUids } from './admin';
import { serializeData } from '@/lib/utils';
import { sendNotification } from './notifications';
import { getStorage } from 'firebase-admin/storage';
import { sendEmail } from '../email';

export async function updateUserProfile(uid: string, data: Partial<UserProfile>) {
  const userRef = adminDb.collection('users').doc(uid);
  
  const updateData: Partial<UserProfile> = { ...data };
  if(data.username) {
      updateData.username_lowercase = data.username.toLowerCase();
  }

  await userRef.update(updateData);
  revalidatePath(`/profile/${uid}`);
  revalidatePath(`/profile`);
}

export async function updateUserProfilePhoto(uid: string, formData: FormData) {
    const photo = formData.get('photo') as File;
    if(!photo) {
        throw new Error("No photo provided");
    }

    const bucket = getStorage().bucket(process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET);
    const fileName = `users/${uid}/avatars/${Date.now()}_${photo.name}`;
    const file = bucket.file(fileName);

    const stream = file.createWriteStream({
        metadata: { contentType: photo.type },
    });
    
    const buffer = Buffer.from(await photo.arrayBuffer());
    
    await new Promise((resolve, reject) => {
        stream.on('error', reject);
        stream.on('finish', resolve);
        stream.end(buffer);
    });

    const photoURL = await file.getSignedUrl({
        action: 'read',
        expires: '03-09-2491',
    }).then(urls => urls[0]);

    await adminDb.collection('users').doc(uid).update({ photoURL });
    revalidatePath(`/profile/${uid}`);
    revalidatePath(`/profile`);
}

export async function getUserProfileById(uid: string): Promise<UserProfile | null> {
  const userDoc = await adminDb.collection('users').doc(uid).get();
  if (!userDoc.exists) return null;
  return serializeData({ uid: userDoc.id, ...userDoc.data() }) as UserProfile;
}

export async function getPlayerStats(uid: string): Promise<PlayerStats> {
  const statsDoc = await adminDb.collection('playerStats').doc(uid).get();
  if (!statsDoc.exists) {
    // Return a default structure if no stats exist
    return {
      totalMatches: 0, totalWins: 0, totalLosses: 0, totalDraws: 0,
      totalGoals: 0, totalConceded: 0, totalCleanSheets: 0,
      avgPossession: 0, totalPassPercentageSum: 0, matchesWithPassStats: 0,
      totalShots: 0, totalShotsOnTarget: 0, totalPasses: 0,
      totalTackles: 0, totalInterceptions: 0, totalSaves: 0,
      performanceHistory: []
    };
  }
  return serializeData(statsDoc.data()) as PlayerStats;
}

export async function handleNewUserSetup(userId: string) {
    const adminUids = await getAdminUids();
    for (const adminId of adminUids) {
        if (adminId !== userId) {
            await adminDb.collection('users').doc(adminId).update({
                following: FieldValue.arrayUnion(userId)
            });
            await adminDb.collection('users').doc(userId).update({
                followers: FieldValue.arrayUnion(adminId)
            });
        }
    }
}


export async function followUser(currentUserId: string, targetUserId: string) {
    const currentUserRef = adminDb.collection('users').doc(currentUserId);
    const targetUserRef = adminDb.collection('users').doc(targetUserId);

    const batch = adminDb.batch();
    batch.update(currentUserRef, { following: FieldValue.arrayUnion(targetUserId) });
    batch.update(targetUserRef, { followers: FieldValue.arrayUnion(currentUserId) });
    await batch.commit();

    revalidatePath(`/profile/${targetUserId}`);
}

export async function unfollowUser(currentUserId: string, targetUserId: string) {
    const currentUserRef = adminDb.collection('users').doc(currentUserId);
    const targetUserRef = adminDb.collection('users').doc(targetUserId);

    const batch = adminDb.batch();
    batch.update(currentUserRef, { following: FieldValue.arrayRemove(targetUserId) });
    batch.update(targetUserRef, { followers: FieldValue.arrayRemove(currentUserId) });
    await batch.commit();

    revalidatePath(`/profile/${targetUserId}`);
}

export async function getUsersByIds(uids: string[]): Promise<UserProfile[]> {
    if (uids.length === 0) return [];
    const usersRef = adminDb.collection('users');
    const chunks: string[][] = [];
    for (let i = 0; i < uids.length; i += 30) {
        chunks.push(uids.slice(i, i + 30));
    }

    const profiles: UserProfile[] = [];
    for (const chunk of chunks) {
        const snapshot = await usersRef.where('uid', 'in', chunk).get();
        snapshot.forEach(doc => {
            profiles.push(serializeData({ uid: doc.id, ...doc.data()}) as UserProfile);
        });
    }
    
    return profiles;
}

export async function getConversationsForUser(userId: string): Promise<Conversation[]> {
    const conversationsSnapshot = await adminDb.collection('conversations')
        .where('participantIds', 'array-contains', userId)
        .orderBy('lastMessage.timestamp', 'desc')
        .get();

    const conversations = await Promise.all(conversationsSnapshot.docs.map(async (doc) => {
        const convo = { id: doc.id, ...doc.data() } as Conversation;
        const otherParticipantId = convo.participantIds.find(id => id !== userId);
        if (otherParticipantId) {
            const userProfile = await getUserProfileById(otherParticipantId);
            if (userProfile) {
                convo.participants = convo.participants.map(p => p.uid === otherParticipantId ? userProfile : p);
            }
        }
        return convo;
    }));

    return serializeData(conversations);
}

export async function getConversationById(conversationId: string, userId: string): Promise<Conversation | null> {
    const conversationRef = adminDb.collection('conversations').doc(conversationId);
    const conversationDoc = await conversationRef.get();

    if (!conversationDoc.exists) {
        return null;
    }

    const conversation = conversationDoc.data() as Conversation;

    // Security check: ensure the user is part of this conversation
    if (!conversation.participantIds.includes(userId)) {
        // Silently fail to prevent leaking information about conversation existence
        return null;
    }

    // Enrich participants' data
    const enrichedParticipants = await Promise.all(
        conversation.participantIds.map(id => getUserProfileById(id))
    );
    
    conversation.participants = enrichedParticipants.filter(p => p !== null) as UserProfile[];
    conversation.id = conversationDoc.id;

    return serializeData(conversation);
}

export async function postDirectMessage(conversationId: string, message: string, senderId: string) {
    const conversationRef = adminDb.collection('conversations').doc(conversationId);
    const userProfile = await getUserProfileById(senderId);

    if (!userProfile) {
        throw new Error("Sender profile not found.");
    }

    const timestamp = FieldValue.serverTimestamp();

    const messageData = {
        message,
        userId: senderId,
        username: userProfile.username || userProfile.email,
        photoURL: userProfile.photoURL || '',
        timestamp,
    };
    
    // Add to subcollection
    await conversationRef.collection('messages').add(messageData);

    // Update last message on parent doc for sorting and previews
    await conversationRef.update({
        lastMessage: {
            message: message,
            timestamp: timestamp,
        },
    });

    // Send notification to the other participant
    const conversationDoc = await conversationRef.get();
    const conversation = conversationDoc.data() as Conversation;
    const otherParticipantId = conversation.participantIds.find(id => id !== senderId);
    
    if (otherParticipantId) {
        await sendNotification(otherParticipantId, {
            userId: otherParticipantId,
            title: `New message from ${userProfile.username}`,
            body: message.substring(0, 100),
            href: `/messages/${conversationId}`,
        });
    }
}


export async function findUserByEmail(email: string): Promise<UserProfile | null> {
    const usersRef = adminDb.collection('users');
    const snapshot = await usersRef.where('email', '==', email).limit(1).get();
    if (snapshot.empty) {
        return null;
    }
    const userDoc = snapshot.docs[0];
    return serializeData({ uid: userDoc.id, ...userDoc.data() }) as UserProfile;
}

export async function findUsersByUsername(username: string): Promise<UserProfile[]> {
    const usersRef = adminDb.collection('users');
    const snapshot = await usersRef
        .where('username_lowercase', '>=', username.toLowerCase())
        .where('username_lowercase', '<=', username.toLowerCase() + '\uf8ff')
        .limit(10)
        .get();
    
    return snapshot.docs.map(doc => serializeData(doc.data()) as UserProfile);
}

export async function startConversation(userId1: string, userId2: string): Promise<string> {
    const participantIds = [userId1, userId2].sort();
    const conversationId = participantIds.join('_');

    const conversationRef = adminDb.collection('conversations').doc(conversationId);
    const conversationDoc = await conversationRef.get();

    if (!conversationDoc.exists) {
        const [user1Profile, user2Profile] = await Promise.all([
            getUserProfileById(userId1),
            getUserProfileById(userId2)
        ]);

        if (!user1Profile || !user2Profile) {
            throw new Error("One or both users not found.");
        }

        await conversationRef.set({
            participantIds,
            participants: [
                { uid: user1Profile.uid, username: user1Profile.username, photoURL: user1Profile.photoURL, warnings: userProfile.warnings || 0 },
                { uid: user2Profile.uid, username: user2Profile.username, photoURL: user2Profile.photoURL, warnings: userProfile.warnings || 0 }
            ],
            createdAt: FieldValue.serverTimestamp(),
        });
    }

    return conversationId;
}

export async function updateUserActiveTitle(uid: string, title: string | null) {
    const userRef = adminDb.collection('users').doc(uid);
    await userRef.update({ activeTitle: title });
    revalidatePath(`/profile/${uid}`);
    revalidatePath(`/profile`);
}

export async function saveUserBankDetails(uid: string, bankDetails: { accountNumber: string, bankCode: string }) {
    const userRef = adminDb.collection('users').doc(uid);
    await userRef.update({ 'bankDetails.accountNumber': bankDetails.accountNumber, 'bankDetails.bankCode': bankDetails.bankCode });
    revalidatePath(`/profile`);
}

export async function confirmUserDetailsForPayout(uid: string) {
    const userRef = adminDb.collection('users').doc(uid);
    await userRef.update({ 'bankDetails.confirmedForPayout': true });
    revalidatePath(`/profile`);
}

export async function sendPasswordResetEmail(email: string) {
    const link = await adminAuth.generatePasswordResetLink(email);
    await sendEmail({
        to: email,
        subject: 'Reset Your eArena Password',
        body: `Click the following link to reset your password: ${link}`
    });
}

export async function resendVerificationEmail(email: string) {
    try {
        const user = await adminAuth.getUserByEmail(email);
        if (user && !user.emailVerified) {
            const link = await adminAuth.generateEmailVerificationLink(email);
            await sendEmail({
                to: email,
                subject: 'Verify Your eArena Email',
                body: `Click here to verify your email and activate your account: ${link}`
            });
        }
    } catch(error: any) {
        // If user not found, just fail silently.
        if (error.code !== 'auth/user-not-found') {
            console.error("Failed to resend verification email:", error);
        }
    }
}
