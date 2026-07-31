
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getPublicTournaments } from "@/lib/actions/tournament";
import { getJoinedTournamentIdsForUser } from "@/lib/actions/team";
import type { Tournament, UnifiedTimestamp, TournamentStatus } from "@/lib/types";
import { useAuth } from "@/hooks/use-auth";
import { useCountdown } from "@/hooks/use-countdown";

import { Button } from "@/components/ui/button";
import { ArrowRight, KeyRound, Users, Calendar, CheckCircle, Shield, Search, Trophy } from "lucide-react";
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

const statusMeta: Record<
  TournamentStatus,
  { label: string; className: string }
> = {
  open_for_registration: {
    label: "Open",
    className: "bg-green-100 text-green-800 border-green-300 dark:bg-green-600/15 dark:text-green-400 dark:border-green-500/30",
  },
  ready_to_start: {
    label: "Ready",
    className: "bg-violet-100 text-violet-800 border-violet-300 dark:bg-violet-600/15 dark:text-violet-300 dark:border-violet-500/30",
  },
  in_progress: {
    label: "Live",
    className: "bg-red-100 text-red-800 border-red-300 dark:bg-red-600/15 dark:text-red-400 dark:border-red-500/30",
  },
  completed: {
    label: "Done",
    className: "bg-muted text-muted-foreground border-border",
  },
  draft: {
    label: "Draft",
    className: "bg-muted text-muted-foreground border-border",
  },
  private: {
    label: "Private",
    className: "bg-muted text-muted-foreground border-border",
  },
  pending: {
    label: "Pending",
    className: "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-600/15 dark:text-amber-400 dark:border-amber-500/30",
  },
  generating_fixtures: {
    label: "Generating",
    className: "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-600/15 dark:text-amber-400 dark:border-amber-500/30",
  },
};

function StatusPill({ status }: { status: TournamentStatus }) {
  const s = statusMeta[status] ?? {
    label: "Unknown",
    className: "bg-muted text-muted-foreground border-border",
  };
  return (
    <Badge variant="outline" className={cn("text-[10px] font-bold uppercase tracking-wider", s.className)}>
      {s.label}
    </Badge>
  );
}

function RegistrationCountdownBadge({ endDate }: { endDate: UnifiedTimestamp }) {
  const countdown = useCountdown(toDate(endDate));
  if (countdown.isFinished) return null;

  let text = `${String(countdown.hours).padStart(2, "0")}:${String(countdown.minutes).padStart(2, "0")}:${String(countdown.seconds).padStart(2, "0")}`;
  if (countdown.days > 0) text = `${countdown.days}d ${text}`;

  return (
    <Badge variant="destructive" className="text-[10px] font-bold uppercase tracking-wider tabular-nums">
      {text} left
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
        "shrink-0 px-4 py-2.5 rounded-full text-sm font-bold border transition-colors min-h-11",
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
          <Users className="h-3.5 w-3.5" /> {current}/{max} teams
        </span>
        <span className="font-bold tabular-nums">{pct}%</span>
      </div>
      <div className="mt-1.5 h-1.5 w-full rounded-full bg-muted overflow-hidden">
        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function FlyerThumb({
  tournament,
  className,
}: {
  tournament: Tournament;
  className?: string;
}) {
  return (
    <div className={cn("relative shrink-0 overflow-hidden bg-muted", className)}>
      {tournament.flyerUrl ? (
        <Image
          src={tournament.flyerUrl}
          alt=""
          fill
          sizes="(max-width: 640px) 112px, 100vw"
          className="object-cover"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-primary/15 to-primary/5">
          <Trophy className="h-8 w-8 text-primary/40" />
        </div>
      )}
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

  const startLabel = tournament.tournamentStartDate
    ? format(toDate(tournament.tournamentStartDate), "MMM d")
    : null;

  const prize =
    tournament.rewardDetails?.type === "money" &&
    tournament.rewardDetails.prizePool > 0
      ? `₦${tournament.rewardDetails.prizePool.toLocaleString()}`
      : null;

  return (
    <Link
      href={`/tournaments/${tournament.id}`}
      className="group block rounded-2xl border bg-card transition-colors hover:border-primary/40 hover:bg-card active:scale-[0.99]"
    >
      {/* Mobile: horizontal row */}
      <div className="flex gap-3 p-3 sm:hidden">
        <FlyerThumb tournament={tournament} className="h-[6.5rem] w-[6.5rem] rounded-xl" />
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <StatusPill status={tournament.status} />
            {hasJoined && (
              <Badge
                variant="outline"
                className="border-green-600 text-green-700 dark:border-green-500 dark:text-green-400 text-[10px] font-bold uppercase"
              >
                Joined
              </Badge>
            )}
            {regOpen && tournament.registrationEndDate ? (
              <RegistrationCountdownBadge endDate={tournament.registrationEndDate} />
            ) : null}
          </div>
          <h3 className="font-headline text-[15px] font-bold leading-snug line-clamp-2">
            {tournament.name}
          </h3>
          <p className="text-xs text-muted-foreground truncate">
            {tournament.game} · {tournament.platform}
            {tournament.format
              ? ` · ${tournament.format.replace(/-/g, " ").replace(/^\w/, (c) => c.toUpperCase())}`
              : ""}
          </p>
          <div className="mt-auto flex items-center justify-between gap-2 pt-1">
            <span className="flex items-center gap-1 text-xs font-semibold text-muted-foreground">
              <Users className="h-3.5 w-3.5" />
              {tournament.teamCount}/{tournament.maxTeams}
            </span>
            {prize ? (
              <span className="text-xs font-bold text-primary tabular-nums">{prize}</span>
            ) : startLabel ? (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Calendar className="h-3.5 w-3.5" />
                {startLabel}
              </span>
            ) : null}
          </div>
        </div>
      </div>

      {/* Desktop / tablet: vertical card */}
      <div className="hidden h-full flex-col sm:flex">
        <div className="relative aspect-[16/10] overflow-hidden rounded-t-2xl bg-muted">
          {tournament.flyerUrl ? (
            <Image
              src={tournament.flyerUrl}
              alt={tournament.name}
              fill
              sizes="(max-width: 1024px) 50vw, 25vw"
              className="object-cover transition-transform duration-300 group-hover:scale-105"
            />
          ) : (
            <div className="flex h-full items-center justify-center bg-gradient-to-br from-primary/15 to-primary/5">
              <Trophy className="h-12 w-12 text-primary/35" />
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
          <div className="absolute left-3 right-3 top-3 flex flex-wrap gap-1.5">
            <StatusPill status={tournament.status} />
            {regOpen && tournament.registrationEndDate ? (
              <RegistrationCountdownBadge endDate={tournament.registrationEndDate} />
            ) : null}
          </div>
          {hasJoined && (
            <div className="absolute bottom-3 left-3">
              <Badge className="bg-green-600 text-white border-0 text-[10px] font-bold uppercase">
                <CheckCircle className="mr-1 h-3 w-3" />
                Joined
              </Badge>
            </div>
          )}
          {prize && (
            <div className="absolute bottom-3 right-3 rounded-md bg-black/55 px-2 py-1 text-xs font-bold text-white tabular-nums backdrop-blur-sm">
              {prize}
            </div>
          )}
        </div>

        <div className="flex flex-1 flex-col gap-2 p-4">
          <h3 className="font-headline text-base font-bold leading-snug line-clamp-2">
            {tournament.name}
          </h3>
          <p className="text-xs text-muted-foreground">
            {tournament.game} · {tournament.platform}
            {startLabel ? ` · Starts ${startLabel}` : ""}
          </p>
          <p className="text-xs text-muted-foreground line-clamp-2">{tournament.description}</p>
          <div className="mt-auto pt-2">
            <TeamsMiniBar current={tournament.teamCount} max={tournament.maxTeams} />
          </div>
        </div>
      </div>
    </Link>
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
    <div className="container py-6 md:py-10">
      <div className="space-y-6 md:space-y-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-2xl sm:text-3xl font-bold font-headline">Browse Public Tournaments</h1>
            <p className="text-sm text-muted-foreground">Scan fast. Join faster. Less scrolling, more playing.</p>
          </div>

          <div className="flex gap-2 w-full md:w-auto">
            <Link href="/tournaments/join" className="flex-1 md:flex-none">
              <Button variant="outline" className="w-full h-11">
                <KeyRound className="mr-2 h-4 w-4" /> Join with Code
              </Button>
            </Link>
            <Link href="/dashboard/create-tournament" className="flex-1 md:flex-none">
              <Button className="w-full h-11">
                Create
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>

        {/* Sticky search + horizontal chips */}
        <div className="sticky top-14 z-30 -mx-4 border-b border-border/60 bg-background/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:static md:mx-0 md:rounded-2xl md:border md:bg-muted/10 md:px-4 md:py-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search tournament, game, platform…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="h-11 pl-9 rounded-xl"
            />
          </div>

          <div className="mt-3 flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
            <Chip active={filter === "active"} onClick={() => setFilter("active")}>
              Active ({activeCount})
            </Chip>
            <Chip active={filter === "open"} onClick={() => setFilter("open")}>
              Open
            </Chip>
            <Chip active={filter === "live"} onClick={() => setFilter("live")}>
              Live
            </Chip>
            <Chip active={filter === "ready"} onClick={() => setFilter("ready")}>
              Ready
            </Chip>
            <Chip active={filter === "completed"} onClick={() => setFilter("completed")}>
              Done ({completedCount})
            </Chip>
            <Chip active={filter === "all"} onClick={() => setFilter("all")}>
              All
            </Chip>
            {user ? (
              <Chip active={joinedOnly} onClick={() => setJoinedOnly((v) => !v)}>
                {joinedOnly ? "Joined" : "Joined only"}
              </Chip>
            ) : null}
          </div>
        </div>

        {/* Results */}
        {loading ? (
          <div className="grid gap-3 sm:gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="rounded-2xl border bg-card p-3 sm:p-0 sm:overflow-hidden">
                <div className="flex gap-3 sm:hidden">
                  <Skeleton className="h-[6.5rem] w-[6.5rem] shrink-0 rounded-xl" />
                  <div className="flex flex-1 flex-col gap-2 py-0.5">
                    <Skeleton className="h-4 w-16" />
                    <Skeleton className="h-5 w-full" />
                    <Skeleton className="h-3 w-2/3" />
                    <Skeleton className="mt-auto h-3 w-1/2" />
                  </div>
                </div>
                <div className="hidden sm:block">
                  <Skeleton className="aspect-[16/10] w-full rounded-none" />
                  <div className="space-y-2 p-4">
                    <Skeleton className="h-5 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                    <Skeleton className="h-3 w-full" />
                    <Skeleton className="h-2 w-full" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length > 0 ? (
          <div className="grid gap-3 sm:gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
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
              <Button className="h-11">Create a Tournament</Button>
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
