
'use server';

import { adminDb } from '@/lib/firebase-admin';
import type { Standing, Team, Match } from '@/lib/types';
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


export async function getGroupTablesForTournament(tournamentId: string) {
    const matchesSnapshot = await adminDb.collection('tournaments').doc(tournamentId).collection('matches').get();
    const allMatches = matchesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Match));
    const groupTables = computeAllGroupStandings(allMatches);
    return serializeData(groupTables);
}
