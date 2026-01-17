
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { db } from "@/lib/firebase";
import { collection, onSnapshot, query } from "firebase/firestore";
import type {
  Match,
  Team,
  MatchStatus,
  UnifiedTimestamp,
  Tournament,
  ChatMessage,
  UserProfile,
} from "@/lib/types";
import { useAuth } from "@/hooks/use-auth";
import { useCountdown } from "@/hooks/use-countdown";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

import {
  submitMatchResult,
  setMatchRoomCode,
  postMatchMessage,
  deleteMatchReport,
  submitSecondaryEvidence,
  transferHost,
  deleteMatchMessage,
} from "@/lib/actions";

import {
  Loader2,
  CheckCircle,
  Clock,
  AlertTriangle,
  Send,
  Trash2,
  Upload,
  Copy,
  Check,
  ArrowRightLeft,
  Swords,
  Info,
  Timer,
  MessageCircle,
  Calendar,
  Hourglass,
  Crown,
  Trophy,
  Zap,
} from "lucide-react";

import { format, isToday, isFuture, endOfDay, isPast } from "date-fns";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

import Link from "next/link";
import { MatchStatusBadge } from "@/components/match-status-badge";
import { toDate } from "@/lib/utils";

/* ----------------------------- Utilities ----------------------------- */

const EndOfMatchDay = (matchDay: UnifiedTimestamp) => {
  const d = new Date(toDate(matchDay));
  d.setHours(23, 59, 59, 999);
  return d;
};


/* ----------------------------- Dialogs & Buttons ----------------------------- */

function ReportScoreDialog({
  match,
  teamToReportFor,
  homeTeamName,
  awayTeamName,
}: {
  match: Match;
  teamToReportFor: Team;
  homeTeamName: string;
  awayTeamName: string;
}) {
  const [open, setOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();

  const handleFormAction = async (formData: FormData) => {
    if (!user) {
      toast({ variant: "destructive", title: "Error", description: "You must be logged in." });
      return;
    }

    const homeScore = formData.get("homeScore");
    const awayScore = formData.get("awayScore");
    const evidence = formData.get("evidence") as File;

    if (homeScore === null || awayScore === null || !evidence || evidence.size === 0) {
      toast({ variant: "destructive", title: "Missing info", description: "Enter both scores + upload a screenshot." });
      return;
    }

    setIsSubmitting(true);
    try {
      await submitMatchResult(match.tournamentId, match.id, teamToReportFor.id, user.uid, formData);
      toast({ title: "Report submitted ✅", description: "Awaiting verification." });
      setOpen(false);
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message || "Failed to submit result." });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="h-8">
          <Upload className="h-4 w-4 mr-2" />
          Report Score
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Report Match Result 🧾</DialogTitle>
          <DialogDescription>
            {homeTeamName} vs {awayTeamName}
          </DialogDescription>
        </DialogHeader>

        <form action={handleFormAction} className="space-y-5 pt-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="homeScore">{homeTeamName} Score</Label>
              <Input id="homeScore" name="homeScore" type="number" required className="text-center text-xl font-black h-14" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="awayScore">{awayTeamName} Score</Label>
              <Input id="awayScore" name="awayScore" type="number" required className="text-center text-xl font-black h-14" />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="evidence">Screenshot Evidence (Match Stats)</Label>
            <Input id="evidence" name="evidence" type="file" accept="image/*" required />
            <p className="text-xs text-muted-foreground">Screenshot of the final match stats screen is required.</p>
          </div>

          <DialogFooter>
            <Button type="submit" disabled={isSubmitting} className="w-full h-11">
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Submit Report
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function SubmitSecondaryEvidenceDialog({ match, teamToReportFor }: { match: Match; teamToReportFor: Team }) {
  const [open, setOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();

  const handleFormAction = async (formData: FormData) => {
    if (!user) {
      toast({ variant: "destructive", title: "Error", description: "You must be logged in." });
      return;
    }

    const evidence = formData.get("evidence") as File;
    if (!evidence || evidence.size === 0) {
      toast({ variant: "destructive", title: "Error", description: "Please upload a screenshot." });
      return;
    }

    setIsSubmitting(true);
    try {
      await submitSecondaryEvidence(match.tournamentId, match.id, teamToReportFor.id, user.uid, formData);
      toast({ title: "Evidence submitted ✅" });
      setOpen(false);
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message || "Failed to submit evidence." });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="h-8 border-yellow-500/60 text-yellow-500 hover:bg-yellow-500/10">
          <AlertTriangle className="h-4 w-4 mr-2" />
          More Evidence
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Submit Secondary Evidence 📸</DialogTitle>
          <DialogDescription>The AI needs more info. Upload the Match History screenshot for this game.</DialogDescription>
        </DialogHeader>

        <div className="text-sm p-3 my-2 bg-muted rounded-md space-y-1">
          <p className="font-semibold">How to find Match History:</p>
          <p>1. eFootball → Extras</p>
          <p>2. User Information → Match History</p>
          <p>3. Find the match and screenshot it</p>
        </div>

        <form action={handleFormAction} className="space-y-4 pt-2">
          <div className="space-y-2">
            <Label htmlFor="evidence">Screenshot (Match History)</Label>
            <Input id="evidence" name="evidence" type="file" accept="image/*" required />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={isSubmitting} className="w-full">
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Submit
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteReportButton({ match, userId }: { match: Match; userId: string }) {
  const [isDeleting, setIsDeleting] = useState(false);
  const { toast } = useToast();

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await deleteMatchReport(match.tournamentId, match.id, userId);
      toast({ title: "Report deleted ✅", description: "You can submit a new one now." });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="outline" size="sm" disabled={isDeleting} className="h-8">
          {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete your report?</AlertDialogTitle>
          <AlertDialogDescription>This clears your submission. You can re-submit after.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleDelete} disabled={isDeleting}>
            Yes, delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function TransferHostButton({ matchId, tournamentId }: { matchId: string; tournamentId: string }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);

  const handleTransfer = async () => {
    if (!user) return;
    setIsLoading(true);
    try {
      await transferHost(tournamentId, matchId, user.uid);
      toast({ title: "Host transferred ✅", description: "Opponent is now responsible for creating the room." });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message || "Failed to transfer host." });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Button size="sm" variant="outline" onClick={handleTransfer} disabled={isLoading} className="h-8">
      {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRightLeft className="h-4 w-4" />}
    </Button>
  );
}

function RoomCodeManager({ match, isMatchDay }: { match: Match; isMatchDay: boolean }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState(match.roomCode || "");
  const [isLoading, setIsLoading] = useState(false);
  const [hasCopied, setHasCopied] = useState(false);

  const isHost = user?.uid === (match as any).host?.captainId;

  const handleSaveCode = async () => {
    setIsLoading(true);
    try {
      await setMatchRoomCode(match.tournamentId, match.id, code);
      toast({ title: "Room code saved ✅" });
      setOpen(false);
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!match.roomCode) return;
    await navigator.clipboard.writeText(match.roomCode);
    setHasCopied(true);
    setTimeout(() => setHasCopied(false), 1500);
  };

  if (isHost) {
    return (
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button variant="secondary" size="sm" disabled={!isMatchDay} className="h-8 flex-1">
            {match.roomCode ? "Edit Code" : "Set Code"}
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Set Match Room Code 🔑</DialogTitle>
            <DialogDescription>Enter the 8-digit code for your friendly match room.</DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-2">
            <Label htmlFor="room-code">Room Code (8 digits)</Label>
            <Input
              id="room-code"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\s/g, ""))}
              maxLength={8}
              className="text-center font-mono text-lg tracking-[0.2em]"
            />
            <p className="text-xs text-muted-foreground">Only the host can set this. Opponent will see it instantly.</p>
          </div>
          <DialogFooter>
            <Button onClick={handleSaveCode} disabled={isLoading || code.length < 8}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Code
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  if (match.roomCode) {
    return (
      <div className="flex items-center justify-between rounded-lg border bg-muted/30 px-3 py-2 h-8">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Code</span>
          <span className="font-mono font-black tracking-widest">{match.roomCode}</span>
        </div>
        <Button variant="ghost" size="icon" onClick={handleCopy} className="h-7 w-7">
          {hasCopied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
        </Button>
      </div>
    );
  }

  return <div className="text-xs text-center text-muted-foreground italic h-8 flex items-center justify-center">Waiting...</div>;
}

function MatchChatDialog({
  match,
  homeTeamName,
  awayTeamName,
  isMatchDay,
  isOrganizer,
}: {
  match: Match;
  homeTeamName: string;
  awayTeamName: string;
  isMatchDay: boolean;
  isOrganizer: boolean;
}) {
  const { user, userProfile } = useAuth();
  const { toast } = useToast();
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  useEffect(() => {
    const q = query(collection(db, `tournaments/${match.tournamentId}/matches/${match.id}/messages`), orderBy("timestamp", "asc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setMessages(snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as ChatMessage)));
    });
    return () => unsubscribe();
  }, [match.tournamentId, match.id]);

  const handleSendMessage = async (message: string) => {
    if (!user || !userProfile) {
      toast({ variant: "destructive", title: "Error", description: "You must be logged in to chat." });
      return;
    }
    await postMatchMessage(
      match.tournamentId,
      match.id,
      user.uid,
      userProfile.username || user.email!,
      userProfile.photoURL || "",
      message
    );
  };
  
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);

  useEffect(() => {
      if (scrollAreaRef.current) {
          scrollAreaRef.current.scrollTo({ top: scrollAreaRef.current.scrollHeight });
      }
  }, [messages]);
  
  const handleDelete = async (messageId: string) => {
    if (!user) return;
    setIsDeleting(messageId);
    try {
        await deleteMatchMessage(match.tournamentId, match.id, messageId, user.uid);
        toast({ title: "Message Deleted" });
    } catch (error: any) {
        toast({ variant: 'destructive', title: "Error", description: error.message });
    } finally {
        setIsDeleting(null);
    }
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" disabled={!isMatchDay} className="h-8 flex-1">
          <MessageCircle className="h-4 w-4 mr-2" />
          Chat
          {messages.length > 0 && (
            <span className="ml-2 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-primary text-primary-foreground text-[10px] font-bold">
              {messages.length}
            </span>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[480px] p-0 overflow-hidden gap-0">
        <DialogHeader className="p-4 border-b bg-muted/30">
          <DialogTitle className="text-base font-bold flex items-center gap-2">
            <MessageCircle className="h-4 w-4 text-primary" />
            {homeTeamName} vs {awayTeamName}
          </DialogTitle>
          <DialogDescription>Coordinate match time and room code here.</DialogDescription>
        </DialogHeader>
        <div className="px-4 flex flex-col h-[480px]">
          <ScrollArea className="flex-grow pr-3 -mr-3" ref={scrollAreaRef as any}>
            <div className="space-y-3 py-4">
              {messages.map((msg) => {
                const isMe = msg.userId === user?.uid;
                return (
                  <div key={msg.id} className={cn("flex items-end gap-2 group", isMe ? "flex-row-reverse" : "")}>
                    <Avatar className="h-7 w-7 border">
                      <AvatarImage src={msg.photoURL} alt={msg.username} />
                      <AvatarFallback className="text-[10px]">{msg.username?.charAt(0)?.toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <div className={cn("max-w-[80%] rounded-2xl px-3 py-2", isMe ? "bg-primary text-primary-foreground rounded-br-none" : "bg-muted rounded-bl-none")}>
                      {!isMe && <p className="text-[10px] font-black uppercase tracking-wider opacity-60 mb-1">{msg.username}</p>}
                      <p className="text-sm whitespace-pre-wrap leading-relaxed">{msg.message}</p>
                      <p className="text-[9px] opacity-60 mt-1 text-right italic">
                        {msg.timestamp ? formatDistanceToNow(toDate(msg.timestamp), { addSuffix: true }) : "..."}
                      </p>
                    </div>
                    {isOrganizer && !isMe && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild><Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity" disabled={isDeleting === msg.id}>{isDeleting === msg.id ? <Loader2 className="h-4 w-4 animate-spin"/> : <Trash2 className="h-4 w-4 text-destructive"/>}</Button></AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader><AlertDialogTitle>Delete message?</AlertDialogTitle><AlertDialogDescription>This removes the message permanently.</AlertDialogDescription></AlertDialogHeader>
                          <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => handleDelete(msg.id)} className="bg-destructive hover:bg-destructive/90">Delete</AlertDialogAction></AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </div>
                );
              })}
            </div>
          </ScrollArea>
          <ChatInput onSendMessage={handleSendMessage} />
          <div className="py-3 text-center"><p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold opacity-60">keep it clean. organizer is watching 👀</p></div>
        </div>
      </DialogContent>
    </Dialog>
  );
}


/* ----------------------------- Main Card ----------------------------- */

function MatchCard({
  match,
  teams,
  getTeam,
  userTeam,
  isOrganizer,
}: {
  match: Match;
  teams: Team[];
  getTeam: (id: string) => Team | undefined;
  userTeam: Team | null;
  isOrganizer: boolean;
}) {
  const { user } = useAuth();

  const homeTeam = getTeam(match.homeTeamId);
  const awayTeam = getTeam(match.awayTeamId);

  if (!homeTeam || !awayTeam || !userTeam || !user) return null;

  const isMatchDay = isToday(toDate(match.matchDay));

  const isHomeCaptain = user.uid === homeTeam.captainId;
  const isAwayCaptain = user.uid === awayTeam.captainId;

  const hasHomeReported = !!match.homeTeamReport;
  const hasAwayReported = !!match.awayTeamReport;

  const canHomeReport = isHomeCaptain && !hasHomeReported && isMatchDay;
  const canAwayReport = isAwayCaptain && !hasAwayReported && isMatchDay;

  const showReportButton = (canHomeReport || canAwayReport) && ['scheduled', 'awaiting_confirmation'].includes(match.status);

  const canHomeDelete = isHomeCaptain && hasHomeReported && match.status === "awaiting_confirmation";
  const canAwayDelete = isAwayCaptain && hasAwayReported && match.status === "awaiting_confirmation";

  const canSubmitSecondaryHome = isHomeCaptain && !match.homeTeamSecondaryReport && isMatchDay;
  const canSubmitSecondaryAway = isAwayCaptain && !match.awayTeamSecondaryReport && isMatchDay;
  const showSecondaryButton = match.status === "needs_secondary_evidence" && (canSubmitSecondaryHome || canSubmitSecondaryAway);

  const hostTeamName = getTeam(match.hostId)?.name || "N/A";
  const isHostCaptain = user.uid === getTeam(match.hostId)?.captainId;
  const isMyTeam = userTeam.id === homeTeam.id || userTeam.id === awayTeam.id;

  if (!isMyTeam) return null;

  return (
    <Card className={cn("relative overflow-hidden", "hover:border-primary/20 transition-colors")}>
      <CardContent className="p-0">
        <Link href={`/tournaments/${match.tournamentId}/matches/${match.id}`} className="block hover:bg-muted/30 p-4 space-y-3">
          {/* Header strip */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MatchStatusBadge status={match.status} />
              <Badge variant="outline" className="text-[10px] font-bold uppercase tracking-wider">
                <Calendar className="h-3 w-3 mr-1" />
                {format(toDate(match.matchDay), "MMM d, HH:mm")}
              </Badge>
            </div>
            <span className="text-xs text-muted-foreground font-semibold">{match.round}</span>
          </div>

          {/* Scoreboard */}
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] gap-2 items-center">
            <div className="flex items-center gap-3">
              <Avatar className="h-10 w-10"><AvatarImage src={homeTeam.logoUrl} alt={homeTeam.name} /><AvatarFallback>{homeTeam.name?.[0]?.toUpperCase()}</AvatarFallback></Avatar>
              <div className="min-w-0"><p className="font-bold truncate">{homeTeam.name}</p></div>
            </div>
            <div className="text-center">
              {match.status === "approved" ? (
                <div className="text-3xl font-black tabular-nums">{match.homeScore} <span className="opacity-30">-</span> {match.awayScore}</div>
              ) : (
                <div className="text-xl font-black text-muted-foreground uppercase tracking-widest">VS</div>
              )}
            </div>
            <div className="flex items-center gap-3 sm:flex-row-reverse">
              <Avatar className="h-10 w-10"><AvatarImage src={awayTeam.logoUrl} alt={awayTeam.name} /><AvatarFallback>{awayTeam.name?.[0]?.toUpperCase()}</AvatarFallback></Avatar>
              <div className="min-w-0 sm:text-right"><p className="font-bold truncate">{awayTeam.name}</p></div>
            </div>
          </div>
          <div className="text-xs text-muted-foreground text-center pt-2">Host: <strong>{hostTeamName}</strong></div>
        </Link>

        {/* Action Bar */}
        <div className="p-2 border-t bg-muted/20 flex flex-wrap gap-2 justify-end">
          <MatchChatDialog match={match} homeTeamName={homeTeam.name} awayTeamName={awayTeam.name} isMatchDay={isMatchDay} isOrganizer={isOrganizer}/>
          {isHostCaptain && <TransferHostButton matchId={match.id} tournamentId={match.tournamentId} />}
          <RoomCodeManager match={{ ...match, host: getTeam(match.hostId) } as any} isMatchDay={isMatchDay} />
          {showReportButton && <ReportScoreDialog match={match} teamToReportFor={canHomeReport ? homeTeam : awayTeam} homeTeamName={homeTeam.name} awayTeamName={awayTeam.name} />}
          {showSecondaryButton && <SubmitSecondaryEvidenceDialog match={match} teamToReportFor={canSubmitSecondaryHome ? homeTeam : awayTeam} />}
          {(canHomeDelete || canAwayDelete) && <DeleteReportButton match={match} userId={user.uid} />}
        </div>
      </CardContent>
    </Card>
  );
}


/* ----------------------------- Main Tab ----------------------------- */

export function MyMatchesTab({
  tournament,
  isOrganizer,
  userTeam,
}: {
  tournament: Tournament;
  isOrganizer: boolean;
  userTeam: Team | null;
}) {
  const [matches, setMatches] = useState<Match[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAllMatches, setShowAllMatches] = useState(false);

  useEffect(() => {
    if (!userTeam) {
      setLoading(false);
      return;
    }

    let active = true;
    let teamsLoaded = false;
    let matchesLoaded = false;

    const checkDone = () => {
      if (!active) return;
      if (teamsLoaded && matchesLoaded) setLoading(false);
    };

    const matchQuery = query(collection(db, `tournaments/${tournament.id}/matches`));
    const teamQuery = query(collection(db, `tournaments/${tournament.id}/teams`));

    const unsubMatches = onSnapshot(matchQuery, (snapshot) => {
      if (!active) return;
      const allMatches = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Match));
      const myMatches = allMatches.filter((m) => m.homeTeamId === userTeam.id || m.awayTeamId === userTeam.id);
      const sorted = myMatches.sort((a, b) => (a.round || "").localeCompare(b.round || ""));
      setMatches(sorted);
      matchesLoaded = true;
      checkDone();
    });

    const unsubTeams = onSnapshot(teamQuery, (snapshot) => {
      if (!active) return;
      const teamsData = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as Team);
      setTeams(teamsData);
      teamsLoaded = true;
      checkDone();
    });

    return () => {
      active = false;
      unsubMatches();
      unsubTeams();
    };
  }, [tournament.id, userTeam]);

  const getTeam = (teamId: string) => teams.find((t) => t.id === teamId);

  const displayedMatches = useMemo(() => {
    if (!userTeam) return [];

    const userMatches = matches.filter((m) => m.homeTeamId === userTeam.id || m.awayTeamId === userTeam.id);
    
    // Sort by match day
    userMatches.sort((a,b) => toDate(a.matchDay).getTime() - toDate(b.matchDay).getTime());

    if (showAllMatches) {
      return userMatches;
    }

    const now = new Date();
    // Show next upcoming match + up to 2 most recent completed/active matches
    const upcoming = userMatches.filter(m => isFuture(toDate(m.matchDay)) || isToday(toDate(m.matchDay)));
    const past = userMatches.filter(m => isPast(toDate(m.matchDay)));

    const nextMatch = upcoming[0];
    const recentPast = past.sort((a, b) => toDate(b.matchDay).getTime() - toDate(a.matchDay).getTime()).slice(0, 2);

    let finalDisplay = [];
    if(nextMatch) finalDisplay.push(nextMatch);
    finalDisplay.push(...recentPast);
    
    // Remove duplicates if next match is also in recent past (if it's today)
    finalDisplay = [...new Set(finalDisplay)];

    return finalDisplay;
  }, [matches, userTeam, showAllMatches]);

  if (!userTeam) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Swords className="h-5 w-5" />
            My Matches
          </CardTitle>
          <CardDescription>You’ll see your matches after joining a tournament.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Zap className="h-5 w-5 text-primary" />
                {showAllMatches ? "📅 All Your Matches" : "🧾 Recent & Upcoming Matches"}
              </CardTitle>
              <CardDescription>Manage reporting, chats, and view your schedule.</CardDescription>
            </div>
            {matches.length > 3 && (
              <Button variant="outline" size="sm" className="h-8" onClick={() => setShowAllMatches(!showAllMatches)}>
                {showAllMatches ? "Show Less" : "View All"}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center items-center h-40">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : displayedMatches.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Crown className="h-10 w-10 mx-auto opacity-20 mb-3" />
              Your matches will appear here once fixtures are generated.
            </div>
          ) : (
            <div className="space-y-4">
              {displayedMatches.map((m) => (
                <MatchCard key={m.id} match={m} teams={teams} getTeam={getTeam} userTeam={userTeam} isOrganizer={isOrganizer} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

```</content>
  </change>
  <change>
    <file>src/app/tournaments/[id]/matches/[matchId]/page.tsx</file>
    <content><![CDATA[
'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';

import { db } from '@/lib/firebase';
import { doc, onSnapshot } from 'firebase/firestore';

import type { Match, Team, Tournament, TeamMatchStats, UnifiedTimestamp, ReplayRequest, UserProfile } from '@/lib/types';

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
  Sparkles,
  Trophy,
  FileText,
  Calendar,
  BarChartHorizontal,
  Bot,
  AlertTriangle,
  History,
  ShieldCheck
} from 'lucide-react';

import { format, isToday, isPast, endOfDay } from 'date-fns';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { getMatchPrediction, setOrganizerStreamUrl, requestPlayerReplay, respondToPlayerReplay, forfeitMatch } from '@/lib/actions';
import { MatchStatusBadge } from '@/components/match-status-badge';
import { toDate } from '@/lib/utils';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
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

  const handleFormAction = async (formData: FormData) => {
    if (!user) return;
    const reason = formData.get("reason") as string;
    if (!reason) {
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
        <form action={handleFormAction} className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="reason">Reason</Label>
            <Textarea id="reason" name="reason" placeholder="e.g., Internet disconnected in the 80th minute." required />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Send Request
            </Button>
          </DialogFooter>
        </form>
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
        const tournamentDoc = await getDoc(doc(db, 'tournaments', tournamentId));
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
  
  const replayRequest: ReplayRequest | undefined = (match as any).replayRequest;
  const isHomeCaptain = user?.uid === homeTeam.captainId;
  const isAwayCaptain = user?.uid === awayTeam.captainId;
  const isMyTeam = isHomeCaptain || isAwayCaptain;
  const opponentCaptainId = isHomeCaptain ? awayTeam.captainId : homeTeam.captainId;
  
  const canRequestReplay = isMyTeam && !replayRequest && match.status === 'scheduled';
  const canRespondToReplay = user?.uid === opponentCaptainId && replayRequest?.status === 'pending';
  const canForfeit = (isHomeCaptain || isAwayCaptain) && isToday(toDate(match.matchDay)) && match.status === "scheduled";

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
