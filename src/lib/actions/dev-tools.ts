'use server';

import { adminDb } from '@/lib/firebase-admin';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import type { Tournament, Team, Match, Player } from '@/lib/types';
import { revalidatePath } from 'next/cache';
import { approveMatchResult } from './matches';
import { progressTournamentStage } from './tournament';
import { isGroupRound } from '@/lib/group-stage';
import { isKnockoutRound, getCurrentCupRound } from '@/lib/cup-progression';
import { addDays, differenceInDays } from 'date-fns';

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

