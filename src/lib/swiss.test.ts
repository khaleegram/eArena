import { describe, it, expect } from 'vitest';
import type { Match, Standing } from './types';
import {
  generateSwissRoundFixtures,
  getMaxSwissRounds,
  getSwissKnockoutQualifierCount,
  getSwissStageCount,
  getStageDayOffset,
  getCurrentSwissRoundNumber,
} from './swiss';

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

  it('caps max Swiss rounds at 8', () => {
    expect(getMaxSwissRounds(128)).toBe(8);
    expect(getMaxSwissRounds(16)).toBe(8);
    expect(getMaxSwissRounds(4)).toBe(3);
    expect(getMaxSwissRounds(2)).toBe(1);
  });

  it('computes knockout qualifier counts (power of two, cap 16, floor 4)', () => {
    expect(getSwissKnockoutQualifierCount(8)).toBe(4);
    expect(getSwissKnockoutQualifierCount(16)).toBe(8);
    expect(getSwissKnockoutQualifierCount(32)).toBe(16);
    expect(getSwissKnockoutQualifierCount(64)).toBe(16);
    expect(getSwissKnockoutQualifierCount(96)).toBe(16);
    expect(getSwissKnockoutQualifierCount(128)).toBe(16);
  });

  it('computes total Swiss + knockout stage count', () => {
    // 128: 8 Swiss + Round of 16, QF, SF, Final = 8 + 4 = 12
    expect(getSwissStageCount(128)).toBe(12);
    // 16: 8 Swiss + Round of 8(=QF), SF, Final = 8 + 3 = 11
    expect(getSwissStageCount(16)).toBe(11);
    // 8: 7 Swiss + SF, Final = 7 + 2 = 9
    expect(getSwissStageCount(8)).toBe(9);
  });

  it('spreads stage day offsets evenly across the window', () => {
    expect(getStageDayOffset(0, 12, 7)).toBe(0);
    expect(getStageDayOffset(11, 12, 7)).toBe(6);
    expect(getStageDayOffset(0, 1, 7)).toBe(0);
    expect(getStageDayOffset(5, 12, 1)).toBe(0);
    // Mid stages should land inside the window
    const mid = getStageDayOffset(6, 12, 7);
    expect(mid).toBeGreaterThanOrEqual(0);
    expect(mid).toBeLessThanOrEqual(6);
  });

  it('reads current Swiss round from matches', () => {
    expect(getCurrentSwissRoundNumber([])).toBe(0);
    expect(getCurrentSwissRoundNumber([
      prevMatch('A', 'B', 'Swiss Round 1'),
      prevMatch('C', 'D', 'Swiss Round 3'),
      prevMatch('E', 'F', 'Final'),
    ])).toBe(3);
  });

  it('generates 64 unique-pair fixtures for 128-team Round 1', () => {
    const teamIds = Array.from({ length: 128 }, (_, i) => `T${i + 1}`);
    const fixtures = generateSwissRoundFixtures({
      teamIds,
      roundNumber: 1,
      standings: [] as Standing[],
      previousMatches: [],
    });
    expect(fixtures).toHaveLength(64);
    expect(fixtures.every(f => f.round === 'Swiss Round 1')).toBe(true);
    const allTeams = fixtures.flatMap(f => [f.homeTeamId, f.awayTeamId]);
    expect(new Set(allTeams).size).toBe(128);
    const pairs = fixtures.map(f => [f.homeTeamId, f.awayTeamId].sort().join('-'));
    expect(new Set(pairs).size).toBe(64);
  });
});
