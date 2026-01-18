

'use server';

import { adminDb } from '@/lib/firebase-admin';
import type { Team, Player, Tournament, UserProfile } from '@/lib/types';
import { FieldValue } from 'firebase-admin/firestore';
import { revalidatePath } from 'next/cache';
import { serializeData } from '@/lib/utils';
import { findUserByEmail } from './user';

export async function getTeamsForTournament(tournamentId: string): Promise<Team[]> {
    const teamsSnapshot = await adminDb.collection('tournaments').doc(tournamentId).collection('teams').get();
    return teamsSnapshot.docs.map(doc => serializeData({ id: doc.id, ...doc.data() }) as Team);
}

export async function getJoinedTournamentIdsForUser(userId: string): Promise<string[]> {
    const membershipSnapshot = await adminDb.collection('userMemberships')
        .where('userId', '==', userId)
        .get();

    if (membershipSnapshot.empty) {
        return [];
    }

    const tournamentIds = membershipSnapshot.docs.map(doc => doc.data().tournamentId);
    return [...new Set(tournamentIds)]; // Return unique tournament IDs
}


export async function getUserTeamForTournament(tournamentId: string, userId: string): Promise<Team | null> {
    const membershipQuery = adminDb.collection('userMemberships')
        .where('userId', '==', userId)
        .where('tournamentId', '==', tournamentId)
        .limit(1);

    const membershipSnapshot = await membershipQuery.get();

    if (membershipSnapshot.empty) {
        return null;
    }

    const teamId = membershipSnapshot.docs[0].data().teamId;
    const teamDoc = await adminDb.collection('tournaments').doc(tournamentId).collection('teams').doc(teamId).get();

    if (!teamDoc.exists) {
        return null;
    }

    return serializeData({ id: teamDoc.id, ...teamDoc.data() }) as Team;
}

export async function addTeam(tournamentId: string, teamData: Omit<Team, 'id' | 'tournamentId' | 'players' | 'playerIds'> & { captain: Player }): Promise<Team> {
    const tournamentRef = adminDb.collection('tournaments').doc(tournamentId);
    const tournamentDoc = await tournamentRef.get();
    if (!tournamentDoc.exists) {
        throw new Error('Tournament not found.');
    }
    const tournament = tournamentDoc.data() as Tournament;
    if (tournament.teamCount >= tournament.maxTeams) {
        throw new Error('Tournament is full.');
    }

    const teamRef = tournamentRef.collection('teams').doc();
    const newTeam: Team = {
        ...teamData,
        id: teamRef.id,
        tournamentId: tournamentId,
        players: [teamData.captain],
        playerIds: [teamData.captain.uid],
        isApproved: true, // Default to true
    };

    // Check if captain has too many warnings
    const captainProfileRef = adminDb.collection('users').doc(teamData.captainId);
    const captainProfileDoc = await captainProfileRef.get();
    if (captainProfileDoc.exists() && captainProfileDoc.data()?.warnings && captainProfileDoc.data()?.warnings >= 5) {
        newTeam.isApproved = false; // Set to false if warnings are high
    }


    const membershipRef = adminDb.collection('userMemberships').doc(`${tournamentId}_${teamData.captainId}`);

    await adminDb.runTransaction(async (transaction) => {
        const doc = await transaction.get(tournamentRef);
        const currentCount = doc.data()?.teamCount || 0;
        if (currentCount >= tournament.maxTeams) {
            throw new Error('Tournament is full.');
        }
        transaction.set(teamRef, newTeam);
        transaction.set(membershipRef, { userId: teamData.captainId, teamId: teamRef.id, tournamentId });
        transaction.update(tournamentRef, { teamCount: FieldValue.increment(1) });
    });

    revalidatePath(`/tournaments/${tournamentId}`);
    return serializeData(newTeam);
}

export async function updateTeamRoster(tournamentId: string, teamId: string, players: Player[], currentUserId: string) {
    const teamRef = adminDb.collection('tournaments').doc(tournamentId).collection('teams').doc(teamId);
    const teamDoc = await teamRef.get();
    if (!teamDoc.exists) throw new Error("Team not found");

    const teamData = teamDoc.data() as Team;
    const currentUserPlayer = teamData.players.find(p => p.uid === currentUserId);
    if (!currentUserPlayer || (currentUserPlayer.role !== 'captain' && currentUserPlayer.role !== 'co-captain')) {
        throw new Error("You are not authorized to manage this roster.");
    }
    
    const playerIds = players.map(p => p.uid);

    await teamRef.update({
        players,
        playerIds,
    });

    revalidatePath(`/tournaments/${tournamentId}`);
}

export async function leaveTournament(tournamentId: string, teamId: string, userId: string) {
    const tournamentRef = adminDb.collection('tournaments').doc(tournamentId);
    const teamRef = tournamentRef.collection('teams').doc(teamId);
    const membershipRef = adminDb.collection('userMemberships').doc(`${tournamentId}_${userId}`);

    const tournamentDoc = await tournamentRef.get();
    if (!tournamentDoc.exists || tournamentDoc.data()?.status !== 'open_for_registration') {
        throw new Error("Cannot leave tournament at this time.");
    }
    
    await adminDb.runTransaction(async transaction => {
        transaction.delete(teamRef);
        transaction.delete(membershipRef);
        transaction.update(tournamentRef, { teamCount: FieldValue.increment(-1) });
    });

    revalidatePath(`/tournaments/${tournamentId}`);
}

export async function removeTeamAsOrganizer(tournamentId: string, teamId: string, organizerId: string) {
    const tournamentRef = adminDb.collection('tournaments').doc(tournamentId);
    const tournamentDoc = await tournamentRef.get();
    if (tournamentDoc.data()?.organizerId !== organizerId) {
        throw new Error("You are not authorized to perform this action.");
    }
    const teamRef = tournamentRef.collection('teams').doc(teamId);
    const teamDoc = await teamRef.get();
    const teamData = teamDoc.data() as Team;

    const membershipRef = adminDb.collection('userMemberships').doc(`${tournamentId}_${teamData.captainId}`);

    await adminDb.runTransaction(async transaction => {
        transaction.delete(teamRef);
        transaction.delete(membershipRef);
        transaction.update(tournamentRef, { teamCount: FieldValue.increment(-1) });
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
