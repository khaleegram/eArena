
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getPublicTournaments } from "@/lib/actions/tournament";
import { getJoinedTournamentIdsForUser } from "@/lib/actions/team";
import type { Tournament, UnifiedTimestamp, TournamentStatus } from "@/lib/types";
import { useAuth } from "@/hooks/use-auth";
import { useCountdown } from "@/hooks/use-countdown";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowRight, KeyRound, Users, Calendar, CheckCircle, Shield, Search, Filter, Sparkles, ChevronDown, ChevronUp, Trophy } from "lucide-react";
import { format, isBefore, isAfter, endOfDay } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import Image from "next/image";

const toDate = (timestamp: UnifiedTimestamp): Date => {
  if (typeof timestamp === "string") return new Date(timestamp);
  if (timestamp && typeof (timestamp as any).toDate === "function") return (timestamp as any).toDate();
  return timestamp as Date;
};

const statusMeta: Record<TournamentStatus, { label: string; emoji: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  open_for_registration: { label: "Open", emoji: "🟢", variant: "default" },
  ready_to_start: { label: "Ready", emoji: "🟣", variant: "secondary" },
  in_progress: { label: "Live", emoji: "🔴", variant: "destructive" },
  completed: { label: "Completed", emoji: "✅", variant: "outline" },
  draft: { label: "Draft", emoji: "📝", variant: "outline" },
  private: { label: "Private", emoji: "🔒", variant: "outline" },
  pending: { label: "Pending", emoji: "🟡", variant: "outline" },
  generating_fixtures: { label: "Generating", emoji: "🤖", variant: "secondary" },
};

function StatusPill({ status }: { status: TournamentStatus }) {
  const s = statusMeta[status] ?? { label: "Unknown", emoji: "❓", variant: "outline" as const };
  return (
    <Badge variant={s.variant} className="text-[10px] font-black uppercase tracking-wider">
      {s.emoji} {s.label}
    </Badge>
  );
}

function RegistrationCountdownBadge({ endDate }: { endDate: UnifiedTimestamp }) {
  const countdown = useCountdown(toDate(endDate));
  if (countdown.isFinished) return null;

  let text = `${String(countdown.hours).padStart(2, "0")}:${String(countdown.minutes).padStart(2, "0")}:${String(countdown.seconds).padStart(2, "0")}`;
  if (countdown.days > 0) text = `${countdown.days}d ${text}`;

  return (
    <Badge variant="destructive" className="text-[10px] font-black uppercase tracking-wider">
      ⏳ {text}
    </Badge>
  );
}

function Chip({
  active,
  children,
  onClick,
}: {
  active?: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "px-3 py-1.5 rounded-full text-xs font-bold border transition-colors",
        active ? "bg-primary text-primary-foreground border-primary" : "bg-muted/30 border-border hover:bg-muted"
      )}
      type="button"
    >
      {children}
    </button>
  );
}

function TeamsMiniBar({ current, max }: { current: number; max: number }) {
  const pct = max > 0 ? Math.min(100, Math.round((current / max) * 100)) : 0;
  return (
    <div className="w-full">
      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span className="font-semibold flex items-center gap-1">
          <Users className="h-3.5 w-3.5" /> {current}/{max}
        </span>
        <span className="font-bold">{pct}%</span>
      </div>
      <div className="mt-1 h-1.5 w-full rounded-full bg-muted overflow-hidden">
        <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function TournamentCard({
  tournament,
  hasJoined,
}: {
  tournament: Tournament;
  hasJoined: boolean;
}) {
  const now = new Date();

  const regOpen =
    tournament.registrationStartDate &&
    tournament.registrationEndDate &&
    isAfter(now, toDate(tournament.registrationStartDate)) &&
    isBefore(now, endOfDay(toDate(tournament.registrationEndDate)));

  return (
    <Card className="overflow-hidden border bg-card/50 hover:bg-card transition-colors rounded-2xl flex flex-col h-full group">
      <Link href={`/tournaments/${tournament.id}`} className="block h-full flex flex-col">
        <div className="relative h-56 bg-muted overflow-hidden">
            {tournament.flyerUrl ? (
                <Image src={tournament.flyerUrl} alt={tournament.name} fill style={{ objectFit: 'cover' }} className="transition-transform group-hover:scale-105" />
            ) : (
                <div className="flex items-center justify-center h-full bg-gradient-to-br from-primary/10 to-primary/20">
                    <Trophy className="w-10 h-10 text-primary/30" />
                </div>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
            <div className="absolute top-2 right-2 flex flex-wrap gap-1 justify-end">
                <StatusPill status={tournament.status} />
                {regOpen && tournament.registrationEndDate ? <RegistrationCountdownBadge endDate={tournament.registrationEndDate} /> : null}
            </div>
        </div>

        <CardHeader className="pt-3 pb-2 px-3">
            <h3 className="font-headline text-base font-black leading-tight line-clamp-2">
                {tournament.name}
            </h3>
            <p className="text-xs text-muted-foreground line-clamp-1">
                🎮 {tournament.game} • 🖥 {tournament.platform}
            </p>
        </CardHeader>

        <CardContent className="px-3 pt-0 pb-3 flex-grow">
             <p className="text-xs text-muted-foreground line-clamp-2">{tournament.description}</p>
        </CardContent>

        <CardFooter className="p-3 border-t">
            <div className="w-full space-y-2">
              <TeamsMiniBar current={tournament.teamCount} max={tournament.maxTeams} />
              {hasJoined && (
                  <Badge variant="outline" className="border-green-500 text-green-500 text-[10px] font-black uppercase tracking-wider w-full justify-center">
                      <CheckCircle className="w-3 h-3 mr-1" />
                      Joined
                  </Badge>
              )}
            </div>
        </CardFooter>
      </Link>
    </Card>
  );
}

export default function BrowseTournamentsPage() {
  const [allTournaments, setAllTournaments] = useState<Tournament[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const { user } = useAuth();
  const [joinedTournamentIds, setJoinedTournamentIds] = useState<string[]>([]);

  const [filter, setFilter] = useState<"active" | "completed" | "open" | "live" | "ready" | "all">("active");
  const [joinedOnly, setJoinedOnly] = useState(false);

  useEffect(() => {
    const fetchTournaments = async () => {
      setLoading(true);
      try {
        const publicTournaments = await getPublicTournaments();
        setAllTournaments(publicTournaments);

        if (user) {
          const ids = await getJoinedTournamentIdsForUser(user.uid);
          setJoinedTournamentIds(ids);
        } else {
          setJoinedTournamentIds([]);
        }
      } catch (error) {
        console.error("Error fetching public tournaments:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchTournaments();
  }, [user]);

  const activeStatuses: TournamentStatus[] = ["open_for_registration", "in_progress", "ready_to_start"];
  const completedStatuses: TournamentStatus[] = ["completed"];

  const filtered = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    let list = allTournaments;

    if (filter === "active") list = list.filter((t) => activeStatuses.includes(t.status));
    if (filter === "completed") list = list.filter((t) => completedStatuses.includes(t.status));
    if (filter === "open") list = list.filter((t) => t.status === "open_for_registration");
    if (filter === "live") list = list.filter((t) => t.status === "in_progress");
    if (filter === "ready") list = list.filter((t) => t.status === "ready_to_start");

    if (term) {
      list = list.filter(
        (t) => t.name.toLowerCase().includes(term) || t.game.toLowerCase().includes(term) || t.platform.toLowerCase().includes(term)
      );
    }

    if (joinedOnly && user) {
      list = list.filter((t) => joinedTournamentIds.includes(t.id));
    }

    // Sort: Joined first, then open registration, then soonest start
    list = [...list].sort((a, b) => {
      const aj = joinedTournamentIds.includes(a.id) ? 1 : 0;
      const bj = joinedTournamentIds.includes(b.id) ? 1 : 0;
      if (aj !== bj) return bj - aj;

      const aRegOpen =
        a.registrationStartDate &&
        a.registrationEndDate &&
        isAfter(new Date(), toDate(a.registrationStartDate)) &&
        isBefore(new Date(), endOfDay(toDate(a.registrationEndDate)))
          ? 1
          : 0;

      const bRegOpen =
        b.registrationStartDate &&
        b.registrationEndDate &&
        isAfter(new Date(), toDate(b.registrationStartDate)) &&
        isBefore(new Date(), endOfDay(toDate(b.registrationEndDate)))
          ? 1
          : 0;

      if (aRegOpen !== bRegOpen) return bRegOpen - aRegOpen;

      const ad = a.tournamentStartDate ? toDate(a.tournamentStartDate).getTime() : Number.MAX_SAFE_INTEGER;
      const bd = b.tournamentStartDate ? toDate(b.tournamentStartDate).getTime() : Number.MAX_SAFE_INTEGER;
      return ad - bd;
    });

    return list;
  }, [allTournaments, searchTerm, filter, joinedOnly, user, joinedTournamentIds]);

  const activeCount = useMemo(() => allTournaments.filter((t) => activeStatuses.includes(t.status)).length, [allTournaments]);
  const completedCount = useMemo(() => allTournaments.filter((t) => completedStatuses.includes(t.status)).length, [allTournaments]);

  return (
    <div className="container py-10">
      <div className="space-y-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="space-y-2">
            <h1 className="text-3xl font-bold font-headline">Browse Public Tournaments</h1>
            <p className="text-sm text-muted-foreground">Scan fast. Join faster. Less scrolling, more playing.</p>
          </div>

          <div className="flex gap-2 w-full md:w-auto">
            <Link href="/tournaments/join" className="flex-1 md:flex-none">
              <Button variant="outline" className="w-full">
                <KeyRound className="mr-2" /> Join with Code
              </Button>
            </Link>
            <Link href="/dashboard/create-tournament" className="flex-1 md:flex-none">
              <Button className="w-full">
                Create
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>

        {/* Search + Filters */}
        <Card className="border bg-muted/10 rounded-2xl">
          <CardContent className="p-4 space-y-4">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Search tournament, game, platform…"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8 rounded-xl"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-2 text-xs text-muted-foreground font-bold">
                <Filter className="h-4 w-4" />
                Filters:
              </div>

              <Chip active={filter === "active"} onClick={() => setFilter("active")}>
                Active ({activeCount})
              </Chip>
              <Chip active={filter === "open"} onClick={() => setFilter("open")}>
                Open 🟢
              </Chip>
              <Chip active={filter === "live"} onClick={() => setFilter("live")}>
                Live 🔴
              </Chip>
              <Chip active={filter === "ready"} onClick={() => setFilter("ready")}>
                Ready 🟣
              </Chip>
              <Chip active={filter === "completed"} onClick={() => setFilter("completed")}>
                Completed ({completedCount})
              </Chip>
              <Chip active={filter === "all"} onClick={() => setFilter("all")}>
                All
              </Chip>

              {user ? (
                <div className="ml-auto">
                  <Chip active={joinedOnly} onClick={() => setJoinedOnly((v) => !v)}>
                    {joinedOnly ? "✅ Joined only" : "Show joined"}
                  </Chip>
                </div>
              ) : null}
            </div>
          </CardContent>
        </Card>

        {/* Results */}
        {loading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {[...Array(8)].map((_, i) => (
              <Card key={i} className="rounded-2xl">
                <CardHeader>
                  <Skeleton className="h-5 w-3/4" />
                  <Skeleton className="h-4 w-1/2" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-4 w-full mb-2" />
                  <Skeleton className="h-4 w-2/3" />
                </CardContent>
                <CardFooter>
                  <Skeleton className="h-10 w-full" />
                </CardFooter>
              </Card>
            ))}
          </div>
        ) : filtered.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filtered.map((tournament) => {
              const hasJoined = user ? joinedTournamentIds.includes(tournament.id) : false;
              return <TournamentCard key={tournament.id} tournament={tournament} hasJoined={hasJoined} />;
            })}
          </div>
        ) : (
          <div className="text-center py-16 border-2 border-dashed border-muted rounded-2xl">
            <h2 className="text-xl font-semibold">No tournaments found</h2>
            <p className="text-muted-foreground mt-2">Try a different search or create one.</p>
            <Link href="/dashboard/create-tournament" className="mt-4 inline-block">
              <Button>Create a Tournament</Button>
            </Link>
          </div>
        )}

        <Separator />

        <div className="text-xs text-muted-foreground flex items-center gap-2">
          <Shield className="h-4 w-4" />
          Public tournaments are visible to everyone. Private tournaments need a code.
        </div>
      </div>
    </div>
  );
}
