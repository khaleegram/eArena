'use client';

import { useEffect, useMemo, useState, type ElementType } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { db } from '@/lib/firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { useAuth } from '@/hooks/use-auth';
import type { Tournament, TournamentStatus, UnifiedTimestamp } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { getTournamentsByIds } from '@/lib/actions/tournament';
import { adminDeleteTournament } from '@/lib/actions/admin';
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
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  PlusCircle,
  ArrowRight,
  Loader2,
  Trash2,
  Trophy,
  Users,
  Calendar,
  Search,
} from 'lucide-react';
import { format } from 'date-fns';
import { OnboardingFlow } from '@/components/onboarding-flow';
import { cn } from '@/lib/utils';

const toDate = (timestamp: UnifiedTimestamp): Date => {
  if (typeof timestamp === 'string') return new Date(timestamp);
  if (timestamp && typeof (timestamp as { toDate?: () => Date }).toDate === 'function') {
    return (timestamp as { toDate: () => Date }).toDate();
  }
  return timestamp as Date;
};

const statusMeta: Record<TournamentStatus, { label: string; className: string }> = {
  open_for_registration: {
    label: 'Open',
    className:
      'bg-green-100 text-green-800 border-green-300 dark:bg-green-600/15 dark:text-green-400 dark:border-green-500/30',
  },
  ready_to_start: {
    label: 'Ready',
    className:
      'bg-violet-100 text-violet-800 border-violet-300 dark:bg-violet-600/15 dark:text-violet-300 dark:border-violet-500/30',
  },
  in_progress: {
    label: 'Live',
    className:
      'bg-red-100 text-red-800 border-red-300 dark:bg-red-600/15 dark:text-red-400 dark:border-red-500/30',
  },
  completed: {
    label: 'Done',
    className: 'bg-muted text-muted-foreground border-border',
  },
  pending: {
    label: 'Pending',
    className:
      'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-600/15 dark:text-amber-400 dark:border-amber-500/30',
  },
  generating_fixtures: {
    label: 'Generating',
    className:
      'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-600/15 dark:text-amber-400 dark:border-amber-500/30',
  },
};

function StatusPill({ status }: { status: TournamentStatus }) {
  const s = statusMeta[status] ?? {
    label: 'Unknown',
    className: 'bg-muted text-muted-foreground border-border',
  };
  return (
    <Badge variant="outline" className={cn('text-[10px] font-bold uppercase tracking-wider', s.className)}>
      {s.label}
    </Badge>
  );
}

function FlyerThumb({ tournament, className }: { tournament: Tournament; className?: string }) {
  return (
    <div className={cn('relative shrink-0 overflow-hidden bg-muted', className)}>
      {tournament.flyerUrl ? (
        <Image
          src={tournament.flyerUrl}
          alt=""
          fill
          sizes="(max-width: 640px) 112px, 400px"
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
  isOrganizer,
}: {
  tournament: Tournament;
  isOrganizer: boolean;
}) {
  const [isDeleting, setIsDeleting] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();

  const handleDelete = async () => {
    if (!user) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'You must be logged in to perform this action.',
      });
      return;
    }
    setIsDeleting(true);
    try {
      await adminDeleteTournament(tournament.id);
      toast({ title: 'Deleted', description: 'Tournament removed.' });
    } catch {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to delete tournament.',
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const startLabel = tournament.tournamentStartDate
    ? format(toDate(tournament.tournamentStartDate), 'MMM d')
    : null;

  const formatLabel = tournament.format
    ? tournament.format.replace(/-/g, ' ').replace(/^\w/, (c) => c.toUpperCase())
    : null;

  return (
    <div className="group overflow-hidden rounded-2xl border bg-card transition-colors hover:border-primary/40">
      {/* Mobile row */}
      <div className="flex gap-3 p-3 sm:hidden">
        <FlyerThumb tournament={tournament} className="h-[6.5rem] w-[6.5rem] rounded-xl" />
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <StatusPill status={tournament.status} />
            <Badge
              variant="outline"
              className={cn(
                'text-[10px] font-bold uppercase tracking-wider',
                isOrganizer
                  ? 'border-amber-400/60 text-amber-800 dark:text-amber-400'
                  : 'border-green-600 text-green-700 dark:border-green-500 dark:text-green-400'
              )}
            >
              {isOrganizer ? 'Hosting' : 'Joined'}
            </Badge>
          </div>
          <h3 className="font-headline text-[15px] font-bold leading-snug line-clamp-2">
            {tournament.name}
          </h3>
          <p className="truncate text-xs text-muted-foreground">
            {tournament.game} · {tournament.platform}
            {formatLabel ? ` · ${formatLabel}` : ''}
          </p>
          <div className="mt-auto flex items-center justify-between gap-2 pt-1 text-xs text-muted-foreground">
            <span className="flex items-center gap-1 font-semibold">
              <Users className="h-3.5 w-3.5" />
              {tournament.teamCount}/{tournament.maxTeams}
            </span>
            {startLabel ? (
              <span className="flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5" />
                {startLabel}
              </span>
            ) : null}
          </div>
        </div>
      </div>

      {/* Desktop / tablet card */}
      <div className="hidden sm:flex sm:h-full sm:flex-col">
        <div className="relative aspect-[16/10] overflow-hidden bg-muted">
          {tournament.flyerUrl ? (
            <Image
              src={tournament.flyerUrl}
              alt={tournament.name}
              fill
              sizes="(max-width: 1024px) 50vw, 33vw"
              className="object-cover transition-transform duration-300 group-hover:scale-105"
            />
          ) : (
            <div className="flex h-full items-center justify-center bg-gradient-to-br from-primary/15 to-primary/5">
              <Trophy className="h-12 w-12 text-primary/35" />
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/15 to-transparent" />
          <div className="absolute left-3 right-3 top-3 flex flex-wrap gap-1.5">
            <StatusPill status={tournament.status} />
            <Badge
              className={cn(
                'border-0 text-[10px] font-bold uppercase',
                isOrganizer ? 'bg-amber-600 text-white' : 'bg-green-600 text-white'
              )}
            >
              {isOrganizer ? 'Hosting' : 'Joined'}
            </Badge>
          </div>
          <div className="absolute bottom-3 left-3 right-3 flex items-end justify-between gap-2">
            <span className="rounded-md bg-black/55 px-2 py-1 text-xs font-semibold text-white backdrop-blur-sm">
              {tournament.teamCount}/{tournament.maxTeams} teams
            </span>
            {startLabel ? (
              <span className="rounded-md bg-black/55 px-2 py-1 text-xs text-white/90 backdrop-blur-sm">
                {startLabel}
              </span>
            ) : null}
          </div>
        </div>

        <div className="flex flex-1 flex-col gap-2 p-4">
          <h3 className="font-headline text-base font-bold leading-snug line-clamp-2">
            {tournament.name}
          </h3>
          <p className="text-xs text-muted-foreground">
            {tournament.game} · {tournament.platform}
            {formatLabel ? ` · ${formatLabel}` : ''}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 border-t p-3">
        <Button asChild className="h-11 flex-1" variant={isOrganizer ? 'default' : 'secondary'}>
          <Link href={`/tournaments/${tournament.id}`}>
            {isOrganizer ? 'Manage' : 'Open'}
            <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </Button>
        {isOrganizer ? (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className="h-11 w-11 shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
                disabled={isDeleting}
                aria-label="Delete tournament"
              >
                {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete this tournament?</AlertDialogTitle>
                <AlertDialogDescription>
                  This permanently deletes the tournament and all related data. This cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : null}
      </div>
    </div>
  );
}

function EmptyState({
  title,
  description,
  actionHref,
  actionLabel,
  icon: Icon,
}: {
  title: string;
  description: string;
  actionHref: string;
  actionLabel: string;
  icon: ElementType;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-muted-foreground/25 bg-muted/20 px-6 py-12 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Icon className="h-6 w-6" />
      </div>
      <h3 className="font-headline text-lg font-bold">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>
      <Button asChild variant="outline" className="mt-5 h-11">
        <Link href={actionHref}>{actionLabel}</Link>
      </Button>
    </div>
  );
}

export default function MyTournamentsPage() {
  const { user, settings: platformSettings } = useAuth();
  const [organizedTournaments, setOrganizedTournaments] = useState<Tournament[]>([]);
  const [joinedTournaments, setJoinedTournaments] = useState<Tournament[]>([]);
  const [loading, setLoading] = useState(true);
  const [showOnboarding, setShowOnboarding] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const hasCompleted = localStorage.getItem('hasCompletedOnboarding') === 'true';
      if (!hasCompleted) setShowOnboarding(true);
    }
  }, []);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    setLoading(true);
    let settled = false;
    const markReady = () => {
      if (!settled) {
        settled = true;
        setLoading(false);
      }
    };

    const orgQuery = query(collection(db, 'tournaments'), where('organizerId', '==', user.uid));
    const organizedUnsub = onSnapshot(orgQuery, (querySnapshot) => {
      const userTournaments = querySnapshot.docs.map(
        (doc) => ({ id: doc.id, ...doc.data() }) as Tournament
      );
      setOrganizedTournaments(userTournaments);
      markReady();
    });

    const joinedQuery = query(collection(db, 'userMemberships'), where('userId', '==', user.uid));
    const joinedUnsub = onSnapshot(joinedQuery, async (snapshot) => {
      const tournamentIds = snapshot.docs.map((doc) => doc.data().tournamentId);
      if (tournamentIds.length > 0) {
        const tournaments = await getTournamentsByIds(tournamentIds);
        setJoinedTournaments(tournaments);
      } else {
        setJoinedTournaments([]);
      }
      markReady();
    });

    return () => {
      organizedUnsub();
      joinedUnsub();
    };
  }, [user]);

  const competingTournaments = useMemo(() => {
    const organizedIds = new Set(organizedTournaments.map((t) => t.id));
    return joinedTournaments.filter((t) => !organizedIds.has(t.id));
  }, [joinedTournaments, organizedTournaments]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {showOnboarding && <OnboardingFlow />}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <h1 className="font-headline text-2xl font-bold sm:text-3xl">My Arena</h1>
          <p className="text-sm text-muted-foreground">
            Tournaments you host and competitions you play in.
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline" className="h-11 flex-1 sm:flex-none">
            <Link href="/tournaments">
              <Search className="mr-2 h-4 w-4" />
              Browse
            </Link>
          </Button>
          {platformSettings.allowNewTournaments ? (
            <Button asChild className="h-11 flex-1 sm:flex-none">
              <Link href="/dashboard/create-tournament">
                <PlusCircle className="mr-2 h-4 w-4" />
                Create
              </Link>
            </Button>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl border bg-card px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Hosting</p>
          <p className="mt-1 font-headline text-2xl font-bold tabular-nums">
            {organizedTournaments.length}
          </p>
        </div>
        <div className="rounded-2xl border bg-card px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Competing</p>
          <p className="mt-1 font-headline text-2xl font-bold tabular-nums">
            {competingTournaments.length}
          </p>
        </div>
      </div>

      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Trophy className="h-5 w-5 text-amber-700 dark:text-amber-400" />
          <h2 className="font-headline text-lg font-bold sm:text-xl">Hosting</h2>
          <Badge variant="secondary" className="ml-1 tabular-nums">
            {organizedTournaments.length}
          </Badge>
        </div>

        {organizedTournaments.length === 0 ? (
          platformSettings.allowNewTournaments ? (
            <EmptyState
              icon={Trophy}
              title="No tournaments yet"
              description="Create your first competition and invite players."
              actionHref="/dashboard/create-tournament"
              actionLabel="Create tournament"
            />
          ) : (
            <EmptyState
              icon={Trophy}
              title="No tournaments yet"
              description="Tournament creation is temporarily paused."
              actionHref="/tournaments"
              actionLabel="Browse tournaments"
            />
          )
        ) : (
          <div className="grid gap-3 sm:gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {organizedTournaments.map((tournament) => (
              <TournamentCard key={tournament.id} tournament={tournament} isOrganizer />
            ))}
          </div>
        )}
      </section>

      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-primary" />
          <h2 className="font-headline text-lg font-bold sm:text-xl">Competing</h2>
          <Badge variant="secondary" className="ml-1 tabular-nums">
            {competingTournaments.length}
          </Badge>
        </div>

        {competingTournaments.length === 0 ? (
          <EmptyState
            icon={Search}
            title="Not in any tournaments"
            description="Browse open competitions and join one to get started."
            actionHref="/tournaments"
            actionLabel="Browse tournaments"
          />
        ) : (
          <div className="grid gap-3 sm:gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {competingTournaments.map((tournament) => (
              <TournamentCard key={tournament.id} tournament={tournament} isOrganizer={false} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
