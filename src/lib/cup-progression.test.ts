import { describe, it, expect } from 'vitest';
import type { Match } from './types';
import {
  getCupRoundRank,
  getCurrentCupRound,
  assertRoundCompleted,
  getMatchWinnerTeamId,
  getWinnersForRound,
  getChampionIfFinalComplete,
} from './cup-progression';

function m(overrides: Partial<Match>): Match {
  return {
    id: overrides.id ?? 'm1',
    tournamentId: overrides.tournamentId ?? 't1',
    homeTeamId: overrides.homeTeamId ?? 'A',
    awayTeamId: overrides.awayTeamId ?? 'B',
    hostId: overrides.hostId ?? (overrides.homeTeamId ?? 'A'),
    hostTransferRequested: overrides.hostTransferRequested ?? false,
    homeScore: overrides.homeScore ?? null,
    awayScore: overrides.awayScore ?? null,
    pkHomeScore: overrides.pkHomeScore,
    pkAwayScore: overrides.pkAwayScore,
    matchDay: overrides.matchDay ?? new Date(),
    status: overrides.status ?? 'scheduled',
    round: overrides.round,
  };
}

describe('cup-progression', () => {
  it('ranks rounds in correct progression order', () => {
    expect(getCupRoundRank('Round of 16')).toBeLessThan(getCupRoundRank('Round of 8'));
    expect(getCupRoundRank('Round of 8')).toBeLessThan(getCupRoundRank('Quarter-finals'));
    expect(getCupRoundRank('Quarter-finals')).toBeLessThan(getCupRoundRank('Semi-finals'));
    expect(getCupRoundRank('Semi-finals')).toBeLessThan(getCupRoundRank('Final'));
  });

  it('detects the current/latest round from matches', () => {
    const matches: Match[] = [
      m({ id: 'r8-1', round: 'Round of 8' }),
      m({ id: 'r8-2', round: 'Round of 8' }),
      m({ id: 'sf-1', round: 'Semi-finals' }),
    ];
    expect(getCurrentCupRound(matches)).toBe('Semi-finals');
  });

  it('blocks progression when any match in the round is not approved', () => {
    const matches: Match[] = [
      m({ id: 'sf-1', round: 'Semi-finals', status: 'approved', homeScore: 2, awayScore: 0 }),
      m({ id: 'sf-2', round: 'Semi-finals', status: 'scheduled', homeScore: null, awayScore: null }),
    ];
    expect(() => assertRoundCompleted('Semi-finals', matches)).toThrow(/still not approved/i);
  });

  it('computes winners for a round (normal win)', () => {
    const matches: Match[] = [
      m({ id: 'qf-1', round: 'Quarter-finals', status: 'approved', homeTeamId: 'A', awayTeamId: 'B', homeScore: 3, awayScore: 1 }),
      m({ id: 'qf-2', round: 'Quarter-finals', status: 'approved', homeTeamId: 'C', awayTeamId: 'D', homeScore: 0, awayScore: 2 }),
    ];

    const winners = getWinnersForRound(matches, 'Quarter-finals', { penalties: true });
    expect(winners).toEqual(['A', 'D']);
  });

  it('computes winner for a draw using penalties when enabled', () => {
    const match = m({
      id: 'sf-1',
      round: 'Semi-finals',
      status: 'approved',
      homeTeamId: 'A',
      awayTeamId: 'B',
      homeScore: 1,
      awayScore: 1,
      pkHomeScore: 5,
      pkAwayScore: 4,
    });
    expect(getMatchWinnerTeamId(match, { penalties: true })).toBe('A');
  });

  it('throws if a cup match ends in a draw without penalties', () => {
    const match = m({
      id: 'sf-1',
      round: 'Semi-finals',
      status: 'approved',
      homeScore: 1,
      awayScore: 1,
    });
    expect(() => getMatchWinnerTeamId(match, { penalties: false })).toThrow(/draw without penalties/i);
  });

  it('determines champion once Final is approved', () => {
    const matches: Match[] = [
      m({ id: 'final', round: 'Final', status: 'approved', homeTeamId: 'A', awayTeamId: 'B', homeScore: 2, awayScore: 0 }),
    ];
    expect(getChampionIfFinalComplete(matches, { penalties: true })).toBe('A');
  });

  it('returns null champion if Final is not approved', () => {
    const matches: Match[] = [
      m({ id: 'final', round: 'Final', status: 'scheduled', homeTeamId: 'A', awayTeamId: 'B' }),
    ];
    expect(getChampionIfFinalComplete(matches, { penalties: true })).toBeNull();
  });
});

