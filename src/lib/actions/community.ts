
'use server';

import { adminDb } from '@/lib/firebase-admin';
import type { Announcement, Article, Match, Team } from '@/lib/types';
import { FieldValue, orderBy, collection, query, doc, getDoc } from 'firebase-admin/firestore';
import { sendNotification } from './notifications';
import { serializeData } from '@/lib/utils';
import { revalidatePath } from 'next/cache';
import { getUserProfileById } from './user';

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
    const allPlayerIds = teamsSnapshot.docs.flatMap(doc => (doc.data() as any).playerIds);
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

export async function getArticles(): Promise<Article[]> {
    const snapshot = await adminDb.collection('articles').orderBy('createdAt', 'desc').get();
    return snapshot.docs.map(doc => serializeData({ id: doc.id, ...doc.data() }) as Article);
}

export async function getArticleBySlug(slug: string): Promise<Article | null> {
    const docRef = doc(adminDb, 'articles', slug);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
        return serializeData({ id: docSnap.id, ...docSnap.data() }) as Article;
    }
    return null;
}

export async function postTournamentMessage(tournamentId: string, userId: string, username: string, photoURL: string | undefined, message: string) {
    const messageRef = adminDb.collection('tournaments').doc(tournamentId).collection('messages').doc();
    await messageRef.set({
        userId,
        username,
        photoURL: photoURL || '',
        message,
        timestamp: FieldValue.serverTimestamp(),
    });
    revalidatePath(`/tournaments/${tournamentId}`);
}

export async function postTeamMessage(tournamentId: string, teamId: string, userId: string, username: string, photoURL: string | undefined, message: string) {
    const messageRef = adminDb.collection('tournaments').doc(tournamentId).collection('teams').doc(teamId).collection('messages').doc();
    await messageRef.set({
        userId,
        username,
        photoURL: photoURL || '',
        message,
        timestamp: FieldValue.serverTimestamp(),
    });
    // no revalidation needed for private team chat
}

export async function postMatchMessage(tournamentId: string, matchId: string, userId: string, username: string, photoURL: string | undefined, message: string) {
    const messageRef = adminDb.collection('tournaments').doc(tournamentId).collection('matches').doc(matchId).collection('messages').doc();
    const matchRef = adminDb.collection('tournaments').doc(tournamentId).collection('matches').doc(matchId);

    const matchDoc = await matchRef.get();
    if (!matchDoc.exists) {
        throw new Error('Match not found');
    }

    const matchData = matchDoc.data() as Match;

    // Find the sender's team in this tournament
    const teamsRef = adminDb.collection('tournaments').doc(tournamentId).collection('teams');
    const userTeamQuery = await teamsRef.where('playerIds', 'array-contains', userId).limit(1).get();
    if (userTeamQuery.empty) {
        throw new Error("You are not part of a team in this tournament.");
    }
    const userTeamId = userTeamQuery.docs[0].id;

    const opponentTeamId = matchData.homeTeamId === userTeamId ? matchData.awayTeamId : matchData.homeTeamId;

    const opponentTeamDoc = await teamsRef.doc(opponentTeamId).get();
    if (!opponentTeamDoc.exists) {
        // This case should be rare but good to handle
        console.warn(`Could not find opponent team ${opponentTeamId} to send notification.`);
        return; // Don't throw, just post message
    }
    const opponentTeamData = opponentTeamDoc.data() as Team;

    await messageRef.set({
        userId,
        username,
        photoURL: photoURL || '',
        message,
        timestamp: FieldValue.serverTimestamp(),
    });

    // Notify opponent captain
    await sendNotification(opponentTeamData.captainId, {
        userId: opponentTeamData.captainId,
        tournamentId,
        title: `New message for your match`,
        body: `${username}: ${message.substring(0, 50)}...`,
        href: `/tournaments/${tournamentId}/matches/${matchId}`,
    });
}
