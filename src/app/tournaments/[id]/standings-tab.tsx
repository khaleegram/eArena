
"use client";

import { useState, useEffect } from "react";
import Link from 'next/link';
import { db } from "@/lib/firebase";
import { collection, onSnapshot, query, where, orderBy } from "firebase/firestore";
import type { Match, Standing, Team, Tournament } from "@/lib/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Trophy } from "lucide-react";
import { ReputationAvatar } from "@/components/reputation-avatar";
import { Bracket } from "@/components/bracket";

type GroupRow = {
  teamId: string;
  matchesPlayed: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
};

function isGroupRound(round?: string): boolean {
  return typeof round === 'string' && /^group\s+[a-z]$/i.test(round.trim());
}

function computeGroupStandings(groupMatches: Match[]): GroupRow[] {
  const rows = new Map<string, GroupRow>();
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

export function StandingsTab({ tournament }: { tournament: Tournament }) {
  const tournamentId = tournament.id;
  const [standings, setStandings] = useState<Standing[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [groupTables, setGroupTables] = useState<Record<string, GroupRow[]>>({});
  const [knockoutMatches, setKnockoutMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    let teamsLoaded = false;
    let standingsLoaded = false;
    let matchesLoaded = false;

    const checkDone = () => {
        const done = tournament.format === 'cup'
          ? (teamsLoaded && matchesLoaded)
          : (teamsLoaded && standingsLoaded);
        if (active && done) {
            setLoading(false);
        }
    }

    const isCupStyle = tournament.format === 'cup';
    let unsubStandings = () => {};
    let unsubMatches = () => {};

    if (!isCupStyle) {
      const standingsQuery = query(collection(db, "standings"), where("tournamentId", "==", tournamentId), orderBy("ranking", "asc"));
      unsubStandings = onSnapshot(standingsQuery, (snapshot) => {
          if (!active) return;
          const standingsData = snapshot.docs.map(doc => doc.data() as Standing);
          setStandings(standingsData);
          standingsLoaded = true;
          checkDone();
      }, () => {
          standingsLoaded = true;
          checkDone();
      });
    } else {
      const matchesQuery = query(collection(db, `tournaments/${tournamentId}/matches`), orderBy("round", "asc"));
      unsubMatches = onSnapshot(matchesQuery, (snapshot) => {
          if (!active) return;
          const matchesData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Match));
          const groupMatches = matchesData.filter(m => isGroupRound(m.round));
          const koMatches = matchesData.filter(m => isKnockoutRound(m.round));

          const grouped: Record<string, Match[]> = {};
          for (const m of groupMatches) {
            const key = (m.round || 'Group ?').trim();
            grouped[key] = grouped[key] || [];
            grouped[key]!.push(m);
          }

          const tables: Record<string, GroupRow[]> = {};
          Object.keys(grouped).sort((a, b) => a.localeCompare(b)).forEach(groupName => {
            tables[groupName] = computeGroupStandings(grouped[groupName]!);
          });
          setGroupTables(tables);
          setKnockoutMatches(koMatches);
          matchesLoaded = true;
          checkDone();
      }, () => {
          matchesLoaded = true;
          checkDone();
      });
    }
    
    const teamsQuery = query(collection(db, `tournaments/${tournamentId}/teams`));
    const unsubTeams = onSnapshot(teamsQuery, (snapshot) => {
        if (!active) return;
        const teamsData = teamsSnapshot.docs.map(doc => ({id: doc.id, ...doc.data()}) as Team);
        setTeams(teamsData);
        teamsLoaded = true;
        checkDone();
    }, () => {
        teamsLoaded = true;
        checkDone();
    });

    return () => {
        active = false;
        unsubStandings();
        unsubMatches();
        unsubTeams();
    };
  }, [tournamentId, tournament.format]);

  const getTeamInfo = (teamId: string) => {
    return teams.find(t => t.id === teamId) || { name: 'Unknown', logoUrl: ''};
  }
  
  const isCupStyle = tournament.format === 'cup';
  const isKnockoutRound = (round?: string) => {
    if (typeof round !== 'string') return false;
    const r = round.trim().toLowerCase();
    return r === 'final' || r === 'semi-finals' || r === 'quarter-finals' || /^round of \d+$/i.test(round.trim());
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
            <CardTitle className="font-headline flex items-center gap-2"><Trophy className="w-5 h-5"/> Tournament Standings</CardTitle>
            <CardDescription>
              {isCupStyle ? 'Group stage tables (top 2 advance to knockout).' : 'Live rankings based on approved match results.'}
            </CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
            <div className="flex justify-center items-center h-40">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        ) : isCupStyle ? (
          Object.keys(groupTables).length === 0 ? (
            <p className="text-muted-foreground text-center py-8">Group tables will appear once fixtures are generated.</p>
          ) : (
            <div className="space-y-10">
              {Object.entries(groupTables).map(([groupName, rows]) => (
                <div key={groupName} className="space-y-3">
                  <div>
                    <h3 className="text-lg font-semibold font-headline">{groupName}</h3>
                    <p className="text-sm text-muted-foreground">Top 2 teams advance to the knockout stage.</p>
                  </div>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[50px]">Pos</TableHead>
                        <TableHead>Team</TableHead>
                        <TableHead className="text-center">MP</TableHead>
                        <TableHead className="text-center">W</TableHead>
                        <TableHead className="text-center">D</TableHead>
                        <TableHead className="text-center">L</TableHead>
                        <TableHead className="text-center">GF</TableHead>
                        <TableHead className="text-center">GA</TableHead>
                        <TableHead className="text-center">GD</TableHead>
                        <TableHead className="text-center">Pts</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.map((row, idx) => {
                        const teamInfo = getTeamInfo(row.teamId);
                        const highlight = idx < 2 ? 'bg-primary/5' : '';
                        return (
                          <TableRow key={row.teamId} className={highlight}>
                            <TableCell className="font-bold text-lg">{idx + 1}</TableCell>
                            <TableCell>
                              <Link href={`/profile/${teamInfo.captainId}`} className="flex items-center gap-2 hover:underline">
                                <ReputationAvatar profile={teamInfo} className="h-8 w-8" />
                                <span className="font-medium">{teamInfo.name}</span>
                              </Link>
                            </TableCell>
                            <TableCell className="text-center font-semibold">{row.matchesPlayed}</TableCell>
                            <TableCell className="text-center">{row.wins}</TableCell>
                            <TableCell className="text-center">{row.draws}</TableCell>
                            <TableCell className="text-center">{row.losses}</TableCell>
                            <TableCell className="text-center">{row.goalsFor}</TableCell>
                            <TableCell className="text-center">{row.goalsAgainst}</TableCell>
                            <TableCell className="text-center">{row.goalDifference > 0 ? `+${row.goalDifference}` : row.goalDifference}</TableCell>
                            <TableCell className="text-center font-bold">{row.points}</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              ))}

              {knockoutMatches.length > 0 && (
                <div className="space-y-3">
                  <div>
                    <h3 className="text-lg font-semibold font-headline">Knockout Bracket</h3>
                    <p className="text-sm text-muted-foreground">Elimination stage progression to the final.</p>
                  </div>
                  <Bracket matches={knockoutMatches} teams={teams} />
                </div>
              )}
            </div>
          )
        ) : standings.length === 0 ? (
          <p className="text-muted-foreground text-center py-8">Standings will appear here once matches are played and results are approved.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[50px]">Rank</TableHead>
                <TableHead>Team</TableHead>
                <TableHead className="text-center">MP</TableHead>
                <TableHead className="text-center">W</TableHead>
                <TableHead className="text-center">D</TableHead>
                <TableHead className="text-center">L</TableHead>
                <TableHead className="text-center">GF</TableHead>
                <TableHead className="text-center">GA</TableHead>
                <TableHead className="text-center">GD</TableHead>
                <TableHead className="text-center">CS</TableHead>
                <TableHead className="text-center">Pts</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {standings.map(standing => {
                const teamInfo = getTeamInfo(standing.teamId);
                const goalDifference = standing.goalsFor - standing.goalsAgainst;
                return (
                  <TableRow key={standing.teamId}>
                    <TableCell className="font-bold text-lg">{standing.ranking}</TableCell>
                    <TableCell>
                      <Link href={`/profile/${teamInfo.captainId}`} className="flex items-center gap-2 hover:underline">
                        <ReputationAvatar profile={teamInfo} className="h-8 w-8" />
                        <span className="font-medium">{teamInfo.name}</span>
                      </Link>
                    </TableCell>
                    <TableCell className="text-center font-semibold">{standing.matchesPlayed}</TableCell>
                    <TableCell className="text-center">{standing.wins}</TableCell>
                    <TableCell className="text-center">{standing.draws}</TableCell>
                    <TableCell className="text-center">{standing.losses}</TableCell>
                    <TableCell className="text-center">{standing.goalsFor}</TableCell>
                    <TableCell className="text-center">{standing.goalsAgainst}</TableCell>
                    <TableCell className="text-center">{goalDifference > 0 ? `+${goalDifference}`: goalDifference}</TableCell>
                    <TableCell className="text-center">{standing.cleanSheets}</TableCell>
                    <TableCell className="text-center font-bold">{standing.points}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
