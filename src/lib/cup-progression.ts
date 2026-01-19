
import type { Match, Tournament } from './types';

export type CupRoundKey = string;

function parseRoundOf(round: string): number | null {
  const m = round.match(/Round of (\d+)/i);
  if (!m) return null;
  const n = Number.parseInt(m[1]!, 10);
  return Number.isFinite(n) ? n : null;
}

export function isKnockoutRound(round?: string): boolean {
  if (typeof round !== 'string') return false;
  const r = round.trim().toLowerCase();
  return (
    r === 'final' ||
    r === 'semi-finals' ||
    r === 'quarter-finals' ||
    /^round of \d+$/i.test(round.trim())
  );
}

/**
 * Higher value = later stage in tournament.
 * Used to determine the current/latest round in a cup bracket.
 */
export function getOverallRoundRank(round: string): number {
  if (!round) return -1;
  const normalized = round.trim().toLowerCase();
  
  const swissMatch = normalized.match(/^swiss round (\d+)$/);
  if (swissMatch && swissMatch[1]) {
    return Number(swissMatch[1]); // Swiss Round 1 -> 1, ... Swiss Round 8 -> 8
  }

  if (normalized === 'final') return 1000;
  if (normalized === 'semi-finals') return 900;
  if (normalized === 'quarter-finals') return 800;

  const roundOfMatch = normalized.match(/round of (\d+)/);
  if (roundOfMatch && roundOfMatch[1]) {
    return 100 + (64 / Number(roundOfMatch[1])); // e.g. Ro16 -> 104, Ro32 -> 102
  }

  const groupMatch = normalized.match(/^group\s+[a-z]$/i);
  if (groupMatch) {
      return 0; // Group stages are the very first
  }

  const leagueRoundMatch = normalized.match(/^round (\d+)$/);
  if (leagueRoundMatch && leagueRoundMatch[1]) {
    return Number(leagueRoundMatch[1]);
  }

  return -1; // Unknown rounds
}


export function getLatestRound(matches: Match[]): string {
  const rounds = [...new Set(matches.map(m => m.round).filter(Boolean))] as string[];
  if (rounds.length === 0) throw new Error('No rounds found in tournament.');
  rounds.sort((a, b) => getOverallRoundRank(b) - getOverallRoundRank(a));
  return rounds[0]!;
}

export function getCurrentCupRound(matches: Match[]): string {
    return getLatestRound(matches);
}

export function getCupRoundRank(round: CupRoundKey): number {
    return getOverallRoundRank(round);
}

export function assertRoundCompleted(round: string, matches: Match[]): void {
  const roundMatches = matches.filter(m => (m.round || '') === round);
  const unapproved = roundMatches.filter(m => m.status !== 'approved');
  if (unapproved.length > 0) {
    throw new Error(`Cannot progress: ${unapproved.length} match(es) in ${round} are still not approved.`);
  }
}

export function getMatchWinnerTeamId(match: Match, tournament: Pick<Tournament, 'penalties'>): string {
  if (match.status !== 'approved' || match.homeScore === null || match.awayScore === null) {
    throw new Error(`Match ${match.id} is not completed.`);
  }

  if (match.homeScore > match.awayScore) return match.homeTeamId;
  if (match.awayScore > match.homeScore) return match.awayTeamId;

  // Draw
  if (tournament.penalties && match.pkHomeScore != null && match.pkAwayScore != null) {
    return match.pkHomeScore > match.pkAwayScore ? match.homeTeamId : match.awayTeamId;
  }

  throw new Error(`Match ${match.id} ended in a draw without penalties. Cup matches must have a winner.`);
}

export function getWinnersForRound(matches: Match[], round: string, tournament: Pick<Tournament, 'penalties'>): string[] {
  const roundMatches = matches.filter(m => (m.round || '') === round);
  return roundMatches.map(m => getMatchWinnerTeamId(m, tournament));
}

export function getChampionIfFinalComplete(matches: Match[], tournament: Pick<Tournament, 'penalties'>): string | null {
  const finals = matches.filter(m => (m.round || '').toLowerCase() === 'final');
  if (finals.length !== 1) return null;
  const finalMatch = finals[0]!;
  if (finalMatch.status !== 'approved') return null;
  return getMatchWinnerTeamId(finalMatch, tournament);
}

export function getRoundName(numTeams: number): string {
    if (numTeams === 2) return 'Final';
    if (numTeams === 4) return 'Semi-finals';
    if (numTeams === 8) return 'Quarter-finals';
    return `Round of ${numTeams}`;
}
