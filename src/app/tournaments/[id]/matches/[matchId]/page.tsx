
'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';

import { db } from '@/lib/firebase';
import { doc, onSnapshot } from 'firebase/firestore';

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
  FileText,
  Calendar,
  BarChartHorizontal,
  Bot,
} from 'lucide-react';

import { format, isFuture, isPast, isToday, endOfDay } from 'date-fns';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { getMatchPrediction, setOrganizerStreamUrl } from '@/lib/actions';
import { MatchStatusBadge } from '@/components/match-status-badge';
import { toDate } from '@/lib/utils';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tv } from 'lucide-react';


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

function AIPrediction({ match, tournamentId }: { match: Match, tournamentId: string}) {
    const [prediction, setPrediction] = useState<{ predictedWinnerName: string; confidence: number; reasoning: string } | null>(null);
    const [isPredicting, setIsPredicting] = useState(false);
    const { toast } = useToast();

    const handleGetPrediction = async () => {
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
    
    if (match.status !== 'scheduled') return null;

    return (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bot className="h-5 w-5 text-primary" />
              AI Prediction
            </CardTitle>
            <CardDescription>An entertaining, data-driven prediction for the match outcome.</CardDescription>
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
                  <p className="text-xs text-muted-foreground font-bold uppercase tracking-wider">Predicted Winner</p>
                  <p className="text-xl font-black text-primary">{prediction.predictedWinnerName}</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Confidence: <span className="font-black text-primary">{prediction.confidence}%</span>
                  </p>
                </div>
                <div className="rounded-xl border bg-muted/20 p-4">
                  <p className="text-xs text-muted-foreground font-bold uppercase tracking-wider mb-2">Pundit's Take</p>
                  <p className="text-sm italic leading-relaxed">{prediction.reasoning}</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
    );
}

function SetOrganizerStreamUrlDialog({ matchId, tournamentId, organizerId }: { matchId: string; tournamentId: string; organizerId: string; }) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const handleSave = async () => {
    setIsLoading(true);
    try {
      await setOrganizerStreamUrl(tournamentId, matchId, url, organizerId);
      toast({ title: "Success", description: "Official stream URL has been set." });
      setOpen(false);
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 text-xs">
          <Tv className="mr-2 h-3 w-3" />
          Set Official Stream
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Official Live Stream URL</DialogTitle>
          <DialogDescription>Link a Twitch or YouTube stream for this match.</DialogDescription>
        </DialogHeader>
        <div className="py-4 space-y-2">
          <Label htmlFor="stream-url">Stream URL</Label>
          <Input id="stream-url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://youtube.com/..." />
        </div>
        <DialogFooter>
          <Button onClick={handleSave} disabled={isLoading || !url.trim()}>
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save Link
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


/* ----------------------------- Page ----------------------------- */

export default function MatchDetailsPage() {
  const params = useParams();
  const tournamentId = params.id as string;
  const matchId = params.matchId as string;

  const { user } = useAuth();
  
  const [match, setMatch] = useState<Match | null>(null);
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [homeTeam, setHomeTeam] = useState<Team | null>(null);
  const [awayTeam, setAwayTeam] = useState<Team | null>(null);

  const [loading, setLoading] = useState(true);

  const isOrganizer = useMemo(() => {
    if (!tournament || !user) return false;
    return (tournament as any).organizerId === user.uid;
  }, [tournament, user]);
  
  const isMatchLocked = useMemo(() => {
      if(!match) return true;
      const matchDay = toDate(match.matchDay);
      return !isToday(matchDay) && !isPast(matchDay);
  }, [match]);

  // Combined real-time listener for match and one-time fetch for static data
  useEffect(() => {
    if (!tournamentId || !matchId) return;

    let unsubMatch: (() => void) | null = null;
    let active = true;

    const run = async () => {
      setLoading(true);
      try {
        const tournamentDoc = await doc(db, 'tournaments', tournamentId).get();
        if (tournamentDoc.exists()) setTournament(tournamentDoc.data() as Tournament);
        else setTournament(null);

        unsubMatch = onSnapshot(doc(db, `tournaments/${tournamentId}/matches`, matchId), async (snapshot) => {
            if (!active) return;
            if (snapshot.exists()) {
                const matchData = { id: snapshot.id, ...snapshot.data() } as Match;
                setMatch(matchData);

                const [homeTeamDoc, awayTeamDoc] = await Promise.all([
                    getDoc(doc(db, `tournaments/${tournamentId}/teams`, matchData.homeTeamId)),
                    getDoc(doc(db, `tournaments/${tournamentId}/teams`, matchData.awayTeamId))
                ]);
                
                if (homeTeamDoc.exists()) setHomeTeam({ id: homeTeamDoc.id, ...homeTeamDoc.data() } as Team);
                if (awayTeamDoc.exists()) setAwayTeam({ id: awayTeamDoc.id, ...awayTeamDoc.data() } as Team);

            } else {
                setMatch(null);
            }
            setLoading(false);
        });

      } catch (e) {
        console.error(e);
        setLoading(false);
      }
    };
    run();
    return () => {
      active = false;
      if (unsubMatch) unsubMatch();
    };
  }, [tournamentId, matchId]);
  

  if (loading) {
    return (
      <div className="flex justify-center items-center h-[60vh]">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
      </div>
    );
  }

  if (!match || !homeTeam || !awayTeam || !tournament) {
    return (
      <div className="max-w-5xl mx-auto p-4 md:p-6 space-y-4">
        <Link href={`/tournaments/${tournamentId}`}>
          <Button variant="outline">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Tournament
          </Button>
        </Link>
        <Card><CardContent className="pt-6"><p className="text-center text-muted-foreground">Match not found.</p></CardContent></Card>
      </div>
    );
  }
  
  const statsAvailable = match.status === 'approved' && match.homeTeamStats && Object.keys(match.homeTeamStats).length > 0;

  return (
    <div className="max-w-5xl mx-auto p-4 md:p-6 space-y-5">
      {/* Top bar */}
      <div className="flex items-center justify-between gap-3">
        <Link href={`/tournaments/${tournamentId}?tab=my-matches`}>
          <Button variant="outline" className="h-9">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
        </Link>
        <MatchStatusBadge status={match.status} />
      </div>

      {/* Match header */}
      <Card className="border-2">
        <CardContent className="pt-6 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] gap-4 items-center">
                <div className="flex items-center gap-3 sm:flex-col sm:text-center">
                    <Avatar className="h-12 w-12 sm:h-16 sm:w-16"><AvatarImage src={homeTeam.logoUrl} alt={homeTeam.name} /><AvatarFallback>{homeTeam.name?.[0]?.toUpperCase()}</AvatarFallback></Avatar>
                    <div className="min-w-0"><p className="font-black truncate">{homeTeam.name}</p><p className="text-xs text-muted-foreground font-bold uppercase tracking-wider">Home</p></div>
                </div>
                <div className="rounded-xl border bg-muted/20 px-5 py-4 text-center">
                    {match.status === 'approved' ? (
                        <div className="text-4xl font-black tabular-nums">{match.homeScore} <span className="opacity-30">-</span> {match.awayScore}</div>
                    ) : (<div className="text-2xl font-black text-muted-foreground uppercase tracking-widest">VS</div>)}
                    <div className="mt-2 flex items-center justify-center gap-2 text-xs text-muted-foreground font-semibold"><Calendar className="h-4 w-4" /><span>{format(toDate(match.matchDay), 'PPP p')}</span></div>
                    {match.round ? <div className="mt-1 text-[11px] text-muted-foreground">{match.round}</div> : null}
                </div>
                <div className="flex items-center gap-3 sm:flex-col sm:text-center sm:justify-self-end">
                     <Avatar className="h-12 w-12 sm:h-16 sm:w-16"><AvatarImage src={awayTeam.logoUrl} alt={awayTeam.name} /><AvatarFallback>{awayTeam.name?.[0]?.toUpperCase()}</AvatarFallback></Avatar>
                    <div className="min-w-0"><p className="font-black truncate">{awayTeam.name}</p><p className="text-xs text-muted-foreground font-bold uppercase tracking-wider">Away</p></div>
                </div>
            </div>
            <Separator />
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
                <div className="flex items-center gap-2"><Trophy className="h-4 w-4" /><span className="font-semibold">{tournament.name}</span></div>
                <div className="text-xs">Match ID: <span className="font-mono">{match.id}</span></div>
            </div>
        </CardContent>
      </Card>
      
      {isMatchLocked && (
        <Alert variant="default"><AlertTriangle className="h-4 w-4" /><AlertTitle>Match Locked</AlertTitle><AlertDescription>Match actions will be available on match day.</AlertDescription></Alert>
      )}

      {match.summary && (
        <Alert className="border-2 border-yellow-500/30 bg-yellow-500/5"><Sparkles className="h-5 w-5 text-yellow-500" /><AlertTitle className="font-black">AI Summary</AlertTitle><AlertDescription className="mt-2 text-sm leading-relaxed">{match.summary}</AlertDescription></Alert>
      )}
      
      {statsAvailable && (
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><BarChartHorizontal className="w-5 h-5 text-primary"/>Match Stats</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <StatRow label="Possession" home={match.homeTeamStats?.possession} away={match.awayTeamStats?.possession} isPercent />
            <StatRow label="Shots" home={match.homeTeamStats?.shots} away={match.awayTeamStats?.shots} />
            <StatRow label="On Target" home={match.homeTeamStats?.shotsOnTarget} away={match.awayTeamStats?.shotsOnTarget} />
            <StatRow label="Saves" home={match.homeTeamStats?.saves} away={match.awayTeamStats?.saves} />
            <StatRow label="Passes" home={match.homeTeamStats?.passes} away={match.awayTeamStats?.passes} />
            <StatRow label="Tackles" home={match.homeTeamStats?.tackles} away={match.awayTeamStats?.tackles} />
            <StatRow label="Fouls" home={match.homeTeamStats?.fouls} away={match.awayTeamStats?.fouls} />
          </CardContent>
        </Card>
      )}
      
      {match.resolutionNotes && (
        <Alert className="border-2 border-blue-500/30 bg-blue-500/5"><FileText className="h-5 w-5 text-blue-400" /><AlertTitle className="font-black">Organizer Verdict</AlertTitle><AlertDescription className="mt-2 text-sm leading-relaxed">{match.resolutionNotes}</AlertDescription></Alert>
      )}

      <AIPrediction match={match} tournamentId={tournamentId} />
      
       {isOrganizer && user && <SetOrganizerStreamUrlDialog matchId={match.id} tournamentId={tournamentId} organizerId={user.uid} />}

    </div>
  );
}
