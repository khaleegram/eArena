
'use client';

import { useEffect, useMemo, useState, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';

import { db } from '@/lib/firebase';
import { doc, onSnapshot, getDoc, collection, query, orderBy } from 'firebase/firestore';

import type { Match, Team, Tournament, TeamMatchStats, UnifiedTimestamp, ReplayRequest, UserProfile, ChatMessage } from '@/lib/types';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';

import {
  Loader2,
  ArrowLeft,
  Trophy,
  FileText,
  Calendar,
  BarChartHorizontal,
  AlertTriangle,
  History,
  ShieldCheck,
  Tv,
  User,
  MessageSquare,
  Send,
  AlertCircle,
} from 'lucide-react';

import { format, isToday, isPast, endOfDay, formatDistanceToNow } from 'date-fns';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { setOrganizerStreamUrl, requestPlayerReplay, respondToPlayerReplay, forfeitMatch } from '@/lib/actions/tournament';
import { postMatchMessage } from '@/lib/actions/community';
import { MatchStatusBadge } from '@/components/match-status-badge';
import { toDate, cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ReputationAvatar } from '@/components/reputation-avatar';
import { ScrollArea } from '@/components/ui/scroll-area';


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

function ForfeitMatchDialog({ match, forfeitingTeamName }: { match: Match; forfeitingTeamName: string }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);

  const handleForfeit = async () => {
    if (!user) return;
    setIsLoading(true);
    try {
      await forfeitMatch(match.tournamentId, match.id, user.uid);
      toast({ title: "Match forfeited ✅", description: "Result recorded as 3-0 loss." });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="destructive" size="sm" className="h-8">
          Forfeit 🏳️
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Forfeit match?</AlertDialogTitle>
          <AlertDialogDescription>
            This records a 3-0 loss for <strong>{forfeitingTeamName}</strong>. Cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleForfeit} disabled={isLoading} className="bg-destructive hover:bg-destructive/90">
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Confirm
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function RequestReplayDialog({ match }: { match: Match }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [reason, setReason] = useState("");

  const handleRequest = async () => {
    if (!user || !reason.trim()) {
      toast({ variant: "destructive", title: "A reason is required." });
      return;
    }

    setIsSubmitting(true);
    try {
      await requestPlayerReplay(match.tournamentId, match.id, user.uid, reason);
      toast({ title: "Replay requested ✅", description: "Opponent has been notified." });
      setOpen(false);
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="h-8">
          <History className="mr-2 h-4 w-4" />
          Request Replay 🔁
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Request a Replay 🔁</DialogTitle>
          <DialogDescription>If there was a disconnect or issue, request a replay. Opponent must respond.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="reason">Reason</Label>
            <Textarea id="reason" name="reason" placeholder="e.g., Internet disconnected in the 80th minute." required value={reason} onChange={e => setReason(e.target.value)} />
          </div>
          <DialogFooter>
            <Button onClick={handleRequest} disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Send Request
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function RespondToReplayDialog({ match }: { match: Match }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);

  const handleResponse = async (accepted: boolean) => {
    if (!user) return;
    setIsLoading(true);
    try {
      await respondToPlayerReplay(match.tournamentId, match.id, user.uid, accepted);
      toast({ title: "Response sent ✅", description: "Organizer has been notified." });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex gap-2">
      <Button size="sm" variant="secondary" onClick={() => handleResponse(true)} disabled={isLoading} className="h-8">
        {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Accept ✅"}
      </Button>
      <Button size="sm" variant="destructive" onClick={() => handleResponse(false)} disabled={isLoading} className="h-8">
        Reject ❌
      </Button>
    </div>
  );
}


/* ----------------------------- Page ----------------------------- */

export default function MatchDetailsPage() {
  const params = useParams();
  const tournamentId = params.id as string;
  const matchId = params.matchId as string;

  const { user, userProfile } = useAuth();
  
  const [match, setMatch] = useState<Match | null>(null);
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [homeTeam, setHomeTeam] = useState<Team | null>(null);
  const [awayTeam, setAwayTeam] = useState<Team | null>(null);

  const [loading, setLoading] = useState(true);

  const isOrganizer = useMemo(() => {
    if (!tournament || !user) return false;
    return (tournament as any).organizerId === user.uid;
  }, [tournament, user]);
  
  // Combined real-time listener for match and one-time fetch for static data
  useEffect(() => {
    if (!tournamentId || !matchId) return;

    let unsubMatch: (() => void) | null = null;
    let active = true;

    const run = async () => {
      setLoading(true);
      try {
        const tournamentDoc = await getDoc(doc(db, 'tournaments', tournamentId));
        if (tournamentDoc.exists()) setTournament(tournamentDoc.data() as Tournament);
        else setTournament(null);

        unsubMatch = onSnapshot(doc(db, `tournaments/${tournamentId}/matches`, matchId), async (snapshot) => {
            if (!active) return;
            if (snapshot.exists()) {
                const matchData = { 
                    id: snapshot.id, 
                    ...snapshot.data(),
                    tournamentId: tournamentId // Ensure tournamentId is always present
                } as Match;
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
  
  const replayRequest: ReplayRequest | undefined = (match as any).replayRequest;
  const isHomeCaptain = user?.uid === homeTeam.captainId;
  const isAwayCaptain = user?.uid === awayTeam.captainId;
  const isMyTeam = isHomeCaptain || isAwayCaptain;
  const opponentCaptainId = isHomeCaptain ? awayTeam.captainId : homeTeam.captainId;
  
  const canRequestReplay = isMyTeam && !replayRequest && match.status === 'scheduled';
  const canRespondToReplay = user?.uid === opponentCaptainId && replayRequest?.status === 'pending';
  const canForfeit = (isHomeCaptain || isAwayCaptain) && isPast(toDate(match.matchDay)) && match.status === 'scheduled';

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
      <Card className="border-2 overflow-hidden">
        <CardContent className="pt-6 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] gap-4 items-center">
                <div className="flex flex-col items-center gap-2 text-center">
                    <Avatar className="h-16 w-16"><AvatarImage src={homeTeam.logoUrl} alt={homeTeam.name} /><AvatarFallback>{homeTeam.name?.[0]?.toUpperCase()}</AvatarFallback></Avatar>
                    <div className="min-w-0"><p className="font-black truncate">{homeTeam.name}</p><p className="text-xs text-muted-foreground font-bold uppercase tracking-wider">Home</p></div>
                </div>
                <div className="rounded-xl border bg-muted/20 px-5 py-4 text-center">
                    {(() => {
                        if (match.status === 'approved' && match.homeScore !== null && match.awayScore !== null) {
                            return <div className="text-4xl font-black tabular-nums">{match.homeScore} <span className="opacity-30">-</span> {match.awayScore}</div>;
                        }
                        const report = match.homeTeamReport || match.awayTeamReport;
                        if ((match.status === 'awaiting_confirmation' || match.status === 'disputed') && report) {
                            return <div className="text-4xl font-black tabular-nums">{report.homeScore} <span className="opacity-30">-</span> {report.awayScore}</div>;
                        }
                        return <div className="text-2xl font-black text-muted-foreground uppercase tracking-widest">VS</div>;
                    })()}
                    <div className="mt-2 flex items-center justify-center gap-2 text-xs text-muted-foreground font-semibold"><Calendar className="h-4 w-4" /><span>{format(toDate(match.matchDay), 'PPP p')}</span></div>
                    {match.round ? <div className="mt-1 text-[11px] text-muted-foreground">{match.round}</div> : null}
                </div>
                <div className="flex flex-col items-center gap-2 text-center">
                     <Avatar className="h-16 w-16"><AvatarImage src={awayTeam.logoUrl} alt={awayTeam.name} /><AvatarFallback>{awayTeam.name?.[0]?.toUpperCase()}</AvatarFallback></Avatar>
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

      <Card>
        <CardHeader>
            <CardTitle>Match Actions</CardTitle>
            <CardDescription>Request replays or forfeit if necessary.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
            {canForfeit ? <ForfeitMatchDialog match={match} forfeitingTeamName={isHomeCaptain ? homeTeam.name : awayTeam.name} /> : null}
            {canRequestReplay ? <RequestReplayDialog match={match} /> : null}
            {isOrganizer && user && <SetOrganizerStreamUrlDialog matchId={match.id} tournamentId={tournamentId} organizerId={user.uid} />}
        </CardContent>
      </Card>
      
       {replayRequest && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><History className="h-5 w-5" />Replay Request</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
              <Alert variant={replayRequest.status === 'accepted' ? 'default' : 'destructive'} className="text-sm">
                <AlertCircle className="h-4 w-4"/>
                <AlertTitle>Status: {replayRequest.status}</AlertTitle>
                <AlertDescription>Reason: "{replayRequest.reason}"</AlertDescription>
              </Alert>
              {canRespondToReplay && (
                <div>
                  <p className="text-sm font-semibold mb-2">Do you agree to a replay?</p>
                  <RespondToReplayDialog match={match} />
                </div>
              )}
          </CardContent>
        </Card>
       )}
    </div>
  );
}
