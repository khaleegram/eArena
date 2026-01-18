
'use server';

import { adminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import type { Tournament } from '@/lib/types';
import { revalidatePath } from 'next/cache';
import { serializeData } from '@/lib/utils';
import { getTournamentAwards } from './payouts';
import { updateStandings } from './standings';

export async function getPublicTournaments(): Promise<Tournament[]> {
    const snapshot = await adminDb.collection('tournaments')
                                 .where('isPublic', '==', true)
                                 .orderBy('createdAt', 'desc')
                                 .limit(50)
                                 .get();

    return snapshot.docs.map(doc => serializeData({ id: doc.id, ...doc.data() }) as Tournament);
}

export async function getTournamentById(id: string): Promise<Tournament | null> {
    const doc = await adminDb.collection('tournaments').doc(id).get();
    if (!doc.exists) {
        return null;
    }
    return serializeData({ id: doc.id, ...doc.data() }) as Tournament;
}

export async function approveMatchResult(tournamentId: string, matchId: string, winningTeamId: string, adminNotes?: string) {
    const matchRef = adminDb.collection('tournaments').doc(tournamentId).collection('matches').doc(matchId);
    
    // In a transaction, update the match status and scores based on the winner
    await adminDb.runTransaction(async (transaction) => {
        const matchDoc = await transaction.get(matchRef);
        if (!matchDoc.exists) {
            throw new Error("Match not found");
        }
        const matchData = matchDoc.data();
        
        let homeScore = 0;
        let awayScore = 0;

        if (matchData?.homeTeamId === winningTeamId) {
            homeScore = 3;
            awayScore = 0;
        } else {
            homeScore = 0;
            awayScore = 3;
        }
        
        const updateData: any = {
            status: 'approved',
            homeScore,
            awayScore,
        };

        if (adminNotes) {
            updateData.resolutionNotes = adminNotes;
        }

        transaction.update(matchRef, updateData);
    });

    // Set flag for cron job to update standings
    await adminDb.collection('tournaments').doc(tournamentId).update({
        needsStandingsUpdate: true,
        lastAutoResolvedAt: FieldValue.serverTimestamp()
    });

    revalidatePath(`/tournaments/${tournamentId}`);
}


export async function getMatchPrediction(matchId: string, tournamentId: string) {
    const matchRef = adminDb.collection('tournaments').doc(tournamentId).collection('matches').doc(matchId);
    // ... logic for prediction
    return { predictedWinnerName: 'Team A', confidence: 75, reasoning: 'AI analysis placeholder' };
}
