
"use client";

import { useState, useEffect } from "react";
import { db } from "@/lib/firebase";
import { collection, onSnapshot, query, orderBy } from "firebase/firestore";

import type {
  Match,
  Team,
  Tournament,
} from "@/lib/types";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

import {
  Loader2,
  User,
  Video,
  Calendar,
} from "lucide-react";

import { format } from "date-fns";

import Link from "next/link";
import { Bracket } from "@/components/bracket";
import { toDate } from "@/lib/utils";
import { MatchStatusBadge } from "@/components/match-status-badge";


/* =========================
   Match Card (Simple Link Card)
========================= */
function MatchCard({
  match,
  getTeam,
  tournament,
}: {
  match: Match;
  getTeam: (id: string) => Team | undefined;
  tournament: Tournament;
}) {
  const homeTeam = getTeam(match.homeTeamId);
  const awayTeam = getTeam(match.awayTeamId);

  if (!homeTeam || !awayTeam) return null;

  return (
    <Link href={`/tournaments/${tournament.id}/matches/${match.id}`}>
      <Card className="rounded-xl overflow-hidden bg-card/60 hover:bg-card hover:shadow-md transition-all cursor-pointer">
        <CardContent className="p-3 space-y-3">
          {/* Header: Status and Date */}
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <MatchStatusBadge status={match.status} />
            <Badge variant="outline" className="text-[10px] py-0.5">
              <Calendar className="h-3 w-3 mr-1" />
              {format(toDate(match.matchDay), "MMM d, HH:mm")}
            </Badge>
          </div>

          {/* Team vs Team */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <Avatar className="h-7 w-7">
                <AvatarImage src={homeTeam.logoUrl} alt={homeTeam.name} />
                <AvatarFallback><User /></AvatarFallback>
              </Avatar>
              <span className="text-sm font-semibold truncate">{homeTeam.name}</span>
            </div>

            <div className="text-lg font-black tabular-nums shrink-0">
              {match.status === "approved" ? `${match.homeScore} - ${match.awayScore}` : "vs"}
            </div>

            <div className="flex items-center gap-2 min-w-0 justify-end">
              <span className="text-sm font-semibold truncate">{awayTeam.name}</span>
              <Avatar className="h-7 w-7">
                <AvatarImage src={awayTeam.logoUrl} alt={awayTeam.name} />
                <AvatarFallback><User /></AvatarFallback>
              </Avatar>
            </div>
          </div>
          
           {/* Footer: Indicators */}
           {match.streamLinks && Object.keys(match.streamLinks).length > 0 ? (
            <div className="flex items-center justify-end gap-2 pt-1">
              <Video className="h-4 w-4 text-primary" />
            </div>
           ) : null}

        </CardContent>
      </Card>
    </Link>
  );
}

/* =========================
   Main Tab
========================= */
export function FixturesTab({ tournament, isOrganizer }: { tournament: Tournament; isOrganizer: boolean }) {
  const [matches, setMatches] = useState<Match[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    const matchQuery = query(collection(db, `tournaments/${tournament.id}/matches`), orderBy("round", "asc"), orderBy("matchDay", "asc"));
    const teamQuery = query(collection(db, `tournaments/${tournament.id}/teams`));

    let teamsLoaded = false;
    let matchesLoaded = false;

    const checkDone = () => {
      if (active && teamsLoaded && matchesLoaded) setLoading(false);
    };

    const unsubMatches = onSnapshot(matchQuery, (snapshot) => {
      if (!active) return;
      const matchesData = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Match));
      setMatches(matchesData);
      matchesLoaded = true;
      checkDone();
    });

    const unsubTeams = onSnapshot(teamQuery, (snapshot) => {
      if (!active) return;
      const teamsData = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Team));
      setTeams(teamsData);
      teamsLoaded = true;
      checkDone();
    });

    return () => {
      active = false;
      unsubMatches();
      unsubTeams();
    };
  }, [tournament.id]);

  const getTeam = (teamId: string) => teams.find((t) => t.id === teamId);

  const isGroupRound = (round?: string) => typeof round === 'string' && /^group\s+[a-z]$/i.test(round.trim());
  const isKnockoutRound = (round?: string) => {
    if (typeof round !== 'string') return false;
    const r = round.trim().toLowerCase();
    return r === 'final' || r === 'semi-finals' || r === 'quarter-finals' || /^round of \d+$/i.test(r.trim());
  };

  const groupedMatches = matches.reduce((acc, match) => {
    const round = match.round || "Uncategorized";
    if (!acc[round]) acc[round] = [];
    acc[round].push(match);
    return acc;
  }, {} as Record<string, Match[]>);

  const groupRounds = Object.keys(groupedMatches).filter(isGroupRound).sort();
  const knockoutMatches = matches.filter(m => isKnockoutRound(m.round));
  const otherRounds = Object.keys(groupedMatches).filter(r => !isGroupRound(r) && !isKnockoutRound(r)).sort();
  
  const hasKnockout = knockoutMatches.length > 0;
  const defaultTabValue = groupRounds[0] || otherRounds[0] || (hasKnockout ? 'knockout' : 'all');

  return (
    <Card className="rounded-2xl">
      <CardHeader>
        <CardTitle className="font-headline">Fixtures</CardTitle>
        <CardDescription>The complete list of all matches in the tournament.</CardDescription>
      </CardHeader>

      <CardContent>
        {loading ? (
          <div className="flex justify-center items-center h-40">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : matches.length === 0 ? (
          <p className="text-muted-foreground text-center py-8">Fixtures have not been generated yet.</p>
        ) : (
          <Tabs defaultValue={defaultTabValue} className="w-full">
            <ScrollArea>
              <TabsList>
                {groupRounds.map(round => <TabsTrigger key={round} value={round}>{round}</TabsTrigger>)}
                {otherRounds.map(round => <TabsTrigger key={round} value={round}>{round}</TabsTrigger>)}
                {hasKnockout && <TabsTrigger value="knockout">Knockout Bracket</TabsTrigger>}
              </TabsList>
              <ScrollBar orientation="horizontal" />
            </ScrollArea>
            
            {Object.entries(groupedMatches).map(([round, roundMatches]) => {
                const matchesByDay = roundMatches.reduce((acc, match) => {
                    const day = format(toDate(match.matchDay), 'yyyy-MM-dd');
                    if (!acc[day]) {
                    acc[day] = [];
                    }
                    acc[day].push(match);
                    return acc;
                }, {} as Record<string, Match[]>);

                const sortedDays = Object.keys(matchesByDay).sort();
                const isGroupStage = isGroupRound(round);

                return (
                    <TabsContent key={round} value={round} className="mt-4">
                      <div className="space-y-6">
                        {sortedDays.map((day, index) => (
                          <div key={day} className="space-y-3">
                            {isGroupStage && sortedDays.length > 1 && (
                                <div className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">
                                  Matchday {index + 1}
                                </div>
                            )}
                            <div className="grid gap-3">
                                {matchesByDay[day]!.map((match) => (
                                    <MatchCard
                                        key={match.id}
                                        match={match}
                                        getTeam={getTeam}
                                        tournament={tournament}
                                    />
                                ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </TabsContent>
                );
            })}

            {hasKnockout && (
              <TabsContent value="knockout" className="mt-4">
                <Bracket matches={knockoutMatches} teams={teams} />
              </TabsContent>
            )}
          </Tabs>
        )}
      </CardContent>
    </Card>
  );
}
