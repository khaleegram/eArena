import type { Match } from './types';

/**
 * Get the round name based on the number of teams
 */
export function getRoundName(numTeams: number): string {
    if (numTeams === 2) return 'Final';
    if (numTeams === 4) return 'Semi-finals';
    if (numTeams === 8) return 'Quarter-finals';
    return `Round of ${numTeams}`;
}

/**
 * Generate a single round of cup fixtures
 * @param teamIds - Array of team IDs to generate fixtures for
 * @param roundName - Name of the round (e.g., "Round of 16", "Semi-finals")
 * @returns Array of fixture objects (without id, tournamentId, matchDay, status)
 */
export function generateCupRound(teamIds: string[], roundName: string): Omit<Match, 'id' | 'tournamentId' | 'matchDay' | 'status'>[] {
    if (teamIds.length < 2) return [];
    if (teamIds.length % 2 !== 0) {
        throw new Error(`Cannot generate cup round: odd number of teams (${teamIds.length})`);
    }

    const fixtures: Omit<Match, 'id' | 'tournamentId' | 'matchDay' | 'status'>[] = [];
    // Shuffle teams for random seeding
    const shuffledTeams = [...teamIds].sort(() => Math.random() - 0.5);
    
    // Pair teams: first vs last, second vs second-last, etc.
    for (let i = 0; i < shuffledTeams.length / 2; i++) {
        const homeTeamId = shuffledTeams[i];
        const awayTeamId = shuffledTeams[shuffledTeams.length - 1 - i];
        fixtures.push({
            homeTeamId: homeTeamId,
            awayTeamId: awayTeamId,
            round: roundName,
            hostId: homeTeamId,
            homeScore: null,
            awayScore: null,
            hostTransferRequested: false,
        });
    }

    return fixtures;
}
