
import type { Match, Standing } from './types';

export function isSwissRound(round?: string): boolean {
  return typeof round === 'string' && /^swiss round \d+$/i.test(round.trim());
}

export function getSwissRoundNumber(round?: string): number | null {
  if (!round) return null;
  const m = round.trim().match(/^Swiss Round (\d+)$/i);
  if (!m) return null;
  const n = Number.parseInt(m[1]!, 10);
  return Number.isFinite(n) ? n : null;
}

export function getMaxSwissRounds(teamCount: number): number {
  // New UCL league phase uses 8 matches. For smaller tournaments, cap to avoid impossible unique opponents.
  return Math.min(8, Math.max(1, teamCount - 1));
}

type TeamRanking = {
  teamId: string;
  points: number;
  goalDifference: number;
  goalsFor: number;
};

function buildOpponentMap(previousSwissMatches: Match[]): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  const ensure = (teamId: string) => {
    if (!map.has(teamId)) map.set(teamId, new Set());
    return map.get(teamId)!;
  };
  for (const m of previousSwissMatches) {
    ensure(m.homeTeamId).add(m.awayTeamId);
    ensure(m.awayTeamId).add(m.homeTeamId);
  }
  return map;
}

function shuffle<T>(arr: T[]): T[] {
  return [...arr].sort(() => Math.random() - 0.5);
}

export function generateSwissRoundFixtures(args: {
  teamIds: string[];
  roundNumber: number;
  standings: Standing[];
  previousMatches: Match[];
}): Omit<Match, 'id' | 'tournamentId' | 'matchDay' | 'status'>[] {
  const { teamIds, roundNumber, standings, previousMatches } = args;

  if (teamIds.length < 4) throw new Error('Swiss format requires at least 4 teams.');
  if (teamIds.length % 2 !== 0) throw new Error('Swiss format requires an even number of teams.');
  if (roundNumber < 1) throw new Error('Swiss round number must be >= 1.');

  const previousSwiss = previousMatches.filter(m => isSwissRound(m.round));
  const opponents = buildOpponentMap(previousSwiss);

  const standingsByTeam = new Map<string, Standing>();
  for (const s of standings) standingsByTeam.set((s as any).teamId, s);

  const ranking: TeamRanking[] = teamIds.map(teamId => {
    const s = standingsByTeam.get(teamId);
    const goalsFor = s?.goalsFor ?? 0;
    const goalsAgainst = s?.goalsAgainst ?? 0;
    return {
      teamId,
      points: s?.points ?? 0,
      goalDifference: goalsFor - goalsAgainst,
      goalsFor,
    };
  });

  // Round 1: random pairing.
  const orderedTeams = roundNumber === 1
    ? shuffle(teamIds)
    : ranking
        .sort((a, b) => {
          if (b.points !== a.points) return b.points - a.points;
          if (b.goalDifference !== a.goalDifference) return b.goalDifference - a.goalDifference;
          if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
          return a.teamId.localeCompare(b.teamId);
        })
        .map(r => r.teamId);

  const unpaired = [...orderedTeams];
  const fixtures: Omit<Match, 'id' | 'tournamentId' | 'matchDay' | 'status'>[] = [];
  const roundLabel = `Swiss Round ${roundNumber}`;

  while (unpaired.length > 0) {
    const a = unpaired.shift()!;
    const aOpp = opponents.get(a) ?? new Set<string>();

    // Prefer the closest team in the sorted order we can find that we haven't played yet.
    let pickIndex = -1;
    for (let i = 0; i < unpaired.length; i++) {
      const b = unpaired[i]!;
      if (!aOpp.has(b)) {
        pickIndex = i;
        break;
      }
    }
    if (pickIndex === -1) {
      // Fallback: allow rematch only if unavoidable.
      pickIndex = 0;
    }

    const b = unpaired.splice(pickIndex, 1)[0]!;

    // Home/away: alternate to reduce bias (simple heuristic).
    const homeTeamId = fixtures.length % 2 === 0 ? a : b;
    const awayTeamId = fixtures.length % 2 === 0 ? b : a;

    fixtures.push({
      homeTeamId,
      awayTeamId,
      round: roundLabel,
      hostId: homeTeamId,
      homeScore: null,
      awayScore: null,
      hostTransferRequested: false,
    });

    // Update opponents map as we schedule (so we don't create duplicates within the same round).
    if (!opponents.has(a)) opponents.set(a, new Set());
    if (!opponents.has(b)) opponents.set(b, new Set());
    opponents.get(a)!.add(b);
    opponents.get(b)!.add(a);
  }

  return fixtures;
}
