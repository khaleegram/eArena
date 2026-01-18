
import type { Match } from './types';

export function generateRoundRobinFixtures(
  teamIds: string[],
  homeAndAway: boolean
): Omit<Match, 'id' | 'tournamentId' | 'matchDay' | 'status'>[] {
  const fixtures: Omit<Match, 'id' | 'tournamentId' | 'matchDay' | 'status'>[] = [];
  const teams = [...teamIds];

  if (teams.length < 2) return [];

  // If odd number of teams, add a dummy team for scheduling
  let dummyTeam = null;
  if (teams.length % 2 !== 0) {
    dummyTeam = 'dummy';
    teams.push(dummyTeam);
  }

  const numRounds = teams.length - 1;
  const matchesPerRound = teams.length / 2;

  for (let round = 0; round < numRounds; round++) {
    for (let match = 0; match < matchesPerRound; match++) {
      const home = teams[match];
      const away = teams[teams.length - 1 - match];
      
      if (home !== dummyTeam && away !== dummyTeam) {
        fixtures.push({
          homeTeamId: home!,
          awayTeamId: away!,
          round: `Round ${round + 1}`,
          hostId: home!,
          homeScore: null,
          awayScore: null,
          hostTransferRequested: false,
        });
      }
    }
    // Rotate teams
    teams.splice(1, 0, teams.pop()!);
  }

  if (homeAndAway) {
    const awayFixtures = fixtures.map((fixture, index) => ({
      ...fixture,
      homeTeamId: fixture.awayTeamId,
      awayTeamId: fixture.homeTeamId,
      hostId: fixture.awayTeamId,
      round: `Round ${index + numRounds + 1}`,
    }));
    return [...fixtures, ...awayFixtures];
  }

  return fixtures;
}
