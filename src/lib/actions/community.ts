
'use server';

import { adminDb } from '@/lib/firebase-admin';
import type { Announcement, Article } from '@/lib/types';
import { FieldValue, orderBy, collection, query, doc, getDoc } from 'firebase-admin/firestore';
import { sendNotification } from './notifications';
import { serializeData } from './helpers';

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
