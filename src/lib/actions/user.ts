
'use server';

import { adminDb } from '@/lib/firebase-admin';
import type { UserProfile, PlayerStats, Conversation } from '@/lib/types';
import { FieldValue } from 'firebase-admin/firestore';
import { revalidatePath } from 'next/cache';
import { getAdminUids } from './admin';
import { serializeData } from '@/lib/utils';
import { analyzePlayerPerformance, type PlayerPerformanceInput, type PlayerPerformanceOutput } from '@/ai/flows/analyze-player-performance';

export async function updateUserProfile(uid: string, data: Partial<UserProfile>) {
  const userRef = adminDb.collection('users').doc(uid);
  
  const updateData: Partial<UserProfile> = { ...data };
  if(data.username) {
      updateData.username_lowercase = data.username.toLowerCase();
  }

  await userRef.update(updateData);
  revalidatePath(`/profile/${uid}`);
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
    const snapshot = await usersRef.where('uid', 'in', uids).get();
    return snapshot.docs.map(doc => serializeData(doc.data()) as UserProfile);
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
            convo.participants = convo.participants.map(p => p.uid === otherParticipantId && userProfile ? userProfile : p);
        }
        return convo;
    }));

    return serializeData(conversations);
}

export async function getPlayerPerformanceAnalysis(stats: PlayerPerformanceInput): Promise<PlayerPerformanceOutput> {
  // The Genkit flow is already a server function, so we can just call it directly.
  return analyzePlayerPerformance(stats);
}
