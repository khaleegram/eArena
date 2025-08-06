
'use server';

import { adminDb } from '../firebase-admin';
import type { Match, Team, Tournament, Standing, DisputedMatchInfo } from '../types';
import { serializeData } from '../utils';

export async function getTeamsForTournament(tournamentId: string): Promise<Team[]> {
    const snapshot = await adminDb.collection('tournaments').doc(tournamentId).collection('teams').get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...serializeData(doc.data()) } as Team));
}

export async function getStandingsForTournament(tournamentId: string): Promise<Standing[]> {
    const snapshot = await adminDb.collection('standings').where('tournamentId', '==', tournamentId).orderBy('ranking', 'asc').get();
    return snapshot.docs.map(doc => serializeData(doc.data()) as Standing);
}

export async function getLiveMatches(): Promise<{ match: Match; homeTeam: Team; awayTeam: Team; }[]> {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(today.getDate() + 1);

        const matchesSnapshot = await adminDb.collectionGroup('matches')
            .where('matchDay', '>=', today)
            .where('matchDay', '<', tomorrow)
            .where('status', '==', 'scheduled')
            .get();

        if (matchesSnapshot.empty) {
            return [];
        }

        const liveMatches: { match: Match; homeTeam: Team; awayTeam: Team; }[] = [];

        for (const doc of matchesSnapshot.docs) {
            const match = doc.data() as Match;
            if (match.streamLinks && Object.keys(match.streamLinks).length > 0) {
                 const tournamentDoc = await adminDb.collection('tournaments').doc(match.tournamentId).get();
                 if (!tournamentDoc.exists) continue;

                 const homeTeamDoc = await adminDb.collection('tournaments').doc(match.tournamentId).collection('teams').doc(match.homeTeamId).get();
                 const awayTeamDoc = await adminDb.collection('tournaments').doc(match.tournamentId).collection('teams').doc(match.awayTeamId).get();

                 if (homeTeamDoc.exists && awayTeamDoc.exists) {
                    liveMatches.push({
                        match: {id: doc.id, ...match},
                        homeTeam: {id: homeTeamDoc.id, ...homeTeamDoc.data()} as Team,
                        awayTeam: {id: awayTeamDoc.id, ...awayTeamDoc.data()} as Team,
                    });
                 }
            }
        }
        
        return serializeData(liveMatches);

    } catch (error: any) {
         if (error.code === 9) { // FAILED_PRECONDITION, indicates missing index
            console.warn(
                `[eArena] Firestore index missing for live matches. Please create the required index in your Firebase console for the 'matches' collection group. The app will function, but the live page will be empty. Required Index: status ASC, matchDay ASC`
            );
            return [];
        }
        console.error("Error fetching live matches:", error);
        throw new Error("Could not fetch live matches.");
    }
}

export async function exportStandingsToCSV(tournamentId: string): Promise<{ csv: string, filename: string }> {
    const tournamentDoc = await adminDb.collection('tournaments').doc(tournamentId).get();
    if (!tournamentDoc.exists) {
        throw new Error("Tournament not found");
    }
    const tournament = tournamentDoc.data() as Tournament;

    const standings = await getStandingsForTournament(tournamentId);
    const teams = await getTeamsForTournament(tournamentId);

    if (standings.length === 0) {
        throw new Error("No standings available to export.");
    }

    const teamsMap = new Map(teams.map(team => [team.id, team]));

    const headers = ["Rank", "Team", "MP", "W", "D", "L", "GF", "GA", "GD", "CS", "Pts"];
    const rows = standings.map(s => {
        const teamName = teamsMap.get(s.teamId)?.name || 'Unknown Team';
        const gd = s.goalsFor - s.goalsAgainst;
        return [
            s.ranking,
            `"${teamName.replace(/"/g, '""')}"`, // escape double quotes
            s.matchesPlayed,
            s.wins,
            s.draws,
            s.losses,
            s.goalsFor,
            s.goalsAgainst,
            gd,
            s.cleanSheets,
            s.points,
        ].join(',');
    });

    const csv = [headers.join(','), ...rows].join('\n');
    const filename = `${tournament.name.replace(/ /g, '_')}_standings.csv`;
    
    return { csv, filename };
}
