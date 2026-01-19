
'use server';

import { adminDb, adminAuth } from '@/lib/firebase-admin';
import type { UserProfile, Transaction, Match, DisputedMatchInfo, Team, Tournament, PlatformSettings, Article } from '@/lib/types';
import { FieldValue, getDocs, collection, query, where, orderBy, doc, Timestamp } from 'firebase-admin/firestore';
import { startOfMonth, subDays, format, eachMonthOfInterval } from 'date-fns';
import { revalidatePath } from 'next/cache';
import { toDate, serializeData } from '@/lib/utils';
import { fullTournamentDelete } from './helpers';

export async function getAdminUids(): Promise<string[]> {
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

export async function adminUpdateUser(uid: string, data: Partial<UserProfile>) {
  const userRef = adminDb.collection('users').doc(uid);
  await userRef.update(data);
  revalidatePath('/admin/user-management');
}

export async function adminGetAllUsers(): Promise<UserProfile[]> {
    const usersSnapshot = await adminDb.collection('users').get();
    return usersSnapshot.docs.map(doc => serializeData({ uid: doc.id, ...doc.data() }) as UserProfile);
}

export async function adminGetAllTournaments(): Promise<Tournament[]> {
    const snapshot = await adminDb.collection('tournaments').orderBy('createdAt', 'desc').get();
    return snapshot.docs.map(doc => serializeData({ id: doc.id, ...doc.data() }) as Tournament);
}

export async function adminDeleteTournament(tournamentId: string) {
    const tournamentRef = adminDb.collection('tournaments').doc(tournamentId);
    const doc = await tournamentRef.get();
    if (!doc.exists) throw new Error("Tournament not found");
    await fullTournamentDelete(tournamentId);
    revalidatePath('/admin/tournaments');
    revalidatePath('/dashboard');
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
        tournamentActivityQuery.get()
    ]);

    const userGrowthData: { [date: string]: number } = {};
    for (let i = 0; i < 30; i++) {
        const date = format(subDays(new Date(), i), 'MMM d');
        userGrowthData[date] = 0;
    }
    userGrowthSnapshot.forEach(doc => {
        const docDate = doc.data().createdAt;
        if(docDate){
            const date = format(toDate(docDate), 'MMM d');
            if (userGrowthData[date] !== undefined) {
                userGrowthData[date]++;
            }
        }
    });

    const tournamentActivityData: { [month: string]: number } = {};
    const months = eachMonthOfInterval({ start: sixMonthsAgo, end: new Date() });
    months.forEach(month => {
        const monthKey = format(month, 'MMM yyyy');
        tournamentActivityData[monthKey] = 0;
    });
    tournamentActivitySnapshot.forEach(doc => {
        const docDate = doc.data().createdAt;
        if(docDate){
            const monthKey = format(toDate(docDate), 'MMM yyyy');
            if (tournamentActivityData[monthKey] !== undefined) {
                tournamentActivityData[monthKey]++;
            }
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

export async function adminGetAllDisputedMatches(): Promise<DisputedMatchInfo[]> {
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
    
    enrichedMatches.sort((a, b) => toDate(b.matchDay).getTime() - toDate(a.matchDay).getTime());

    return serializeData(enrichedMatches);
}

export async function adminDeleteMatchMessage(tournamentId: string, matchId: string, messageId: string, currentUserId: string) {
    const tournamentRef = adminDb.collection('tournaments').doc(tournamentId);
    const tournamentDoc = await tournamentRef.get();
    if(tournamentDoc.data()?.organizerId !== currentUserId) {
        throw new Error("You are not authorized to delete messages in this tournament.");
    }
    const messageRef = tournamentRef.collection('matches').doc(matchId).collection('messages').doc(messageId);
    await messageRef.delete();
}

export async function adminDeleteTournamentMessage(tournamentId: string, messageId: string, currentUserId: string) {
    const tournamentRef = adminDb.collection('tournaments').doc(tournamentId);
    const tournamentDoc = await tournamentRef.get();
    if(tournamentDoc.data()?.organizerId !== currentUserId) {
        throw new Error("You are not authorized to delete messages in this tournament.");
    }
    const messageRef = tournamentRef.collection('messages').doc(messageId);
    await messageRef.delete();
}

export async function adminUpdateArticle(articleId: string, data: Partial<Article>) {
    const articleRef = adminDb.collection('articles').doc(articleId);
    await articleRef.update(data);
    revalidatePath('/admin/community');
    revalidatePath(`/community/articles/${data.slug}`);
}

export async function adminCreateArticle(data: Omit<Article, 'id' | 'createdAt'>) {
    const slugRef = adminDb.collection('articles').doc(data.slug);
    const doc = await slugRef.get();
    if (doc.exists) {
        throw new Error('An article with this slug already exists.');
    }
    await slugRef.set({
        ...data,
        createdAt: FieldValue.serverTimestamp()
    });
    revalidatePath('/admin/community');
    revalidatePath('/community');
}

export async function adminDeleteArticle(slug: string) {
    const articleRef = adminDb.collection('articles').doc(slug);
    await articleRef.delete();
    revalidatePath('/admin/community');
    revalidatePath('/community');
}

