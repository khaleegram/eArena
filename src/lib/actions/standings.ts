
'use server';

import { adminDb } from '@/lib/firebase-admin';
import type { Standing, Team, Match } from '@/lib/types';
import { FieldValue, DocumentSnapshot } from 'firebase-admin/firestore';
import { revalidatePath } from 'next/cache';
import { serializeData } from '@/lib/utils';
import { computeAllGroupStandings } from '../group-stage';


export async function getStandingsForTournament(tournamentId: string): Promise<Standing[]> {
    const standingsSnapshot = await adminDb.collection('standings')
        .where('tournamentId', '==', tournamentId)
        .orderBy('ranking', 'asc')
        .get();

    return standingsSnapshot.docs.map(doc => serializeData(doc.data()) as Standing);
}

async function getTeamsMap(tournamentId: string): Promise<Map<string, Team>> {
    const teamsSnapshot = await adminDb.collection('tournaments').doc(tournamentId).collection('teams').get();
    const teamsMap = new Map<string, Team>();
    teamsSnapshot.forEach(doc => {
        teamsMap.set(doc.id, { id: doc.id, ...doc.data() } as Team);
    });
    return teamsMap;
}

export async function exportStandingsToCSV(tournamentId: string): Promise<{ csv: string, filename: string }> {
    const tournamentDoc = await adminDb.collection('tournaments').doc(tournamentId).get();
    const tournamentName = tournamentDoc.data()?.name || 'tournament';
    const standings = await getStandingsForTournament(tournamentId);
    const teamsMap = await getTeamsMap(tournamentId);

    const headers = ["Rank", "Team", "MP", "W", "D", "L", "GF", "GA", "GD", "CS", "Pts"];
    const rows = standings.map(s => [
        s.ranking,
        teamsMap.get(s.teamId)?.name || s.teamId,
        s.matchesPlayed,
        s.wins,
        s.draws,
        s.losses,
        s.goalsFor,
        s.goalsAgainst,
        s.goalsFor - s.goalsAgainst,
        s.cleanSheets,
        s.points,
    ]);

    const csvContent = [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
    const filename = `${tournamentName.replace(/ /g, '_')}_standings.csv`;
    
    return { csv: csvContent, filename };
}


export async function updateStandings(tournamentId: string) {
    const tournamentRef = adminDb.collection('tournaments').doc(tournamentId);
    const teamsSnapshot = await tournamentRef.collection('teams').get();
    const approvedMatchesSnapshot = await tournamentRef.collection('matches').where('status', '==', 'approved').get();

    const teamsMap = new Map<string, { name: string; stats: any }>();
    teamsSnapshot.forEach(doc => {
        teamsMap.set(doc.id, {
            name: doc.data().name,
            stats: {
                matchesPlayed: 0, wins: 0, draws: 0, losses: 0,
                goalsFor: 0, goalsAgainst: 0, points: 0, cleanSheets: 0,
            }
        });
    });

    approvedMatchesSnapshot.forEach(doc => {
        const match = doc.data() as Match;
        const homeTeamStats = teamsMap.get(match.homeTeamId)?.stats;
        const awayTeamStats = teamsMap.get(match.awayTeamId)?.stats;

        if (homeTeamStats && awayTeamStats && typeof match.homeScore === 'number' && typeof match.awayScore === 'number') {
            homeTeamStats.matchesPlayed++;
            awayTeamStats.matchesPlayed++;
            homeTeamStats.goalsFor += match.homeScore;
            awayTeamStats.goalsFor += match.awayScore;
            homeTeamStats.goalsAgainst += match.awayScore;
            awayTeamStats.goalsAgainst += match.homeScore;
            
            if (match.awayScore === 0) homeTeamStats.cleanSheets++;
            if (match.homeScore === 0) awayTeamStats.cleanSheets++;

            if (match.homeScore > match.awayScore) {
                homeTeamStats.wins++; homeTeamStats.points += 3; awayTeamStats.losses++;
            } else if (match.awayScore > match.homeScore) {
                awayTeamStats.wins++; awayTeamStats.points += 3; homeTeamStats.losses++;
            } else {
                homeTeamStats.draws++; awayTeamStats.draws++; homeTeamStats.points++; awayTeamStats.points++;
            }
        }
    });

    const standingsData: Omit<Standing, 'ranking' | 'teamName'>[] = Array.from(teamsMap.entries()).map(([teamId, data]) => ({
        teamId,
        tournamentId,
        ...data.stats
    }));

    standingsData.sort((a, b) => {
        if (b.points !== a.points) return b.points - a.points;
        const gdA = a.goalsFor - a.goalsAgainst;
        const gdB = b.goalsFor - b.goalsAgainst;
        if (gdB !== gdA) return gdB - gdA;
        if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
        if (b.wins !== a.wins) return b.wins - a.wins;
        return a.teamId.localeCompare(b.teamId);
    });

    const batch = adminDb.batch();
    standingsData.forEach((s, index) => {
        const teamName = teamsMap.get(s.teamId)?.name || 'Unknown';
        const finalStanding: Standing = {
            ...s,
            teamName,
            ranking: index + 1,
        };
        const docRef = adminDb.collection('standings').doc(`${tournamentId}_${s.teamId}`);
        batch.set(docRef, finalStanding);
    });

    await batch.commit();
    revalidatePath(`/tournaments/${tournamentId}`);
    revalidatePath(`/tournaments/${tournamentId}/standings`);
}

export async function getGroupTablesForTournament(tournamentId: string) {
    const matchesSnapshot = await adminDb.collection('tournaments').doc(tournamentId).collection('matches').get();
    const allMatches = matchesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Match));
    const groupTables = computeAllGroupStandings(allMatches);
    return serializeData(groupTables);
}

export async function recalculateStandings(tournamentId: string, organizerId: string) {
    const tournamentRef = adminDb.collection('tournaments').doc(tournamentId);
    const tournamentDoc = await tournamentRef.get();
    if (!tournamentDoc.exists || tournamentDoc.data()?.organizerId !== organizerId) {
        throw new Error("You are not authorized to perform this action.");
    }

    await updateStandings(tournamentId);
}
