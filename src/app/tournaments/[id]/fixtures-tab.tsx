"use client";

import { useState, useEffect } from "react";
import { db } from "@/lib/firebase";
import { collection, onSnapshot, query, orderBy } from "firebase/firestore";

import type {
  Match,
  Team,
  MatchStatus,
  MatchReport,
  TeamMatchStats,
  UnifiedTimestamp,
  Tournament,
} from "@/lib/types";

import {
  approveMatchResult,
  scheduleRematch,
  setOrganizerStreamUrl,
  getMatchPrediction,
  organizerForceReplay,
  organizerApproveReplay,
  organizerExtendLeagueDeadline,
} from "@/lib/actions";

import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";

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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ScrollArea } from "@/components/ui/scroll-area";

import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription as DialogDesc,
  DialogFooter,
  DialogHeader,
  DialogTitle as DialogT,
  DialogTrigger,
} from "@/components/ui/dialog";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter as AlertDialogF,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../../components/ui/select";

import Image from "next/image";

import {
  Loader2,
  CheckCircle,
  Clock,
  AlertTriangle,
  User,
  MessageSquareQuote,
  FileText,
  BarChartHorizontal,
  Video,
  Tv,
  Sparkles,
  History,
  Timer,
  Bot,
  Calendar,
} from "lucide-react";

import { format, isPast, endOfDay } from "date-fns";

import Link from "next/link";
import { Bracket } from "@/components/bracket";

/* =========================
   Utils
========================= */
const toDate = (timestamp: UnifiedTimestamp): Date => {
  if (typeof timestamp === "string") return new Date(timestamp);
  if (timestamp && typeof (timestamp as any).toDate === "function")
    return (timestamp as any).toDate();
  return timestamp as Date;
};

/* =========================
   Reports (used in dispute dialog)
========================= */
const ReportCard = ({
  title,
  primaryReport,
  secondaryReport,
}: {
  title: string;
  primaryReport?: MatchReport;
  secondaryReport?: MatchReport;
}) => (
  <Card className="rounded-2xl">
    <CardHeader>
      <CardTitle className="text-base flex items-center gap-2">
        <MessageSquareQuote className="h-4 w-4 text-muted-foreground" />
        {title}
      </CardTitle>
    </CardHeader>
    <CardContent className="space-y-4">
      {primaryReport ? (
        <>
          <p className="text-sm text-muted-foreground">Primary Report (Match Stats)</p>
          <p className="text-2xl font-black text-center">
            {primaryReport.homeScore} - {primaryReport.awayScore}
          </p>
          {primaryReport.evidenceUrl ? (
            <div className="relative aspect-video w-full overflow-hidden rounded-xl border bg-muted/20">
              <Image
                src={primaryReport.evidenceUrl}
                alt={`Evidence for ${title}`}
                fill
                style={{ objectFit: "contain" }}
                className="rounded-xl"
                unoptimized
              />
            </div>
          ) : (
            <p className="text-sm text-center text-muted-foreground">No evidence provided.</p>
          )}
        </>
      ) : (
        <p className="text-sm text-center text-muted-foreground py-8">
          No primary report submitted.
        </p>
      )}

      <Separator />

      {secondaryReport ? (
        <>
          <p className="text-sm text-muted-foreground">Secondary Report (Match History)</p>
          {secondaryReport.evidenceUrl ? (
            <div className="relative aspect-video w-full overflow-hidden rounded-xl border bg-muted/20">
              <Image
                src={secondaryReport.evidenceUrl}
                alt={`Secondary evidence for ${title}`}
                fill
                style={{ objectFit: "contain" }}
                className="rounded-xl"
                unoptimized
              />
            </div>
          ) : (
            <p className="text-sm text-center text-muted-foreground">No secondary report submitted.</p>
          )}
        </>
      ) : (
        <p className="text-sm text-center text-muted-foreground py-4">
          No secondary report submitted.
        </p>
      )}
    </CardContent>
  </Card>
);

/* =========================
   Dialogs (logic preserved)
========================= */
function ResolveDisputeDialog({
  match,
  homeTeam,
  awayTeam,
}: {
  match: Match;
  homeTeam: Team;
  awayTeam: Team;
}) {
  const [open, setOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  const [homeScore, setHomeScore] = useState<number | "">("");
  const [awayScore, setAwayScore] = useState<number | "">("");
  const [notes, setNotes] = useState("");
  const [rematchNotes, setRematchNotes] = useState("");

  const handleResolve = async () => {
    if (homeScore === "" || awayScore === "") {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Please enter the final scores for both teams.",
      });
      return;
    }
    setIsSubmitting(true);
    try {
      await approveMatchResult(
        match.tournamentId,
        match.id,
        Number(homeScore),
        Number(awayScore),
        `Organizer: ${notes}`,
        true
      );
      toast({
        title: "Dispute Resolved",
        description: "The match result has been approved and standings will update.",
      });
      setOpen(false);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to resolve dispute.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRematch = async () => {
    if (!rematchNotes.trim()) {
      toast({
        variant: "destructive",
        title: "Notes Required",
        description: "Please provide a reason for the rematch.",
      });
      return;
    }
    setIsSubmitting(true);
    try {
      await scheduleRematch(match.tournamentId, match.id, `Organizer: ${rematchNotes}`);
      toast({
        title: "Rematch Scheduled",
        description: "The teams have been notified to play again.",
      });
      setOpen(false);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to schedule rematch.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="destructive">
          <AlertTriangle className="mr-2 h-4 w-4" />
          Resolve
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogT>Resolve Disputed Match</DialogT>
          <DialogDesc>
            Review the conflicting reports. You can either set the final score manually or
            order a rematch.
          </DialogDesc>
        </DialogHeader>

        <ScrollArea className="max-h-[70vh] pr-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 my-4">
            <ReportCard
              title={`${homeTeam.name}'s Report`}
              primaryReport={match.homeTeamReport}
              secondaryReport={match.homeTeamSecondaryReport}
            />
            <ReportCard
              title={`${awayTeam.name}'s Report`}
              primaryReport={match.awayTeamReport}
              secondaryReport={match.awayTeamSecondaryReport}
            />
          </div>

          <Separator className="my-6" />

          <div>
            <h4 className="font-semibold mb-2">Option 1: Set Final Score</h4>
            <div className="grid md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="finalHomeScore">{homeTeam.name} Final Score</Label>
                <Input
                  id="finalHomeScore"
                  type="number"
                  value={homeScore}
                  onChange={(e) => setHomeScore(e.target.value === "" ? "" : Number(e.target.value))}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="finalAwayScore">{awayTeam.name} Final Score</Label>
                <Input
                  id="finalAwayScore"
                  type="number"
                  value={awayScore}
                  onChange={(e) => setAwayScore(e.target.value === "" ? "" : Number(e.target.value))}
                  required
                />
              </div>

              <div className="space-y-2 md:col-span-3">
                <Label htmlFor="notes">Organizer's Verdict & Notes</Label>
                <Textarea
                  id="notes"
                  placeholder="Explain your decision. Visible to both teams."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
            </div>

            <Button onClick={handleResolve} disabled={isSubmitting} className="mt-4">
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Approve & Finalize Score
            </Button>
          </div>

          <Separator className="my-6" />

          <div>
            <h4 className="font-semibold mb-2">Option 2: Order a Rematch</h4>
            <div className="space-y-2">
              <Label htmlFor="rematchNotes">Reason for Rematch</Label>
              <Textarea
                id="rematchNotes"
                placeholder="Explain why a rematch is necessary."
                value={rematchNotes}
                onChange={(e) => setRematchNotes(e.target.value)}
              />
            </div>

            <Button onClick={handleRematch} variant="secondary" disabled={isSubmitting} className="mt-4">
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Schedule Rematch
            </Button>
          </div>
        </ScrollArea>

        <DialogFooter className="mt-4 border-t pt-4">
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ForceReplayDialog({ match, organizerId }: { match: Match; organizerId: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  const handleForceReplay = async () => {
    if (!reason.trim()) {
      toast({
        variant: "destructive",
        title: "Reason Required",
        description: "Please provide a reason for ordering a replay.",
      });
      return;
    }
    setIsSubmitting(true);
    try {
      await organizerForceReplay(match.tournamentId, match.id, organizerId, reason);
      toast({ title: "Replay Ordered", description: "The match has been reset and players notified." });
      setOpen(false);
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message || "Failed to order replay." });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="text-xs">
          <History className="mr-1 h-3 w-3" />
          Force Replay
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogT>Force Match Replay</DialogT>
          <DialogDesc>
            This will revert the current result, player stats, and standings for this match and schedule a new one.
          </DialogDesc>
        </DialogHeader>
        <div className="py-4 space-y-2">
          <Label htmlFor="reason">Reason</Label>
          <Textarea
            id="reason"
            placeholder="Explain why replay is needed."
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>
        <DialogFooter>
          <Button variant="destructive" onClick={handleForceReplay} disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Confirm & Order Replay
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function OrganizerApproveReplayButton({ match, organizerId }: { match: Match; organizerId: string }) {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);

  const handleApprove = async () => {
    setIsLoading(true);
    try {
      await organizerApproveReplay(match.tournamentId, match.id, organizerId, true);
      toast({ title: "Replay Approved", description: "The match has been rescheduled." });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    } finally {
      setIsLoading(false);
    }
  };

  const handleReject = async () => {
    setIsLoading(true);
    try {
      await organizerApproveReplay(match.tournamentId, match.id, organizerId, false);
      toast({ title: "Replay Rejected", description: "The original match result stands." });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex gap-2 flex-wrap">
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button size="sm" variant="secondary" disabled={isLoading}>
            <CheckCircle className="mr-2 h-4 w-4" />
            Approve Replay
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Approve Replay Request?</AlertDialogTitle>
            <AlertDialogDescription>
              Approving will reset this match and schedule it again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogF>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleApprove}>Approve</AlertDialogAction>
          </AlertDialogF>
        </AlertDialogContent>
      </AlertDialog>

      <Button size="sm" variant="destructive" onClick={handleReject} disabled={isLoading}>
        Reject
      </Button>
    </div>
  );
}

function ExtendDeadlineDialog({
  match,
  organizerId,
  tournamentId,
}: {
  match: Match;
  organizerId: string;
  tournamentId: string;
}) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [hours, setHours] = useState(24);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleExtend = async () => {
    setIsSubmitting(true);
    try {
      await organizerExtendLeagueDeadline(tournamentId, match.id, organizerId, hours);
      toast({ title: "Success!", description: `Deadline extended by ${hours} hours.` });
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
        <Button size="sm" variant="outline" className="text-xs">
          <Timer className="mr-1 h-3 w-3" />
          Extend Deadline
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogT>Extend Match Deadline</DialogT>
          <DialogDesc>Give players more time to complete this league match.</DialogDesc>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Extension Duration</Label>
            <Select onValueChange={(val) => setHours(Number(val))} defaultValue={String(hours)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="2">2 Hours</SelectItem>
                <SelectItem value="8">8 Hours</SelectItem>
                <SelectItem value="24">1 Day</SelectItem>
                <SelectItem value="48">2 Days</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button onClick={handleExtend} disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Confirm Extension
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SetOrganizerStreamUrlDialog({
  matchId,
  tournamentId,
  organizerId,
}: {
  matchId: string;
  tournamentId: string;
  organizerId: string;
}) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const handleSave = async () => {
    setIsLoading(true);
    try {
      await setOrganizerStreamUrl(tournamentId, matchId, url, organizerId);
      toast({ title: "Success", description: "Official stream URL has been set for this match." });
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
        <Button variant="outline" size="sm" className="text-xs">
          <Tv className="mr-2 h-3 w-3" />
          Set Stream
        </Button>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogT>Add Official Live Stream URL</DialogT>
          <DialogDesc>Link a Twitch or YouTube stream for this match.</DialogDesc>
        </DialogHeader>
        <div className="py-4 space-y-2">
          <Label htmlFor="stream-url">Stream URL</Label>
          <Input
            id="stream-url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://youtube.com/..."
          />
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

  const formatValue = (key: keyof TeamMatchStats, value?: number) => {
    if (value === undefined) return "N/A";
    return key === "possession" ? `${value}%` : String(value);
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <BarChartHorizontal className="mr-2 h-4 w-4" />
          View Stats
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogT>Match Statistics</DialogT>
          <DialogDesc>
            {homeTeam.name} vs {awayTeam.name}
          </DialogDesc>
        </DialogHeader>

        {hasDetailedStats ? (
          <div className="space-y-2">
            {statsMap.map((stat) => (
              <div key={stat.key} className="flex items-center justify-between text-sm">
                <span className="font-bold w-1/4 text-left">{formatValue(stat.key, match.homeTeamStats?.[stat.key])}</span>
                <span className="text-muted-foreground w-1/2 text-center">{stat.label}</span>
                <span className="font-bold w-1/4 text-right">{formatValue(stat.key, match.awayTeamStats?.[stat.key])}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground text-center py-8">No detailed stats were recorded for this match.</p>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* =========================
   Badges
========================= */
const MatchStatusBadge = ({ status }: { status: MatchStatus }) => {
  const statusInfo: Record<
    MatchStatus,
    { icon: JSX.Element; label: string; variant?: "secondary" | "destructive" | "outline"; className?: string }
  > = {
    scheduled: { icon: <Clock className="h-3 w-3 mr-1" />, label: "Scheduled", variant: "secondary" },
    awaiting_confirmation: {
      icon: <Clock className="h-3 w-3 mr-1" />,
      label: "Awaiting Confirmation",
      className: "text-amber-500 border-amber-500/50",
    },
    needs_secondary_evidence: {
      icon: <AlertTriangle className="h-3 w-3 mr-1" />,
      label: "Needs Evidence",
      className: "text-yellow-500 border-yellow-500/50",
    },
    disputed: { icon: <AlertTriangle className="h-3 w-3 mr-1" />, label: "Disputed", variant: "destructive" },
    approved: {
      icon: <CheckCircle className="h-3 w-3 mr-1" />,
      label: "Approved",
      className: "bg-green-600/80 text-primary-foreground border-transparent",
    },
  };

  const current = statusInfo[status] || statusInfo.scheduled;

  return (
    <Badge variant={current.variant || "outline"} className={current.className}>
      {current.icon}
      {current.label}
    </Badge>
  );
};

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
      <Card className="rounded-2xl overflow-hidden bg-card/60 hover:bg-card hover:shadow-lg transition-all cursor-pointer">
        <CardContent className="p-4 space-y-3">
          {/* Team vs Team */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <Avatar className="h-7 w-7">
                <AvatarImage src={homeTeam.logoUrl} alt={homeTeam.name} />
                <AvatarFallback><User /></AvatarFallback>
              </Avatar>
              <span className="text-sm font-semibold truncate">{homeTeam.name}</span>
            </div>

            <div className="text-sm font-black">
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

          {/* Status, Date, Indicators */}
          <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
            <div className="flex items-center gap-2 flex-wrap">
              <MatchStatusBadge status={match.status} />
              <Badge variant="outline">
                <Calendar className="h-3 w-3 mr-1" />
                {format(toDate(match.matchDay), "MMM d, HH:mm")}
              </Badge>
            </div>

            <div className="flex items-center gap-1">
              {match.streamLinks && <Video className="h-4 w-4 text-primary" />}
              {match.summary && <Sparkles className="h-4 w-4 text-yellow-400" />}
            </div>
          </div>

          {/* View Button */}
          <Button size="sm" variant="secondary" className="w-full" onClick={(e) => e.preventDefault()}>
            → View Match Details
          </Button>
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

    const matchQuery = query(collection(db, `tournaments/${tournament.id}/matches`), orderBy("round", "asc"));
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

  const isGroupRound = (round?: string) => typeof round === "string" && /^group\s+[a-z]$/i.test(round.trim());
  const isKnockoutRound = (round?: string) => {
    if (typeof round !== "string") return false;
    const r = round.trim().toLowerCase();
    return r === "final" || r === "semi-finals" || r === "quarter-finals" || /^round of \d+$/i.test(round.trim());
  };

  const groupMatches = matches.filter((m) => isGroupRound(m.round));
  const knockoutMatches = matches.filter((m) => isKnockoutRound(m.round));

  const hasGroupStage = groupMatches.length > 0;
  const hasKnockout = knockoutMatches.length > 0;

  const isCupStyle = tournament.format === "cup";
  const showBracket = tournament.format === "double-elimination" || (isCupStyle && hasKnockout);

  const groupedMatches = matches.reduce((acc, match) => {
    const round = match.round || "Uncategorized";
    if (!acc[round]) acc[round] = [];
    acc[round].push(match);
    return acc;
  }, {} as Record<string, Match[]>);

  return (
    <Card className="rounded-2xl">
      <CardHeader>
        <CardTitle className="font-headline">Full Schedule</CardTitle>
        <CardDescription>The complete list of all matches in the tournament.</CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {loading ? (
          <div className="flex justify-center items-center h-40">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : matches.length === 0 ? (
          <p className="text-muted-foreground text-center py-8">Fixtures have not been generated yet.</p>
        ) : showBracket ? (
          <div className="space-y-8">
            {isCupStyle && hasGroupStage && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-semibold font-headline">Group Stage</h3>
                  <p className="text-sm text-muted-foreground">Group matches and results.</p>
                </div>

                <div className="space-y-6">
                  {Object.entries(groupedMatches)
                    .filter(([round]) => isGroupRound(round))
                    .map(([round, roundMatches]) => (
                      <div key={round} className="space-y-2">
                        <h4 className="text-base font-semibold font-headline">{round}</h4>
                        <div className="grid gap-3">
                          {roundMatches.map((match) => (
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
              </div>
            )}

            <div className="space-y-3">
              <div>
                <h3 className="text-lg font-semibold font-headline">{isCupStyle ? "Knockout Bracket" : "Bracket"}</h3>
                <p className="text-sm text-muted-foreground">Knockout progression to the final.</p>
              </div>
              <Bracket matches={isCupStyle ? knockoutMatches : matches} teams={teams} />
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {Object.entries(groupedMatches).map(([round, roundMatches]) => (
              <div key={round} className="space-y-2">
                <h3 className="text-lg font-semibold font-headline">{round}</h3>
                <div className="grid gap-3">
                  {roundMatches.map((match) => (
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
        )}
      </CardContent>
    </Card>
  );
}
