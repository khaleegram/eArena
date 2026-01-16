"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { db } from "@/lib/firebase";
import { collection, onSnapshot, query, orderBy } from "firebase/firestore";
import type {
  Match,
  Team,
  MatchStatus,
  TeamMatchStats,
  UnifiedTimestamp,
  ReplayRequest,
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
  transferHost,
  setMatchRoomCode,
  postMatchMessage,
  deleteMatchReport,
  submitSecondaryEvidence,
  getMatchPrediction,
  submitPlayerStreamUrl,
  requestPlayerReplay,
  respondToPlayerReplay,
  deleteMatchMessage,
  forfeitMatch,
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
  Sparkles,
  History,
  Tv,
  Video,
  BarChartHorizontal,
  MessageCircle,
  Calendar,
  ShieldCheck,
  Hourglass,
  Crown,
  Trophy,
  Zap,
} from "lucide-react";

import { format, formatDistanceToNow, isToday, isFuture, endOfDay, isPast } from "date-fns";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
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

/* ----------------------------- Utilities ----------------------------- */

const toDate = (timestamp: UnifiedTimestamp): Date => {
  if (typeof timestamp === "string") return new Date(timestamp);
  if (timestamp && typeof (timestamp as any).toDate === "function") return (timestamp as any).toDate();
  return timestamp as Date;
};

const EndOfMatchDay = (matchDay: UnifiedTimestamp) => {
  const d = new Date(toDate(matchDay));
  d.setHours(23, 59, 59, 999);
  return d;
};

/* ----------------------------- UI atoms ----------------------------- */

function MatchStatusBadge({ status }: { status: MatchStatus }) {
  const map: Record<
    MatchStatus,
    { label: string; icon: React.ReactNode; className?: string; variant?: "default" | "secondary" | "outline" | "destructive" }
  > = {
    scheduled: {
      label: "Scheduled",
      icon: <Clock className="h-3 w-3" />,
      variant: "outline",
      className: "bg-muted/40 text-muted-foreground border-border/60",
    },
    awaiting_confirmation: {
      label: "Reviewing",
      icon: <Hourglass className="h-3 w-3" />,
      variant: "outline",
      className: "border-amber-500/40 text-amber-500 bg-amber-500/10",
    },
    needs_secondary_evidence: {
      label: "Evidence Needed",
      icon: <AlertTriangle className="h-3 w-3" />,
      variant: "outline",
      className: "border-yellow-500/30 text-yellow-500 bg-yellow-500/10",
    },
    disputed: {
      label: "Disputed",
      icon: <ShieldCheck className="h-3 w-3" />,
      variant: "destructive",
    },
    approved: {
      label: "Final",
      icon: <CheckCircle className="h-3 w-3" />,
      variant: "default",
      className: "bg-green-600 hover:bg-green-600 text-white",
    },
  };

  const v = map[status] ?? map.scheduled;

  return (
    <Badge
      variant={v.variant ?? "outline"}
      className={cn("gap-1.5 px-2 py-0.5 uppercase text-[10px] font-bold tracking-wider", v.className)}
    >
      {v.icon}
      {v.label}
    </Badge>
  );
}

function MatchDayCountdown({ matchDay }: { matchDay: UnifiedTimestamp }) {
  const countdown = useCountdown(EndOfMatchDay(matchDay));
  if (countdown.isFinished) {
    return (
      <div className="text-xs font-semibold text-destructive flex items-center gap-2">
        <Timer className="h-4 w-4" />
        Match day ended. Awaiting automated resolution.
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border bg-primary/5 border-primary/15 px-3 py-2 text-xs">
      <div className="flex items-center gap-2 font-semibold text-primary">
        <Timer className="h-4 w-4 animate-pulse" />
        Reporting closes in
      </div>
      <div className="font-mono font-bold tabular-nums">
        {String(countdown.hours).padStart(2, "0")}:{String(countdown.minutes).padStart(2, "0")}:
        {String(countdown.seconds).padStart(2, "0")}
      </div>
    </div>
  );
}

function TeamChip({ team, isMine }: { team: Team; isMine: boolean }) {
  return (
    <div className={cn("flex items-center gap-2", isMine && "text-primary")}>
      <div className={cn("h-9 w-9 rounded-full grid place-items-center border bg-muted/30", isMine && "border-primary/30 bg-primary/10")}>
        <span className="font-black">{team.name?.charAt(0)?.toUpperCase()}</span>
      </div>
      <div className="min-w-0">
        <p className={cn("font-bold truncate", isMine && "text-primary")}>{team.name}</p>
        <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">
          {isMine ? "Your team" : "Opponent"}
        </p>
      </div>
    </div>
  );
}

/* ----------------------------- Chat ----------------------------- */

function ChatMessageDisplay({
  messages,
  currentUser,
  isOrganizer,
  tournamentId,
  matchId,
}: {
  messages: ChatMessage[];
  currentUser: UserProfile | null;
  isOrganizer: boolean;
  tournamentId: string;
  matchId: string;
}) {
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const { user } = useAuth();
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
      await deleteMatchMessage(tournamentId, matchId, messageId, user.uid);
      toast({ title: "Message Deleted ✅" });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    } finally {
      setIsDeleting(null);
    }
  };

  if (!messages.length) {
    return (
      <div className="py-14 text-center text-muted-foreground">
        <MessageCircle className="h-8 w-8 mx-auto opacity-30 mb-3" />
        <p className="text-sm">No messages yet. Talk like civilized people.</p>
        <p className="text-xs opacity-70 mt-1">Coordinate match time and room code.</p>
      </div>
    );
  }

  return (
    <ScrollArea className="h-[360px] w-full pr-3" ref={scrollAreaRef as any}>
      <div className="space-y-3 py-4">
        {messages.map((msg) => {
          const isMe = msg.userId === currentUser?.uid;
          return (
            <div key={msg.id} className={cn("flex items-end gap-2 group", isMe ? "flex-row-reverse" : "")}>
              <Avatar className="h-7 w-7 border">
                <AvatarImage src={msg.photoURL} alt={msg.username} />
                <AvatarFallback className="text-[10px]">{msg.username?.charAt(0)?.toUpperCase()}</AvatarFallback>
              </Avatar>

              <div
                className={cn(
                  "max-w-[80%] rounded-2xl px-3 py-2",
                  isMe ? "bg-primary text-primary-foreground rounded-br-none" : "bg-muted rounded-bl-none"
                )}
              >
                {!isMe && <p className="text-[10px] font-black uppercase tracking-wider opacity-60 mb-1">{msg.username}</p>}
                <p className="text-sm whitespace-pre-wrap leading-relaxed">{msg.message}</p>
                <p className="text-[9px] opacity-60 mt-1 text-right italic">
                  {msg.timestamp ? formatDistanceToNow(toDate(msg.timestamp), { addSuffix: true }) : "..."}
                </p>
              </div>

              {isOrganizer && !isMe && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                      disabled={isDeleting === msg.id}
                    >
                      {isDeleting === msg.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4 text-destructive" />}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete message?</AlertDialogTitle>
                      <AlertDialogDescription>This removes the message permanently.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={() => handleDelete(msg.id)} className="bg-destructive hover:bg-destructive/90">
                        Delete
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </div>
          );
        })}
      </div>
    </ScrollArea>
  );
}

function ChatInput({ onSendMessage }: { onSendMessage: (message: string) => Promise<void> }) {
  const [message, setMessage] = useState("");
  const [isSending, setIsSending] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() || isSending) return;
    setIsSending(true);
    try {
      await onSendMessage(message);
      setMessage("");
    } finally {
      setIsSending(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex gap-2 pt-3 border-t mt-auto">
      <Input
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="Message your opponent…"
        className="rounded-full bg-muted/50 border-none focus-visible:ring-1"
        disabled={isSending}
      />
      <Button type="submit" size="icon" className="rounded-full shrink-0" disabled={isSending || !message.trim()}>
        {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
      </Button>
    </form>
  );
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

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" disabled={!isMatchDay} className="h-8">
          <MessageCircle className="h-4 w-4 mr-2" />
          Chat 💬
          {messages.length > 0 && (
            <span className="ml-2 inline-flex h-5 min-w-[20px] px-1.5 items-center justify-center rounded-full bg-primary text-primary-foreground text-[10px] font-black">
              {messages.length}
            </span>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[520px] p-0 overflow-hidden gap-0">
        <DialogHeader className="p-4 border-b bg-muted/30">
          <DialogTitle className="text-sm font-black flex items-center gap-2">
            <MessageCircle className="h-4 w-4 text-primary" />
            {homeTeamName} vs {awayTeamName}
          </DialogTitle>
          <DialogDescription>Coordinate match time and room code here.</DialogDescription>
        </DialogHeader>
        <div className="px-4 flex flex-col h-[520px]">
          <ChatMessageDisplay
            messages={messages}
            currentUser={userProfile}
            isOrganizer={isOrganizer}
            tournamentId={match.tournamentId}
            matchId={match.id}
          />
          <ChatInput onSendMessage={handleSendMessage} />
          <div className="py-3 text-center">
            <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold opacity-60">
              keep it clean. organizer is watching 👀
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ----------------------------- Room Code ----------------------------- */

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

  // Preserve original logic: host can set on match day
  if (isHost) {
    return (
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm" disabled={!isMatchDay} className="h-8">
            {match.roomCode ? "Edit Code ✏️" : "Set Code 🔑"}
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
      <div className="flex items-center justify-between rounded-lg border bg-muted/30 px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Room</span>
          <span className="font-mono font-black tracking-widest">{match.roomCode}</span>
        </div>
        <Button variant="ghost" size="icon" onClick={handleCopy} className="h-8 w-8">
          {hasCopied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
        </Button>
      </div>
    );
  }

  return (
    <div className="text-xs text-muted-foreground italic">
      {!isMatchDay ? "Room code will appear on match day." : "Waiting for host to create room…"}
    </div>
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
      {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRightLeft className="h-4 w-4 mr-2" />}
      Transfer Host ↔️
    </Button>
  );
}

/* ----------------------------- Dialogs (logic preserved) ----------------------------- */

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
          Report Score 🧾
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

          <div className="space-y-2">
            <Label htmlFor="highlightUrl">Highlight URL (Optional)</Label>
            <Input id="highlightUrl" name="highlightUrl" type="url" placeholder="https://youtube.com/watch?v=..." />
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
          More Evidence 📸
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
          {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4 mr-2" />}
          Delete Report 🗑️
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

function MatchStatsDialog({ match, homeTeam, awayTeam }: { match: Match; homeTeam: Team; awayTeam: Team }) {
  const hasDetailedStats = match.homeTeamStats && Object.keys(match.homeTeamStats).length > 0;

  const statsMap: { label: string; key: keyof TeamMatchStats }[] = [
    { label: "Possession", key: "possession" },
    { label: "Shots", key: "shots" },
    { label: "Shots on Target", key: "shotsOnTarget" },
    { label: "Saves", key: "saves" },
    { label: "Passes", key: "passes" },
    { label: "Successful Passes", key: "successfulPasses" },
    { label: "Crosses", key: "crosses" },
    { label: "Interceptions", key: "interceptions" },
    { label: "Tackles", key: "tackles" },
    { label: "Corner Kicks", key: "cornerKicks" },
    { label: "Free Kicks", key: "freeKicks" },
    { label: "Fouls", key: "fouls" },
    { label: "Offsides", key: "offsides" },
  ];

  const formatValue = (key: keyof TeamMatchStats, value: number | undefined) => {
    if (value === undefined) return "—";
    return key === "possession" ? `${value}%` : String(value);
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="h-8">
          <BarChartHorizontal className="mr-2 h-4 w-4" />
          Stats 📊
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Match Statistics 📊</DialogTitle>
          <DialogDescription>
            {homeTeam.name} vs {awayTeam.name}
          </DialogDescription>
        </DialogHeader>

        {hasDetailedStats ? (
          <div className="space-y-2">
            {statsMap.map((stat) => (
              <div key={stat.key} className="rounded-lg border bg-muted/20 px-3 py-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-black w-1/4 text-left">{formatValue(stat.key, match.homeTeamStats?.[stat.key])}</span>
                  <span className="text-muted-foreground w-1/2 text-center text-xs font-bold uppercase tracking-wider">{stat.label}</span>
                  <span className="font-black w-1/4 text-right">{formatValue(stat.key, match.awayTeamStats?.[stat.key])}</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground text-center py-10">No detailed stats were recorded for this match.</p>
        )}
      </DialogContent>
    </Dialog>
  );
}

function SetPlayerStreamUrlDialog({ match, userTeam }: { match: Match; userTeam: Team | null }) {
  const { user, userProfile } = useAuth();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  if (!user || !userTeam) return null;
  const isInMatch = match.homeTeamId === userTeam.id || match.awayTeamId === userTeam.id;
  if (!isInMatch) return null;

  const handleSave = async () => {
    if (!user || !userProfile) return;
    setIsLoading(true);
    try {
      await submitPlayerStreamUrl(match.tournamentId, match.id, user.uid, userProfile.username || "Player", url);
      toast({ title: "Stream added ✅", description: "Others can now watch you." });
      setOpen(false);
      setUrl("");
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="h-8">
          <Tv className="mr-2 h-4 w-4" />
          Add Stream 🎥
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add your live stream 🎥</DialogTitle>
          <DialogDescription>Paste your Twitch/YouTube link.</DialogDescription>
        </DialogHeader>
        <div className="py-4 space-y-2">
          <Label htmlFor="stream-url">Stream URL</Label>
          <Input id="stream-url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://twitch.tv/..." />
        </div>
        <DialogFooter>
          <Button onClick={handleSave} disabled={isLoading || !url}>
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
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
  isHero = false,
}: {
  match: Match;
  teams: Team[];
  getTeam: (id: string) => Team | undefined;
  userTeam: Team | null;
  isOrganizer: boolean;
  isHero?: boolean;
}) {
  const { user } = useAuth();
  const { toast } = useToast();

  const homeTeam = getTeam(match.homeTeamId);
  const awayTeam = getTeam(match.awayTeamId);

  const [prediction, setPrediction] = useState<{ predictedWinnerName: string; confidence: number; reasoning: string } | null>(null);
  const [isPredicting, setIsPredicting] = useState(false);

  if (!homeTeam || !awayTeam || !userTeam || !user) return null;

  const isMatchDay = isToday(toDate(match.matchDay));
  const isPastMatchDay = isPast(endOfDay(toDate(match.matchDay)));

  const isHomeCaptain = user.uid === homeTeam.captainId;
  const isAwayCaptain = user.uid === awayTeam.captainId;

  const hasHomeReported = !!match.homeTeamReport;
  const hasAwayReported = !!match.awayTeamReport;
  const hasHomeSecondaryReported = !!match.homeTeamSecondaryReport;
  const hasAwaySecondaryReported = !!match.awayTeamSecondaryReport;

  const canHomeReport = isHomeCaptain && !hasHomeReported && isMatchDay;
  const canAwayReport = isAwayCaptain && !hasAwayReported && isMatchDay;

  const showReportButton =
    (canHomeReport || canAwayReport) &&
    match.status !== "approved" &&
    match.status !== "disputed" &&
    match.status !== "needs_secondary_evidence";

  const canHomeDelete = isHomeCaptain && hasHomeReported && match.status === "awaiting_confirmation";
  const canAwayDelete = isAwayCaptain && hasAwayReported && match.status === "awaiting_confirmation";

  const canSubmitSecondaryHome = isHomeCaptain && !hasHomeSecondaryReported && isMatchDay;
  const canSubmitSecondaryAway = isAwayCaptain && !hasAwaySecondaryReported && isMatchDay;
  const showSecondaryButton = match.status === "needs_secondary_evidence" && (canSubmitSecondaryHome || canSubmitSecondaryAway);

  const hostTeamName = getTeam(match.hostId)?.name || "N/A";
  const isHostCaptain = user.uid === getTeam(match.hostId)?.captainId;

  const replayRequest: ReplayRequest | undefined = (match as any).replayRequest;
  const isMyTeam = userTeam.id === homeTeam.id || userTeam.id === awayTeam.id;
  const canRequestReplay = isMyTeam && !replayRequest && match.status === "scheduled";
  const opponentId = user.uid === homeTeam.captainId ? awayTeam.captainId : homeTeam.captainId;
  const canRespondToReplay = user.uid === opponentId && replayRequest?.status === "pending";

  const canForfeit = (isHomeCaptain || isAwayCaptain) && isMatchDay && match.status === "scheduled";

  const handleGetPrediction = async () => {
    setIsPredicting(true);
    try {
      const result = await getMatchPrediction(match.id, match.tournamentId);
      setPrediction(result);
    } catch (error: any) {
      toast({ variant: "destructive", title: "Prediction Failed", description: error.message });
    } finally {
      setIsPredicting(false);
    }
  };

  return (
    <Card
      className={cn(
        "relative overflow-hidden",
        isHero ? "border-2 border-primary/25 bg-primary/5" : "hover:border-primary/20 transition-colors"
      )}
    >
      {/* Header strip */}
      <div className={cn("px-4 py-2 border-b flex items-center justify-between", isHero ? "bg-primary/10" : "bg-muted/20")}>
        <div className="flex items-center gap-2">
          <MatchStatusBadge status={match.status} />
          <Badge variant="outline" className="text-[10px] font-bold uppercase tracking-wider">
            <Calendar className="h-3 w-3 mr-1" />
            {format(toDate(match.matchDay), "MMM d")}
          </Badge>
          <span className="text-xs text-muted-foreground font-semibold">{match.round}</span>
        </div>

        <div className="flex items-center gap-2">
          {showReportButton && (
            <ReportScoreDialog
              match={match}
              teamToReportFor={canHomeReport ? homeTeam : awayTeam}
              homeTeamName={homeTeam.name}
              awayTeamName={awayTeam.name}
            />
          )}
          {showSecondaryButton && (
            <SubmitSecondaryEvidenceDialog match={match} teamToReportFor={canSubmitSecondaryHome ? homeTeam : awayTeam} />
          )}
          {(canHomeDelete || canAwayDelete) && <DeleteReportButton match={match} userId={user.uid} />}
        </div>
      </div>

      <CardContent className="p-4 space-y-4">
        {/* Scoreboard */}
        <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-4 items-center">
          <TeamChip team={homeTeam} isMine={userTeam.id === homeTeam.id} />

          <div className="flex justify-center">
            <div className="rounded-xl border bg-muted/30 px-5 py-3 min-w-[120px] text-center">
              {match.status === "approved" ? (
                <div className="text-3xl font-black tabular-nums">
                  {match.homeScore} <span className="opacity-30">-</span> {match.awayScore}
                </div>
              ) : (
                <div className="flex items-center justify-center gap-2">
                  <Swords className="h-5 w-5 opacity-60" />
                  <span className="text-xs font-black uppercase tracking-widest opacity-70">VS</span>
                </div>
              )}
              <div className="mt-2 text-[11px] text-muted-foreground font-semibold">
                {format(toDate(match.matchDay), "EEE, h:mm a")}
              </div>
            </div>
          </div>

          <div className="md:justify-self-end">
            <TeamChip team={awayTeam} isMine={userTeam.id === awayTeam.id} />
          </div>
        </div>

        {/* Host + room */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="rounded-xl border bg-muted/20 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-black uppercase tracking-widest text-muted-foreground">Host</p>
              {isHostCaptain && match.status === "scheduled" && isMatchDay && (
                <TransferHostButton matchId={match.id} tournamentId={match.tournamentId} />
              )}
            </div>
            <p className="font-bold">{hostTeamName}</p>
            {match.hostTransferRequested && (
              <Alert className="text-xs">
                <ArrowRightLeft className="h-4 w-4" />
                <AlertTitle>Host Transfer</AlertTitle>
                <AlertDescription>
                  {isHostCaptain ? "You are now host. Create the room." : "Host transfer requested. Watch for room update."}
                </AlertDescription>
              </Alert>
            )}
          </div>

          <div className="rounded-xl border bg-muted/20 p-3 space-y-2">
            <p className="text-xs font-black uppercase tracking-widest text-muted-foreground">Room Code</p>
            <RoomCodeManager match={{ ...match, host: getTeam(match.hostId) } as any} isMatchDay={isMatchDay} />
          </div>
        </div>

        {/* Reports state */}
        {(hasHomeReported || hasAwayReported) && (
          <div className="flex flex-wrap gap-3 items-center rounded-xl border bg-muted/10 p-3 text-xs">
            <span className="font-bold text-muted-foreground uppercase tracking-wider">Reports</span>
            <span>Home: {hasHomeReported ? "✅" : "❌"}</span>
            <span>Away: {hasAwayReported ? "✅" : "❌"}</span>
          </div>
        )}

        {/* Streams */}
        <div className="rounded-xl border bg-muted/10 p-3 space-y-2">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <Tv className="h-4 w-4 text-primary" />
              <span className="font-bold">Live Streams 🎥</span>
            </div>
            <SetPlayerStreamUrlDialog match={match} userTeam={userTeam} />
          </div>

          <div className="flex flex-wrap gap-2">
            {match.streamLinks &&
              Object.entries(match.streamLinks).map(([key, link]) => (
                <Button asChild size="sm" key={key} variant={key === "organizer" ? "default" : "secondary"} className="h-8">
                  <a href={link.url} target="_blank" rel="noopener noreferrer">
                    <Tv className="h-4 w-4 mr-2" />
                    Watch {link.username}
                  </a>
                </Button>
              ))}

            {!match.streamLinks || Object.keys(match.streamLinks).length === 0 ? (
              <p className="text-xs text-muted-foreground italic">No streams yet.</p>
            ) : null}
          </div>
        </div>

        {/* Highlights + stats + chat */}
        <div className="flex flex-wrap gap-2 justify-end">
          {match.highlightUrl ? (
            <a href={match.highlightUrl} target="_blank" rel="noopener noreferrer">
              <Button variant="outline" size="sm" className="h-8">
                <Video className="h-4 w-4 mr-2" />
                Highlight 🎬
              </Button>
            </a>
          ) : null}
          {match.status === "approved" ? <MatchStatsDialog match={match} homeTeam={homeTeam} awayTeam={awayTeam} /> : null}
          <MatchChatDialog
            match={match}
            homeTeamName={homeTeam.name}
            awayTeamName={awayTeam.name}
            isMatchDay={isMatchDay}
            isOrganizer={isOrganizer}
          />
        </div>

        {/* AI prediction */}
        {match.status === "scheduled" && (
          <div className="rounded-xl border bg-muted/10 p-3 space-y-2">
            {!prediction ? (
              <Button variant="outline" size="sm" onClick={handleGetPrediction} disabled={isPredicting} className="w-full h-9">
                {isPredicting ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4 mr-2 text-yellow-500" />
                )}
                Get AI Prediction ✨
              </Button>
            ) : (
              <Alert className="text-xs">
                <Sparkles className="h-4 w-4" />
                <AlertTitle>AI Prediction</AlertTitle>
                <AlertDescription>
                  <strong>Winner:</strong> {prediction.predictedWinnerName} ({prediction.confidence}%)
                  <br />
                  <span className="italic">"{prediction.reasoning}"</span>
                </AlertDescription>
              </Alert>
            )}
          </div>
        )}

        {/* Replay request UI (preserved) */}
        {replayRequest ? (
          <Alert className="text-xs" variant={replayRequest.status === "accepted" ? "default" : "destructive"}>
            <HandshakeIcon />
            <AlertTitle>Replay Request: {replayRequest.status}</AlertTitle>
            <AlertDescription>Reason: {replayRequest.reason}</AlertDescription>
          </Alert>
        ) : null}

        <div className="flex flex-wrap justify-end gap-2">
          {canForfeit ? <ForfeitMatchDialog match={match} forfeitingTeamName={isHomeCaptain ? homeTeam.name : awayTeam.name} /> : null}
          {canRequestReplay ? <RequestReplayDialog match={match} /> : null}
          {canRespondToReplay ? <RespondToReplayDialog match={match} /> : null}
        </div>

        {/* Match day countdown and locks */}
        {isMatchDay && match.status !== "approved" ? <MatchDayCountdown matchDay={match.matchDay} /> : null}

        {!isMatchDay && !isPastMatchDay ? (
          <Alert variant="default" className="text-xs">
            <Info className="h-4 w-4" />
            <AlertTitle className="font-semibold">Match Locked 🔒</AlertTitle>
            <AlertDescription>You can interact on match day: {format(toDate(match.matchDay), "PPP")}.</AlertDescription>
          </Alert>
        ) : null}

        {match.resolutionNotes ? (
          <Alert variant="default" className="text-xs">
            <ShieldCheck className="h-4 w-4" />
            <AlertTitle className="font-semibold">Organizer Verdict ⚖️</AlertTitle>
            <AlertDescription>{match.resolutionNotes}</AlertDescription>
          </Alert>
        ) : null}
      </CardContent>
    </Card>
  );
}

function HandshakeIcon() {
  // Lucide doesn't have handshake in your reduced imports here, keep it lightweight.
  return <History className="h-4 w-4" />;
}

/* ----------------------------- Main Tab ----------------------------- */

export function MyMatchesTab({ tournament, isOrganizer, userTeam }: { tournament: Tournament; isOrganizer: boolean; userTeam: Team | null }) {
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

  const nextMatch = useMemo(() => {
    if (!userTeam || !matches.length) return null;

    const now = new Date();
    const upcomingMatches = matches
      .filter((m) => {
        const d = toDate(m.matchDay);
        const isUpcoming = isFuture(d) || (isToday(d) && d >= now);
        const notCompleted = m.status !== "approved" || (m.homeScore === null && m.awayScore === null);
        return isUpcoming && notCompleted;
      })
      .sort((a, b) => toDate(a.matchDay).getTime() - toDate(b.matchDay).getTime());

    return upcomingMatches[0] || null;
  }, [matches, userTeam]);

  const displayedMatches = useMemo(() => {
    if (!userTeam) return [];

    const userMatches = matches.filter((m) => m.homeTeamId === userTeam.id || m.awayTeamId === userTeam.id);

    if (showAllMatches) {
      return userMatches.sort((a, b) => toDate(b.matchDay).getTime() - toDate(a.matchDay).getTime());
    }

    const completed = userMatches
      .filter((m) => {
        if (nextMatch && m.id === nextMatch.id) return false;
        return m.status === "approved" || m.status === "disputed" || m.status === "awaiting_confirmation" || m.status === "needs_secondary_evidence";
      })
      .sort((a, b) => toDate(b.matchDay).getTime() - toDate(a.matchDay).getTime())
      .slice(0, 2);

    return completed;
  }, [matches, userTeam, nextMatch, showAllMatches]);

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
      {/* Hero Next match */}
      {nextMatch && !showAllMatches && (() => {
        const homeTeam = getTeam(nextMatch.homeTeamId);
        const awayTeam = getTeam(nextMatch.awayTeamId);
        if (!homeTeam || !awayTeam) return null;

        const title =
          nextMatch.homeTeamId === userTeam.id
            ? `🟣 Next: ${userTeam.name} vs ${awayTeam.name}`
            : `🟣 Next: ${homeTeam.name} vs ${userTeam.name}`;

        return (
          <Card className="border-2 border-primary/20 bg-primary/5">
            <CardHeader>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <Badge className="mb-2">Next Match</Badge>
                  <CardTitle className="text-xl">{title}</CardTitle>
                  <CardDescription className="mt-2">
                    <Calendar className="inline h-4 w-4 mr-1" />
                    {format(toDate(nextMatch.matchDay), "EEEE, MMMM d 'at' h:mm a")}
                  </CardDescription>
                </div>

                <div className="hidden md:flex items-center gap-2">
                  <Badge variant="outline" className="font-bold">
                    <Trophy className="h-3 w-3 mr-1" />
                    {tournament.name}
                  </Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <MatchCard match={nextMatch} teams={teams} getTeam={getTeam} userTeam={userTeam} isOrganizer={isOrganizer} isHero />
            </CardContent>
          </Card>
        );
      })()}

      {/* Recent/All */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Zap className="h-5 w-5 text-primary" />
                {showAllMatches ? "📅 All Your Matches" : "🧾 Recent Matches"}
              </CardTitle>
              <CardDescription>Manage reporting, chats, streams, replays and evidence.</CardDescription>
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
