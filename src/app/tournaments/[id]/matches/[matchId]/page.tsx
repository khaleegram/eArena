'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

import { db } from '@/lib/firebase';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';

import type { Match, Team, Tournament, TeamMatchStats, UnifiedTimestamp } from '@/lib/types';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';

import {
  Loader2,
  ArrowLeft,
  Sparkles,
  Trophy,
  Clock,
  CheckCircle,
  AlertTriangle,
  FileText,
  Calendar,
} from 'lucide-react';

import { format } from 'date-fns';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { getMatchPrediction } from '@/lib/actions';

/* ----------------------------- Utilities ----------------------------- */

const toDate = (timestamp: UnifiedTimestamp): Date => {
  if (typeof timestamp === 'string') return new Date(timestamp);
  if (timestamp && typeof (timestamp as any).toDate === 'function') return (timestamp as any).toDate();
  return timestamp as Date;
};

type MatchStatus = 'scheduled' | 'awaiting_confirmation' | 'needs_secondary_evidence' | 'disputed' | 'approved';

const statusMeta: Record<
  MatchStatus,
  { label: string; icon: React.ReactNode; className: string }
> = {
  scheduled: {
    label: 'Scheduled',
    icon: <Clock className="h-4 w-4" />,
    className: 'bg-slate-500/15 text-slate-200 border-slate-500/30',
  },
  awaiting_confirmation: {
    label: 'Reviewing',
    icon: <Clock className="h-4 w-4" />,
    className: 'bg-amber-500/15 text-amber-200 border-amber-500/30',
  },
  needs_secondary_evidence: {
    label: 'More Evidence',
    icon: <AlertTriangle className="h-4 w-4" />,
    className: 'bg-yellow-500/15 text-yellow-200 border-yellow-500/30',
  },
  disputed: {
    label: 'Disputed',
    icon: <AlertTriangle className="h-4 w-4" />,
    className: 'bg-red-500/15 text-red-200 border-red-500/30',
  },
  approved: {
    label: 'Final',
    icon: <CheckCircle className="h-4 w-4" />,
    className: 'bg-green-600/15 text-green-200 border-green-600/30',
  },
};

function StatRow({
  label,
  home,
  away,
  isPercent,
}: {
  label: string;
  home: number | undefined;
  away: number | undefined;
  isPercent?: boolean;
}) {
  const fmt = (v: number | undefined) => {
    if (v === undefined || v === null) return '—';
    return isPercent ? `${v}%` : String(v);
  };

  return (
    <div className="rounded-lg border bg-muted/20 px-3 py-2">
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 text-sm">
        <div className="font-bold text-right tabular-nums">{fmt(home)}</div>
        <div className="text-center text-xs font-bold uppercase tracking-wider text-muted-foreground">
          {label}
        </div>
        <div className="font-bold text-left tabular-nums">{fmt(away)}</div>
      </div>
    </div>
  );
}

/* ----------------------------- Page ----------------------------- */

export default function MatchDetailsPage() {
  const params = useParams();
  const tournamentId = params.id as string;
  const matchId = params.matchId as string;

  const { user } = useAuth();
  const { toast } = useToast();

  const [match, setMatch] = useState<Match | null>(null);
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [homeTeam, setHomeTeam] = useState<Team | null>(null);
  const [awayTeam, setAwayTeam] = useState<Team | null>(null);

  const [loading, setLoading] = useState(true);

  const [prediction, setPrediction] = useState<{
    predictedWinnerName: string;
    confidence: number;
    reasoning: string;
  } | null>(null);
  const [isPredicting, setIsPredicting] = useState(false);

  const isOrganizer = useMemo(() => {
    if (!tournament || !user) return false;
    return (tournament as any).organizerId === user.uid;
  }, [tournament, user]);

  // Tournament + match realtime
  useEffect(() => {
    if (!tournamentId || !matchId) return;

    let unsubMatch: (() => void) | null = null;

    const run = async () => {
      setLoading(true);

      try {
        // Tournament (one-time)
        const tournamentDoc = await getDoc(doc(db, 'tournaments', tournamentId));
        if (tournamentDoc.exists()) {
          setTournament(tournamentDoc.data() as Tournament);
        } else {
          setTournament(null);
        }

        // Match (realtime)
        unsubMatch = onSnapshot(doc(db, `tournaments/${tournamentId}/matches`, matchId), (snapshot) => {
          if (snapshot.exists()) {
            setMatch({ id: snapshot.id, ...snapshot.data() } as Match);
          } else {
            setMatch(null);
          }
        });
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };

    run();

    return () => {
      if (unsubMatch) unsubMatch();
    };
  }, [tournamentId, matchId]);

  // Home team
  useEffect(() => {
    if (!tournamentId || !match?.homeTeamId) return;

    let active = true;

    (async () => {
      const teamDoc = await getDoc(doc(db, `tournaments/${tournamentId}/teams`, match.homeTeamId));
      if (!active) return;
      if (teamDoc.exists()) setHomeTeam({ id: teamDoc.id, ...teamDoc.data() } as Team);
      else setHomeTeam(null);
    })();

    return () => {
      active = false;
    };
  }, [tournamentId, match?.homeTeamId]);

  // Away team
  useEffect(() => {
    if (!tournamentId || !match?.awayTeamId) return;

    let active = true;

    (async () => {
      const teamDoc = await getDoc(doc(db, `tournaments/${tournamentId}/teams`, match.awayTeamId));
      if (!active) return;
      if (teamDoc.exists()) setAwayTeam({ id: teamDoc.id, ...teamDoc.data() } as Team);
      else setAwayTeam(null);
    })();

    return () => {
      active = false;
    };
  }, [tournamentId, match?.awayTeamId]);

  const handleGetPrediction = async () => {
    if (!match) return;
    setIsPredicting(true);
    try {
      const result = await getMatchPrediction(match.id, tournamentId);
      setPrediction(result);
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Prediction Failed', description: error?.message || 'Failed.' });
    } finally {
      setIsPredicting(false);
    }
  };

  const status = (match?.status || 'scheduled') as MatchStatus;
  const meta = statusMeta[status] ?? statusMeta.scheduled;

  if (loading) {
    return (
      <div className="flex justify-center items-center h-[60vh]">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
      </div>
    );
  }

  if (!match || !homeTeam || !awayTeam) {
    return (
      <div className="max-w-5xl mx-auto p-4 md:p-6 space-y-4">
        <Link href={`/tournaments/${tournamentId}`}>
          <Button variant="outline">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Tournament
          </Button>
        </Link>

        <Card>
          <CardContent className="pt-6">
            <p className="text-center text-muted-foreground">Match not found.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const statsAvailable =
    match.status === 'approved' &&
    match.homeTeamStats &&
    Object.keys(match.homeTeamStats).length > 0;

  return (
    <div className="max-w-5xl mx-auto p-4 md:p-6 space-y-5">
      {/* Top bar */}
      <div className="flex items-center justify-between gap-3">
        <Link href={`/tournaments/${tournamentId}`}>
          <Button variant="outline" className="h-9">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
        </Link>

        <Badge className={`border ${meta.className} gap-2 px-3 py-1`}>
          {meta.icon}
          <span className="font-bold uppercase tracking-wider text-[11px]">{meta.label}</span>
        </Badge>
      </div>

      {/* Match header */}
      <Card className="border-2">
        <CardContent className="pt-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] gap-4 items-center">
            {/* Home */}
            <div className="flex items-center gap-3 sm:flex-col sm:text-center">
              <Avatar className="h-12 w-12 sm:h-16 sm:w-16">
                <AvatarImage src={homeTeam.logoUrl} alt={homeTeam.name} />
                <AvatarFallback>{homeTeam.name?.[0]?.toUpperCase()}</AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="font-black truncate">{homeTeam.name}</p>
                <p className="text-xs text-muted-foreground font-bold uppercase tracking-wider">Home</p>
              </div>
            </div>

            {/* Score */}
            <div className="rounded-xl border bg-muted/20 px-5 py-4 text-center">
              {match.status === 'approved' ? (
                <div className="text-4xl font-black tabular-nums">
                  {match.homeScore} <span className="opacity-30">-</span> {match.awayScore}
                </div>
              ) : (
                <div className="text-2xl font-black text-muted-foreground uppercase tracking-widest">VS</div>
              )}
              <div className="mt-2 flex items-center justify-center gap-2 text-xs text-muted-foreground font-semibold">
                <Calendar className="h-4 w-4" />
                <span>{format(toDate(match.matchDay), 'PPP p')}</span>
              </div>
              {match.round ? <div className="mt-1 text-[11px] text-muted-foreground">{match.round}</div> : null}
            </div>

            {/* Away */}
            <div className="flex items-center gap-3 sm:flex-col sm:text-center sm:justify-self-end">
              <Avatar className="h-12 w-12 sm:h-16 sm:w-16">
                <AvatarImage src={awayTeam.logoUrl} alt={awayTeam.name} />
                <AvatarFallback>{awayTeam.name?.[0]?.toUpperCase()}</AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="font-black truncate">{awayTeam.name}</p>
                <p className="text-xs text-muted-foreground font-bold uppercase tracking-wider">Away</p>
              </div>
            </div>
          </div>

          <Separator />

          {/* Tiny metadata */}
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <Trophy className="h-4 w-4" />
              <span className="font-semibold">{tournament?.name || 'Tournament'}</span>
            </div>
            <div className="text-xs">
              Match ID: <span className="font-mono">{match.id}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* AI Summary */}
      {match.summary ? (
        <Alert className="border-2 border-yellow-500/30 bg-yellow-500/5">
          <Sparkles className="h-5 w-5 text-yellow-500" />
          <AlertTitle className="font-black">AI Summary</AlertTitle>
          <AlertDescription className="mt-2 text-sm leading-relaxed">{match.summary}</AlertDescription>
        </Alert>
      ) : null}

      {/* Stats (always visible on this page, no “view stats” button nonsense) */}
      {statsAvailable ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Trophy className="h-5 w-5 text-primary" />
              Match Stats
            </CardTitle>
            <CardDescription>From the reported match stats screenshot.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <StatRow
              label="Possession"
              home={match.homeTeamStats?.possession}
              away={match.awayTeamStats?.possession}
              isPercent
            />
            <StatRow label="Shots" home={match.homeTeamStats?.shots} away={match.awayTeamStats?.shots} />
            <StatRow
              label="Shots on Target"
              home={match.homeTeamStats?.shotsOnTarget}
              away={match.awayTeamStats?.shotsOnTarget}
            />
            <StatRow label="Passes" home={match.homeTeamStats?.passes} away={match.awayTeamStats?.passes} />
            <StatRow label="Tackles" home={match.homeTeamStats?.tackles} away={match.awayTeamStats?.tackles} />
            <StatRow label="Fouls" home={match.homeTeamStats?.fouls} away={match.awayTeamStats?.fouls} />
          </CardContent>
        </Card>
      ) : null}

      {/* Organizer Verdict */}
      {match.resolutionNotes ? (
        <Alert className="border-2 border-blue-500/30 bg-blue-500/5">
          <FileText className="h-5 w-5 text-blue-400" />
          <AlertTitle className="font-black">Organizer Verdict</AlertTitle>
          <AlertDescription className="mt-2 text-sm leading-relaxed">{match.resolutionNotes}</AlertDescription>
        </Alert>
      ) : null}

      {/* AI Prediction (only for scheduled) */}
      {match.status === 'scheduled' ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-yellow-500" />
              AI Prediction
            </CardTitle>
            <CardDescription>Optional. Because humans love gambling without calling it gambling.</CardDescription>
          </CardHeader>
          <CardContent>
            {!prediction ? (
              <Button onClick={handleGetPrediction} disabled={isPredicting} className="w-full h-10">
                {isPredicting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Analyzing…
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 mr-2 text-yellow-400" />
                    Generate Prediction
                  </>
                )}
              </Button>
            ) : (
              <div className="space-y-3">
                <div className="rounded-xl border bg-primary/10 p-4">
                  <p className="text-xs text-muted-foreground font-bold uppercase tracking-wider">Winner</p>
                  <p className="text-xl font-black text-primary">{prediction.predictedWinnerName}</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Confidence: <span className="font-black text-primary">{prediction.confidence}%</span>
                  </p>
                </div>
                <div className="rounded-xl border bg-muted/20 p-4">
                  <p className="text-xs text-muted-foreground font-bold uppercase tracking-wider mb-2">Reasoning</p>
                  <p className="text-sm italic leading-relaxed">{prediction.reasoning}</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}

      {/* Organizer note (no tools here, keep clean) */}
      {isOrganizer ? (
        <Card className="border-orange-500/30 bg-orange-500/5">
          <CardHeader>
            <CardTitle className="text-orange-300">Organizer</CardTitle>
            <CardDescription>Admin actions live on the tournament page. This page stays clean.</CardDescription>
          </CardHeader>
        </Card>
      ) : null}
    </div>
  );
}
