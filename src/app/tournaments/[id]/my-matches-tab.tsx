
"use client";

import React, { useEffect, useMemo, useState, useRef } from "react";
import { db } from "@/lib/firebase";
import { collection, onSnapshot, query, orderBy } from "firebase/firestore";
import type {
  Match,
  Team,
  Tournament,
  UserProfile,
} from "@/lib/types";


import { useAuth } from "@/hooks/use-auth";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";

import Image from "next/image";

import {
  Loader2,
  User,
  Video,
  Sparkles,
  Calendar,
  Send,
  Upload,
  Copy,
  Check,
  ArrowRightLeft,
  Swords,
  Timer,
  MessageCircle,
  Hourglass,
  Crown,
  Zap,
  Lock,
} from "lucide-react";

import { format, isToday, isFuture } from "date-fns";

import Link from "next/link";
import { toDate, cn } from "@/lib/utils";
import { MatchStatusBadge } from "@/components/match-status-badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { ScrollArea } from "@/components/ui/scroll-area";
import { submitMatchResult, transferHost, setMatchRoomCode, postMatchMessage } from "@/lib/actions";
import { getOverallRoundRank } from "@/lib/cup-progression";


/* ----------------------------- Dialogs & Buttons ----------------------------- */

function ReportScoreDialog({
  match,
  teamToReportFor,
  homeTeamName,
  awayTeamName,
  tournamentId,
}: {
  match: Match;
  teamToReportFor: Team;
  homeTeamName: string;
  awayTeamName: string;
  tournamentId: string;
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
      await submitMatchResult(tournamentId, match.id, teamToReportFor.id, user.uid, formData);
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

function RoomCodeManager({ match, isMatchDay, tournamentId }: { match: Match; isMatchDay: boolean; tournamentId: string; }) {
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
      await setMatchRoomCode(tournamentId, match.id, code);
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
  tournamentId,
  homeTeamName,
  awayTeamName,
  isMatchDay,
  isOrganizer,
}: {
  match: Match;
  tournamentId: string;
  homeTeamName: string;
  awayTeamName: string;
  isMatchDay: boolean;
  isOrganizer: boolean;
}) {
  const { user, userProfile } = useAuth();
  const { toast } = useToast();
  const [messages, setMessages] = useState<any[]>([]);
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const q = query(collection(db, `tournaments/${tournamentId}/matches/${match.id}/messages`), orderBy("timestamp", "asc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setMessages(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return () => unsubscribe();
  }, [tournamentId, match.id]);

  useEffect(() => {
      if (scrollAreaRef.current) {
          scrollAreaRef.current.scrollTo({ top: scrollAreaRef.current.scrollHeight });
      }
  }, [messages]);

  const handleSendMessage = async (message: string) => {
    if (!user || !userProfile) {
      toast({ variant: "destructive", title: "Error", description: "You must be logged in to chat." });
      return;
    }
    await postMatchMessage(
      tournamentId,
      match.id,
      user.uid,
      userProfile.username || user.email!,
      userProfile.photoURL || "",
      message
    );
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
                  <div key={msg.id} className={cn("flex items-end gap-2", isMe ? "flex-row-reverse" : "")}>
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

function TransferHostButton({ matchId, tournamentId }: { matchId: string, tournamentId: string }) {
    const { user } = useAuth();
    const { toast } = useToast();
    const [isLoading, setIsLoading] = useState(false);

    const handleTransfer = async () => {
        if (!user) return;
        setIsLoading(true);
        try {
            await transferHost(tournamentId, matchId, user.uid);
            toast({ title: "Host duties transferred." });
        } catch (error: any) {
            toast({ variant: "destructive", title: "Error", description: error.message });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <AlertDialog>
            <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 flex-1">
                    <ArrowRightLeft className="h-4 w-4 mr-2" />
                    Transfer Host
                </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Transfer Host?</AlertDialogTitle>
                    <AlertDialogDescription>
                        This will make your opponent the host for this match. They will be responsible for setting the room code.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleTransfer} disabled={isLoading}>
                        {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>}
                        Confirm
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}

const ChatInput = ({ onSendMessage }: { onSendMessage: (message: string) => Promise<void> }) => {
    const [message, setMessage] = useState("");
    const [isSending, setIsSending] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!message.trim()) return;
        
        setIsSending(true);
        try {
            await onSendMessage(message);
            setMessage("");
        } finally {
            setIsSending(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="flex gap-2 pt-4 border-t">
            <Input 
                value={message} 
                onChange={e => setMessage(e.target.value)}
                placeholder="Type your message..."
                disabled={isSending}
            />
            <Button type="submit" disabled={isSending || !message.trim()}>
                {isSending ? <Loader2 className="h-4 w-4 animate-spin"/> : <Send className="h-4 w-4" />}
            </Button>
        </form>
    );
};

/* ----------------------------- Main Card ----------------------------- */

function MatchCard({
  match,
  getTeam,
  userTeam,
  isOrganizer,
  tournament,
}: {
  match: Match;
  getTeam: (id: string) => Team | undefined;
  userTeam: Team;
  isOrganizer: boolean;
  tournament: Tournament;
}) {
  const { user } = useAuth();

  const homeTeam = getTeam(match.homeTeamId);
  const awayTeam = getTeam(match.awayTeamId);

  if (!homeTeam || !awayTeam || !user) return null;

  const matchDay = toDate(match.matchDay);
  const isMatchDay = isToday(matchDay);
  const isMatchLocked = isFuture(matchDay) && !isToday(matchDay);

  const isHomeCaptain = user.uid === homeTeam.captainId;
  const isAwayCaptain = user.uid === awayTeam.captainId;

  const hasReported = isHomeCaptain ? !!match.homeTeamReport : !!match.awayTeamReport;
  const canReport = (isHomeCaptain || isAwayCaptain) && !hasReported && isMatchDay && match.status === 'scheduled';
  
  const hostTeam = getTeam(match.hostId);
  const hostTeamName = hostTeam?.name || "N/A";
  const isHostCaptain = user.uid === hostTeam?.captainId;

  return (
    <Card className={cn("relative overflow-hidden", "hover:border-primary/20 transition-colors")}>
      <CardContent className="p-0">
        <Link href={`/tournaments/${tournament.id}/matches/${match.id}`} className="block hover:bg-muted/30 p-3 sm:p-4 space-y-3">
          {/* Header strip */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
                <MatchStatusBadge status={match.status} />
                {isMatchLocked && (
                  <Badge variant="outline" className="text-xs">
                    <Lock className="h-3 w-3 mr-1" />
                    Locked
                  </Badge>
                )}
                <Badge variant="outline" className="text-[10px] font-bold uppercase tracking-wider">
                  <Calendar className="h-3 w-3 mr-1" />
                  {format(toDate(match.matchDay), "MMM d, HH:mm")}
                </Badge>
              </div>
            <span className="text-xs text-muted-foreground font-semibold">{match.round}</span>
          </div>

          {/* Scoreboard */}
          <div className="grid grid-cols-[1fr_auto_1fr] gap-2 sm:gap-4 items-center">
            {/* Home Team */}
            <div className="flex items-center gap-2 min-w-0 justify-start">
              <Avatar className="h-8 w-8 sm:h-10 sm:w-10"><AvatarImage src={homeTeam.logoUrl} alt={homeTeam.name} /><AvatarFallback>{homeTeam.name?.[0]?.toUpperCase()}</AvatarFallback></Avatar>
              <div className="min-w-0"><p className="text-sm sm:text-base font-semibold truncate">{homeTeam.name}</p></div>
            </div>
            
            {/* Score / VS */}
            <div className="text-center">
                {(() => {
                    if (match.status === 'approved' && match.homeScore !== null && match.awayScore !== null) {
                    return <div className="text-xl sm:text-3xl font-black tabular-nums">{match.homeScore} <span className="opacity-30">-</span> {match.awayScore}</div>;
                    }
                    const report = match.homeTeamReport || match.awayTeamReport;
                    if ((match.status === 'awaiting_confirmation' || match.status === 'disputed') && report) {
                    return <div className="text-xl sm:text-3xl font-black tabular-nums">{report.homeScore} <span className="opacity-30">-</span> {report.awayScore}</div>;
                    }
                    return <div className="text-base sm:text-xl font-black text-muted-foreground uppercase tracking-widest">VS</div>;
                })()}
            </div>

            {/* Away Team */}
            <div className="flex items-center gap-2 min-w-0 justify-end text-right">
                <div className="min-w-0"><p className="text-sm sm:text-base font-semibold truncate text-right">{awayTeam.name}</p></div>
                <Avatar className="h-8 w-8 sm:h-10 sm:w-10"><AvatarImage src={awayTeam.logoUrl} alt={awayTeam.name} /><AvatarFallback>{awayTeam.name?.[0]?.toUpperCase()}</AvatarFallback></Avatar>
            </div>
          </div>
          <div className="text-xs text-muted-foreground text-center pt-2">Host: <strong>{hostTeamName}</strong></div>
        </Link>

        {/* Action Bar */}
        <div className="p-2 border-t bg-muted/20 flex flex-wrap gap-2 justify-end">
          <MatchChatDialog match={match} tournamentId={tournament.id} homeTeamName={homeTeam.name} awayTeamName={awayTeam.name} isMatchDay={isMatchDay} isOrganizer={isOrganizer}/>
          {isHostCaptain && <TransferHostButton matchId={match.id} tournamentId={tournament.id} />}
          <RoomCodeManager match={{ ...match, host: getTeam(match.hostId) } as any} isMatchDay={isMatchDay} tournamentId={tournament.id}/>
          {canReport && <ReportScoreDialog match={match} teamToReportFor={isHomeCaptain ? homeTeam : awayTeam} homeTeamName={homeTeam.name} awayTeamName={awayTeam.name} tournamentId={tournament.id}/>}
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
      setMatches(myMatches);
      matchesLoaded = true;
      checkDone();
    });

    const unsubTeams = onSnapshot(teamQuery, (snapshot) => {
      if (!active) return;
      const teamsData = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as Team);
      setTeams(teamsData);
      teamsLoaded = true;
      checkDone();
    }, () => {
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
    
    // Sort by round, then by date. This is the crucial fix.
    userMatches.sort((a, b) => {
        const roundRankA = getOverallRoundRank(a.round || '');
        const roundRankB = getOverallRoundRank(b.round || '');
        if (roundRankA !== roundRankB) {
            return roundRankA - roundRankB;
        }
        return toDate(a.matchDay).getTime() - toDate(b.matchDay).getTime();
    });

    if (showAllMatches) {
      return userMatches;
    }

    const now = new Date();
    
    // Find the index of the next match that isn't approved yet.
    const nextMatchIndex = userMatches.findIndex(m => m.status !== 'approved');

    if (nextMatchIndex === -1) {
      // All matches are completed, show the last 3.
      return userMatches.slice(-3);
    }
    
    // Get the next upcoming match
    const nextMatch = userMatches[nextMatchIndex];
    
    // Get up to 2 most recent completed matches before the next one
    const pastMatches = userMatches.slice(0, nextMatchIndex).slice(-2);

    let finalDisplay = [];
    if(nextMatch) finalDisplay.push(nextMatch);
    finalDisplay.unshift(...pastMatches);
    
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
                <MatchCard key={m.id} match={m} getTeam={getTeam} userTeam={userTeam} isOrganizer={isOrganizer} tournament={tournament} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

    

    