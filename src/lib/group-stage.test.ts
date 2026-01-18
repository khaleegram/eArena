import { describe, it, expect } from 'vitest';
import type { Match } from './types';
import {
  createWorldCupGroups,
  generateGroupStageFixtures,
  computeAllGroupStandings,
  seedKnockoutFromGroups,
  isGroupRound,
} from './group-stage';
import { isKnockoutRound } from './cup-progression';

function approvedGroupMatch(group: string, home: string, away: string, homeScore: number, awayScore: number): Match {
  return {
    id: `${group}-${home}-${away}`,
    tournamentId: 't1',
    homeTeamId: home,
    awayTeamId: away,
    hostId: home,
    hostTransferRequested: false,
    homeScore,
    awayScore,
    matchDay: new Date(),
    status: 'approved',
    round: group,
  };
}

describe('group-stage (World Cup style)', () => {
  it('creates groups of 4 for 8 teams (2 groups)', () => {
    const teams = Array.from({ length: 8 }, (_, i) => `T${i + 1}`);
    const groups = createWorldCupGroups(teams, 4);
    expect(groups).toHaveLength(2);
    expect(groups[0]!.teamIds).toHaveLength(4);
    expect(groups[1]!.teamIds).toHaveLength(4);
  });

  it('generates 6 matches per group of 4', () => {
    const teams = Array.from({ length: 8 }, (_, i) => `T${i + 1}`);
    const groups = createWorldCupGroups(teams, 4);
    const fixtures = generateGroupStageFixtures(groups);
    // 2 groups * C(4,2)=6 => 12 matches
    expect(fixtures).toHaveLength(12);
    expect(fixtures.every(f => isGroupRound(f.round))).toBe(true);
  });

  it('computes group standings and seeds semifinals (8 teams -> 2 groups -> 4 advancers -> Semi-finals)', () => {
    // Build a fake group stage where A1 and A2 advance, B1 and B2 advance
    const matches: Match[] = [
      // Group A: A1 beats A2, A1 beats A3, A1 beats A4 => 9 pts
      approvedGroupMatch('Group A', 'A1', 'A2', 2, 0),
      approvedGroupMatch('Group A', 'A1', 'A3', 1, 0),
      approvedGroupMatch('Group A', 'A1', 'A4', 3, 1),
      // A2 beats A3 and A4 => 6 pts
      approvedGroupMatch('Group A', 'A2', 'A3', 2, 1),
      approvedGroupMatch('Group A', 'A2', 'A4', 1, 0),
      // A3 vs A4 draw
      approvedGroupMatch('Group A', 'A3', 'A4', 0, 0),

      // Group B: B1 7 pts, B2 6 pts
      approvedGroupMatch('Group B', 'B1', 'B2', 1, 1),
      approvedGroupMatch('Group B', 'B1', 'B3', 2, 0),
      approvedGroupMatch('Group B', 'B1', 'B4', 1, 0),
      approvedGroupMatch('Group B', 'B2', 'B3', 3, 1),
      approvedGroupMatch('Group B', 'B2', 'B4', 2, 1),
      approvedGroupMatch('Group B', 'B3', 'B4', 0, 2),
    ];

    const standingsByGroup = computeAllGroupStandings(matches);
    expect(Object.keys(standingsByGroup)).toEqual(['Group A', 'Group B']);
    expect(standingsByGroup['Group A']![0]!.teamId).toBe('A1');
    expect(standingsByGroup['Group A']![1]!.teamId).toBe('A2');
    // Group B has a points tie; B2 wins on goals scored tie-breaker.
    expect(standingsByGroup['Group B']![0]!.teamId).toBe('B2');
    expect(standingsByGroup['Group B']![1]!.teamId).toBe('B1');

    const knockoutFixtures = seedKnockoutFromGroups(standingsByGroup);
    expect(knockoutFixtures).toHaveLength(2);
    expect(knockoutFixtures.every(f => isKnockoutRound(f.round))).toBe(true);
    expect(knockoutFixtures[0]!.round).toBe('Semi-finals');

    // World Cup seeding: A1 vs (Group B runner-up) and (Group B winner) vs A2
    const pairs = knockoutFixtures.map(f => `${f.homeTeamId}v${f.awayTeamId}`).sort();
    expect(pairs).toEqual(['A1vB1', 'B2vA2'].sort());
  });
});
