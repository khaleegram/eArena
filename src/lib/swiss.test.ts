import { describe, it, expect } from 'vitest';
import type { Match, Standing } from './types';
import { generateSwissRoundFixtures } from './swiss';

function prevMatch(home: string, away: string, round: string): Match {
  return {
    id: `${round}-${home}-${away}`,
    tournamentId: 't1',
    homeTeamId: home,
    awayTeamId: away,
    hostId: home,
    hostTransferRequested: false,
    homeScore: null,
    awayScore: null,
    matchDay: new Date(),
    status: 'scheduled',
    round,
  };
}

describe('swiss', () => {
  it('generates N/2 fixtures for a round', () => {
    const teamIds = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
    const fixtures = generateSwissRoundFixtures({
      teamIds,
      roundNumber: 1,
      standings: [] as Standing[],
      previousMatches: [],
    });
    expect(fixtures).toHaveLength(4);
    expect(new Set(fixtures.flatMap(f => [f.homeTeamId, f.awayTeamId])).size).toBe(8);
    expect(fixtures.every(f => f.round === 'Swiss Round 1')).toBe(true);
  });

  it('avoids immediate rematches when possible', () => {
    const teamIds = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
    const previousMatches: Match[] = [
      prevMatch('A', 'B', 'Swiss Round 1'),
      prevMatch('C', 'D', 'Swiss Round 1'),
      prevMatch('E', 'F', 'Swiss Round 1'),
      prevMatch('G', 'H', 'Swiss Round 1'),
    ];

    const fixtures = generateSwissRoundFixtures({
      teamIds,
      roundNumber: 2,
      standings: [] as Standing[],
      previousMatches,
    });

    const pairs = new Set(fixtures.map(f => [f.homeTeamId, f.awayTeamId].sort().join('-')));
    expect(pairs.has('A-B')).toBe(false);
    expect(pairs.has('C-D')).toBe(false);
    expect(pairs.has('E-F')).toBe(false);
    expect(pairs.has('G-H')).toBe(false);
  });
});

