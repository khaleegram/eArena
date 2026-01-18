
import type { Match } from './types';
import { getRoundName } from './cup-tournament';

export interface Group {
  name: string; // e.g. "Group A"
  teamIds: string[];
}

export interface GroupStandingRow {
  teamId: string;
  matchesPlayed: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
}

export function isGroupRound(round?: string): boolean {
  return typeof round === 'string' && /^group\s+[a-z]$/i.test(round.trim());
}

function groupName(idx: number): string {
  const letter = String.fromCharCode('A'.charCodeAt(0) + idx);
  return `Group ${letter}`;
}

/**
 * World Cup style grouping: groups of 4.
 * We enforce teamCount % 8 === 0 so that top-2-per-group becomes a clean knockout bracket.
 */
export function createWorldCupGroups(teamIds: string[], groupSize = 4): Group[] {
  if (teamIds.length < 8) {
    throw new Error('Cup group stage requires at least 8 teams.');
  }
  if (groupSize < 3) {
    throw new Error('Group size must be at least 3.');
  }
  if (teamIds.length % groupSize !== 0) {
    throw new Error(`Team count must be divisible by ${groupSize} to create groups.`);
  }
  // For top-2 per group => advancing teams = (teamIds.length / groupSize) * 2
  // To be a power of two (knockout), group count must be even => teamCount must be divisible by 8 when groupSize=4.
  if (groupSize === 4 && teamIds.length % 8 !== 0) {
    throw new Error('For World Cup style (groups of 4), team count must be 8, 16, 32, ...');
  }

  const shuffled = [...teamIds].sort(() => Math.random() - 0.5);
  const groupCount = teamIds.length / groupSize;

  const groups: Group[] = Array.from({ length: groupCount }, (_, i) => ({
    name: groupName(i),
    teamIds: [],
  }));

  // Distribute teams in a “pot” style: ABCD, then DCBA, repeat.
  // This avoids ultra-stacked groups when teamIds arrive in seeded order.
  for (let i = 0; i < shuffled.length; i++) {
    const row = Math.floor(i / groupCount); // 0..groupSize-1
    const posInRow = i % groupCount;
    const groupIndex = row % 2 === 0 ? posInRow : (groupCount - 1 - posInRow);
    groups[groupIndex]!.teamIds.push(shuffled[i]!);
  }

  return groups;
}

export function generateGroupStageFixtures(groups: Group[]): Omit<Match, 'id' | 'tournamentId' | 'matchDay' | 'status'>[] {
  const fixtures: Omit<Match, 'id' | 'tournamentId' | 'matchDay' | 'status'>[] = [];

  for (const group of groups) {
    const teams = group.teamIds;
    for (let i = 0; i < teams.length; i++) {
      for (let j = i + 1; j < teams.length; j++) {
        const home = (i + j) % 2 === 0 ? teams[i]! : teams[j]!;
        const away = (i + j) % 2 === 0 ? teams[j]! : teams[i]!;
        fixtures.push({
          homeTeamId: home,
          awayTeamId: away,
          round: group.name,
          hostId: home,
          homeScore: null,
          awayScore: null,
          hostTransferRequested: false,
        });
      }
    }
  }

  return fixtures;
}

export function computeGroupStandings(groupMatches: Match[]): GroupStandingRow[] {
  const rows = new Map<string, GroupStandingRow>();
  const ensure = (teamId: string) => {
    if (!rows.has(teamId)) {
      rows.set(teamId, {
        teamId,
        matchesPlayed: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        goalsFor: 0,
        goalsAgainst: 0,
        goalDifference: 0,
        points: 0,
      });
    }
    return rows.get(teamId)!;
  };

  // Ensure teams appear even if no matches have been approved yet.
  // We derive teams from the fixture list itself (scheduled + approved).
  for (const match of groupMatches) {
    ensure(match.homeTeamId);
    ensure(match.awayTeamId);
  }

  for (const match of groupMatches) {
    if (match.status !== 'approved') continue;
    if (match.homeScore == null || match.awayScore == null) continue;

    const home = ensure(match.homeTeamId);
    const away = ensure(match.awayTeamId);

    home.matchesPlayed++;
    away.matchesPlayed++;

    home.goalsFor += match.homeScore;
    home.goalsAgainst += match.awayScore;
    away.goalsFor += match.awayScore;
    away.goalsAgainst += match.homeScore;

    if (match.homeScore > match.awayScore) {
      home.wins++;
      home.points += 3;
      away.losses++;
    } else if (match.awayScore > match.homeScore) {
      away.wins++;
      away.points += 3;
      home.losses++;
    } else {
      home.draws++;
      away.draws++;
      home.points += 1;
      away.points += 1;
    }
  }

  const standings = Array.from(rows.values()).map(r => ({
    ...r,
    goalDifference: r.goalsFor - r.goalsAgainst,
  }));

  standings.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.goalDifference !== a.goalDifference) return b.goalDifference - a.goalDifference;
    if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
    return a.teamId.localeCompare(b.teamId);
  });

  return standings;
}

export function computeAllGroupStandings(matches: Match[]): Record<string, GroupStandingRow[]> {
  const groups: Record<string, Match[]> = {};
  for (const m of matches) {
    if (!isGroupRound(m.round)) continue;
    const key = m.round!.trim();
    groups[key] = groups[key] || [];
    groups[key]!.push(m);
  }

  const out: Record<string, GroupStandingRow[]> = {};
  Object.keys(groups)
    .sort((a, b) => a.localeCompare(b))
    .forEach(groupName => {
      out[groupName] = computeGroupStandings(groups[groupName]!);
    });

  return out;
}

/**
 * World Cup style knockout seeding:
 * Group A winner vs Group B runner-up, Group B winner vs Group A runner-up, then C/D, etc.
 */
export function seedKnockoutFromGroups(groupStandings: Record<string, GroupStandingRow[]>): Omit<Match, 'id' | 'tournamentId' | 'matchDay' | 'status'>[] {
  const groupNames = Object.keys(groupStandings).sort((a, b) => a.localeCompare(b));
  if (groupNames.length < 2) throw new Error('Need at least 2 groups to start knockout.');
  if (groupNames.length % 2 !== 0) throw new Error('Group count must be even to generate a clean knockout bracket.');

  const advancingPairs: Array<{ winner: string; runnerUp: string; group: string }> = groupNames.map(g => {
    const table = groupStandings[g] || [];
    if (table.length < 2) throw new Error(`Group standings not ready for ${g}. Need at least 2 teams.`);
    return { winner: table[0]!.teamId, runnerUp: table[1]!.teamId, group: g };
  });

  const advancingCount = advancingPairs.length * 2;
  const roundName = getRoundName(advancingCount);

  const fixtures: Omit<Match, 'id' | 'tournamentId' | 'matchDay' | 'status'>[] = [];

  for (let i = 0; i < advancingPairs.length; i += 2) {
    const g1 = advancingPairs[i]!;
    const g2 = advancingPairs[i + 1]!;

    fixtures.push({
      homeTeamId: g1.winner,
      awayTeamId: g2.runnerUp,
      round: roundName,
      hostId: g1.winner,
      homeScore: null,
      awayScore: null,
      hostTransferRequested: false,
    });

    fixtures.push({
      homeTeamId: g2.winner,
      awayTeamId: g1.runnerUp,
      round: roundName,
      hostId: g2.winner,
      homeScore: null,
      awayScore: null,
      hostTransferRequested: false,
    });
  }

  return fixtures;
}
