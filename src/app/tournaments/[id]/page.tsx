
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { getTournamentById, extendRegistration, startTournamentAndGenerateFixtures, regenerateTournamentFixtures, rescheduleTournament, recalculateStandings, progressTournamentStage, updateTournamentFlyer } from '@/lib/actions/tournament';
import { organizerResolveOverdueMatches } from '@/lib/actions/matches';
import { devSeedDummyTeams, devAutoApproveCurrentStageMatches, devAutoApproveAndProgress, devAutoRunCupToCompletion } from '@/lib/actions/dev-tools';
import { retryTournamentPayment } from '@/lib/actions/payouts';
import { getUserTeamForTournament, leaveTournament } from '@/lib/actions/team';
import { useAuth } from "@/hooks/use-auth";
import type { Tournament, TournamentStatus, Team, Player, UserProfile, UnifiedTimestamp, Match, Standing } from "@/lib/types";
import { format, isBefore, isAfter, isToday, isFuture, isPast, endOfDay, differenceInDays } from "date-fns";
import { collection, onSnapshot, query, where, orderBy, getDoc, doc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Calendar, Gamepad2, Info, List, Trophy, Users, Loader2, Lock, Globe, Crown, PlusCircle, BookOpenCheck, Rss, Award, Swords, Timer, Hourglass, Bot, Sparkles, ShieldCheck, History, RefreshCw, AlertCircle, CreditCard } from "lucide-react";
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { OverviewTab } from "./overview-tab";
import { TeamsTab } from "./teams-tab";
import { FixturesTab } from "./fixtures-tab";
import { StandingsTab } from "./standings-tab";
import { RewardsTab } from './rewards-tab';
import { MyMatchesTab } from './my-matches-tab';
import { Badge } from '@/components/ui/badge';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { useToast } from "@/hooks/use-toast";
import Image from "next/image";
import { CommunicationHub } from './communication-hub';
import { cn, toDate } from "@/lib/utils";
import { useCountdown } from '@/hooks/use-countdown';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar as CalendarPicker } from '@/components/ui/calendar';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TournamentPodium } from '@/components/tournament-podium';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { PrizeAllocationEditor } from './prize-allocation';
import { EditFlyerDialog } from '@/components/edit-flyer-dialog';
import { JoinTournamentDialog } from './join-dialog';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';


const CountdownDisplay = ({ days, hours, minutes, seconds }: { days: number, hours: number, minutes: number, seconds: number }) => (
    <div className="flex items-center gap-2 font-mono text-lg">
        {days > 0 && <span>{String(days).padStart(2, '0')}d</span>}
        <span>{String(hours).padStart(2, '0')}h</span>
        <span>{String(minutes).padStart(2, '0')}m</span>
        <span>{String(seconds).padStart(2, '0')}s</span>
    </div>
);

const TournamentStatusTimers = ({ tournament }: { tournament: Tournament }) => {
    const registrationCountdown = useCountdown(toDate(tournament.registrationEndDate));
    const tournamentCountdown = useCountdown(toDate(tournament.tournamentEndDate));

    if (tournament.status === 'open_for_registration' && !registrationCountdown.isFinished) {
        return (
            <div className="p-3 rounded-lg bg-secondary text-secondary-foreground">
                <div className="flex items-center gap-2 text-sm font-medium">
                    <Hourglass className="h-4 w-4" />
                    <span>Registration closes in:</span>
                </div>
                <CountdownDisplay {...registrationCountdown} />
            </div>
        );
    }
    
    if (tournament.status === 'in_progress' && !tournamentCountdown.isFinished) {
        return (
            <div className="p-3 rounded-lg bg-secondary text-secondary-foreground">
                <div className="flex items-center gap-2 text-sm font-medium">
                    <Timer className="h-4 w-4" />
                    <span>Tournament ends in:</span>
                </div>
                <CountdownDisplay {...tournamentCountdown} />
            </div>
        );
    }

    return null;
}

function ExtendRegistrationDialog({ tournament, organizerId, onSuccess }: { tournament: Tournament, organizerId: string, onSuccess: () => void }) {
    const { toast } = useToast();
    const [open, setOpen] = useState(false);
    const [hours, setHours] = useState(2);
    const [isSubmitting, setIsSubmitting] = useState(false);
    
    const canExtend = tournament.status === 'open_for_registration';

    if (!canExtend) return null;

    const handleExtend = async () => {
        setIsSubmitting(true);
        try {
            await extendRegistration(tournament.id, hours, organizerId);
            toast({ title: "Success!", description: `Registration has been extended by ${hours} hours.` });
            onSuccess(); // Re-fetch the tournament data
            setOpen(false);
        } catch (error: any) {
            toast({ variant: "destructive", title: "Error", description: error.message });
        } finally {
            setIsSubmitting(false);
        }
    }

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="w-full justify-start"><Timer className="mr-2" /> Extend Registration</Button>
            </DialogTrigger>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Extend Registration Period</DialogTitle>
                    <DialogDescription>
                        Give players more time to join. This adds time to the current registration end date.
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                    <div className="space-y-2">
                        <Label>Extension Duration</Label>
                        <Select onValueChange={(val) => setHours(Number(val))} defaultValue={String(hours)}>
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="1">1 Hour</SelectItem>
                                <SelectItem value="2">2 Hours</SelectItem>
                                <SelectItem value="4">4 Hours</SelectItem>
                                <SelectItem value="8">8 Hours</SelectItem>
                                <SelectItem value="24">24 Hours</SelectItem>
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
    )
}

function RescheduleDialog({ tournament, organizerId, onSuccess }: { tournament: Tournament; organizerId: string; onSuccess: () => void }) {
    const { toast } = useToast();
    const [open, setOpen] = useState(false);
    const [newDate, setNewDate] = useState<Date | undefined>(toDate(tournament.tournamentStartDate));
    const [isSubmitting, setIsSubmitting] = useState(false);

    if (tournament.status === 'completed') return null;

    const handleReschedule = async () => {
        if (!newDate) {
            toast({ variant: "destructive", title: "Error", description: "Please select a new start date." });
            return;
        }
        setIsSubmitting(true);
        try {
            await rescheduleTournament(tournament.id, newDate.toISOString(), organizerId);
            toast({ title: "Success!", description: "Tournament has been rescheduled." });
            onSuccess();
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
                <Button variant="outline" size="sm" className="w-full justify-start"><Calendar className="mr-2" /> Reschedule</Button>
            </DialogTrigger>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Reschedule Tournament</DialogTitle>
                    <DialogDescription>
                        Select a new start date. All match dates will be shifted accordingly.
                    </DialogDescription>
                </DialogHeader>
                <div className="py-4">
                    <CalendarPicker
                        mode="single"
                        selected={newDate}
                        onSelect={setNewDate}
                        initialFocus
                    />
                </div>
                <DialogFooter>
                    <Button onClick={handleReschedule} disabled={isSubmitting}>
                        {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Confirm & Reschedule
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function RegenerateFixturesDialog({ tournamentId, organizerId, canRegenerate, onSuccess }: { tournamentId: string, organizerId: string, canRegenerate: boolean, onSuccess: () => void }) {
    const { toast } = useToast();
    const [open, setOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
  
    const handleRegenerate = async () => {
      setIsLoading(true);
      try {
        await regenerateTournamentFixtures(tournamentId, organizerId);
        toast({ title: "Success!", description: "Fixtures have been regenerated and players notified." });
        onSuccess();
        setOpen(false);
      } catch (error: any) {
        toast({ variant: "destructive", title: "Error", description: error.message });
      } finally {
        setIsLoading(false);
      }
    };
  
    return (
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogTrigger asChild>
          <Button variant="outline" size="sm" className="w-full justify-start" disabled={!canRegenerate}>
            <RefreshCw className="mr-2" /> Regenerate Fixtures
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will delete all current matches and create a brand new schedule.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleRegenerate} disabled={isLoading}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Yes, Regenerate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );
  }

function ProgressStageButton({ tournament, organizerId }: { tournament: Tournament, organizerId: string }) {
    const { toast } = useToast();
    const [isLoading, setIsLoading] = useState(false);

    const handleProgress = async () => {
        setIsLoading(true);
        try {
            await progressTournamentStage(tournament.id, organizerId);
            toast({ title: "Success!", description: "Generating fixtures for the next stage." });
        } catch (error: any) {
            toast({ variant: "destructive", title: "Error", description: error.message });
        } finally {
            setIsLoading(false);
        }
    }

    if (tournament.status !== 'in_progress' || (tournament.format !== 'cup' && tournament.format !== 'swiss')) {
        return null;
    }

    return (
        <AlertDialog>
            <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" className="w-full justify-start" disabled={isLoading}>
                    <Bot className="mr-2" /> Progress to Next Stage
                </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Progress to Next Stage?</AlertDialogTitle>
                    <AlertDialogDescription>
                        This will check if all matches in the current stage are complete. If so, it will generate fixtures for the next knockout round. Make sure all disputes are resolved.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleProgress} disabled={isLoading}>
                        {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Continue
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}

function StartTournamentDialog({ tournament, organizerId, onSuccess }: { tournament: Tournament; organizerId: string; onSuccess: () => void }) {
    const { toast } = useToast();
    const [isLoading, setIsLoading] = useState(false);

    const handleStart = async () => {
        setIsLoading(true);
        try {
            await startTournamentAndGenerateFixtures(tournament.id, organizerId, true);
            toast({ title: "Tournament Started!", description: "Fixtures have been generated and participants notified." });
            onSuccess();
        } catch (error: any) {
            toast({ variant: "destructive", title: "Error", description: error.message });
        } finally {
            setIsLoading(false);
        }
    };
    
    if (tournament.status !== 'ready_to_start') return null;

    return (
        <Card className="bg-primary/5 border-primary/20">
            <CardHeader>
                <CardTitle className="font-headline flex items-center gap-2"><Sparkles className="w-5 h-5 text-primary"/>Ready to Start!</CardTitle>
                <CardDescription>All teams are in and registration is closed. You can start the tournament now, or it will start automatically on its scheduled date.</CardDescription>
            </CardHeader>
            <CardContent>
                <Button className="w-full" onClick={handleStart} disabled={isLoading}>
                    {isLoading ? <Loader2 className="animate-spin mr-2"/> : null}
                    Start Tournament Now
                </Button>
            </CardContent>
        </Card>
    );
}

function OrganizerTools({ tournament, user, allMatches, onSuccess }: { tournament: Tournament; user: UserProfile; allMatches: Match[]; onSuccess: () => void; }) {
    const { toast } = useToast();
    const [isLoading, setIsLoading] = useState(false);
    const canRegenerateFixtures = ['in_progress', 'ready_to_start'].includes(tournament.status) && allMatches.length > 0 && allMatches.every(m => m.status === 'scheduled');

    const handleResolveOverdue = async () => {
        setIsLoading(true);
        try {
            await organizerResolveOverdueMatches(tournament.id, user.uid);
            toast({ title: "Success", description: "Checked for overdue matches. Standings will update if any were resolved." });
            onSuccess();
        } catch (error: any) {
            toast({ variant: "destructive", title: "Error", description: error.message });
        } finally {
            setIsLoading(false);
        }
    };

    const handleRecalculateStandings = async () => {
        setIsLoading(true);
        try {
            await recalculateStandings(tournament.id, user.uid);
            toast({ title: "Standings Recalculated", description: "The leaderboard is now up-to-date." });
            onSuccess();
        } catch (error: any) {
            toast({ variant: "destructive", title: "Error", description: error.message });
        } finally {
            setIsLoading(false);
        }
    };
    
    return (
        <div className="space-y-3">
             <Button variant="destructive" size="sm" className="w-full justify-start" onClick={handleResolveOverdue} disabled={isLoading}>
                <AlertCircle className="mr-2" /> {isLoading ? 'Resolving...' : 'Resolve Overdue Matches'}
            </Button>
             <Button variant="outline" size="sm" className="w-full justify-start" onClick={handleRecalculateStandings} disabled={isLoading}>
                <RefreshCw className="mr-2 h-4 w-4" />
                {isLoading ? 'Recalculating...' : 'Recalculate Standings'}
            </Button>
            <ExtendRegistrationDialog tournament={tournament} organizerId={user.uid} onSuccess={onSuccess} />
            <RescheduleDialog tournament={tournament} organizerId={user.uid} onSuccess={onSuccess} />
            <ProgressStageButton tournament={tournament} organizerId={user.uid} />
            <RegenerateFixturesDialog tournamentId={tournament.id} organizerId={user.uid} canRegenerate={canRegenerateFixtures} onSuccess={onSuccess} />

            {process.env.NODE_ENV !== 'production' && (
                <details className="rounded-md border p-3 bg-muted/30">
                    <summary className="cursor-pointer font-medium">Dev Tools (for testing)</summary>
                    <div className="mt-4 space-y-4">
                        
                        {/* General Tool */}
                        <div>
                            <h4 className="font-semibold text-xs uppercase tracking-wider text-muted-foreground mb-2">General</h4>
                            <Button variant="secondary" size="sm" className="w-full justify-start text-xs"
                                onClick={async () => {
                                    try {
                                        await devSeedDummyTeams(tournament.id, user.uid, 8);
                                        toast({ title: 'Done', description: 'Seeded 8 dummy teams.' });
                                        onSuccess();
                                    } catch (e: any) { toast({ variant: 'destructive', title: 'Dev seed failed', description: e.message }); }
                                }}>
                                Seed 8 Dummy Teams
                            </Button>
                        </div>
                        
                        {/* Swiss Format Tools */}
                        {tournament.format === 'swiss' && (
                            <div>
                                <h4 className="font-semibold text-xs uppercase tracking-wider text-muted-foreground mt-4 mb-2">Swiss Tools</h4>
                                <div className="space-y-2">
                                    <Button variant="secondary" size="sm" className="w-full justify-start text-xs"
                                        onClick={async () => {
                                            try {
                                                await devSeedDummyTeams(tournament.id, user.uid, 128);
                                                toast({ title: 'Done', description: 'Seeded 128 dummy teams.' });
                                                onSuccess();
                                            } catch (e: any) { toast({ variant: 'destructive', title: 'Dev seed failed', description: e.message }); }
                                        }}>
                                        Seed 128 Dummy Teams
                                    </Button>
                                    <Button variant="secondary" size="sm" className="w-full justify-start text-xs"
                                        onClick={async () => {
                                            try {
                                                const res = await devAutoApproveCurrentStageMatches(tournament.id, user.uid);
                                                toast({ title: 'Done', description: `Auto-approved ${res.approved} match(es).` });
                                                onSuccess();
                                            } catch (e: any) { toast({ variant: 'destructive', title: 'Auto-approve failed', description: e.message }); }
                                        }}>
                                        Auto-Approve Current Stage
                                    </Button>
                                    <Button variant="secondary" size="sm" className="w-full justify-start text-xs"
                                        onClick={async () => {
                                            try {
                                                const res = await devAutoApproveAndProgress(tournament.id, user.uid);
                                                toast({ title: 'Done', description: res.progressed ? `Approved ${res.approved}. Advanced.` : `Approved ${res.approved}. ${res.status === 'completed' ? 'Tournament completed.' : 'Nothing to advance.'}` });
                                                onSuccess();
                                            } catch (e: any) { toast({ variant: 'destructive', title: 'Auto-advance failed', description: e.message }); }
                                        }}>
                                        Auto-Approve + Progress
                                    </Button>
                                </div>
                            </div>
                        )}
                        
                        {/* Cup Format Tools */}
                        {tournament.format === 'cup' && (
                           <div>
                                <h4 className="font-semibold text-xs uppercase tracking-wider text-muted-foreground mt-4 mb-2">Cup Tools</h4>
                                <div className="space-y-2">
                                    <Button variant="secondary" size="sm" className="w-full justify-start text-xs"
                                        onClick={async () => {
                                            try {
                                                const res = await devAutoApproveCurrentStageMatches(tournament.id, user.uid);
                                                toast({ title: 'Done', description: `Auto-approved ${res.approved} match(es).` });
                                                onSuccess();
                                            } catch (e: any) { toast({ variant: 'destructive', title: 'Auto-approve failed', description: e.message }); }
                                        }}>
                                        Auto-Approve Current Stage
                                    </Button>
                                    <Button variant="secondary" size="sm" className="w-full justify-start text-xs"
                                        onClick={async () => {
                                            try {
                                                const res = await devAutoApproveAndProgress(tournament.id, user.uid);
                                                toast({ title: 'Done', description: res.progressed ? `Approved ${res.approved}. Advanced.` : `Approved ${res.approved}. ${res.status === 'completed' ? 'Tournament completed.' : 'Nothing to advance.'}` });
                                                onSuccess();
                                            } catch (e: any) { toast({ variant: 'destructive', title: 'Auto-advance failed', description: e.message }); }
                                        }}>
                                        Auto-Approve + Progress
                                    </Button>
                                    <Button variant="secondary" size="sm" className="w-full justify-start text-xs"
                                        onClick={async () => {
                                            try {
                                                const res = await devAutoRunCupToCompletion(tournament.id, user.uid);
                                                toast({ title: 'Done', description: `Auto-run finished. Status: ${res.status}` });
                                                onSuccess();
                                            } catch (e: any) { toast({ variant: 'destructive', title: 'Auto-run failed', description: e.message }); }
                                        }}>
                                        Auto-Run Cup To Completion
                                    </Button>
                                </div>
                           </div>
                        )}
                    </div>
                </details>
            )}
        </div>
    );
}

function PaymentPrompt({ tournament }: { tournament: Tournament }) {
  const { user } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  const [isPaying, setIsPaying] = useState(false);

  if (tournament.status !== 'pending' || !user || tournament.organizerId !== user.uid) {
    return null;
  }

  const handlePay = async () => {
    setIsPaying(true);
    try {
      const { paymentUrl } = await retryTournamentPayment(tournament.id, user.uid);
      if (paymentUrl) {
        router.push(paymentUrl);
      } else {
        throw new Error("Could not retrieve payment link.");
      }
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
      setIsPaying(false);
    }
  };

  return (
    <Card className="mb-6 bg-amber-50 dark:bg-yellow-500/10 border-amber-300 dark:border-yellow-500/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-amber-800 dark:text-amber-400">
          <Hourglass className="h-5 w-5" />
          Action Required: Complete Payment
        </CardTitle>
        <CardDescription className="text-amber-900/80 dark:text-amber-200/80">
          This tournament is pending payment for the prize pool. Your tournament will become public and open for registration once the payment is successfully completed.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button onClick={handlePay} disabled={isPaying} className="w-full bg-primary hover:bg-primary/90 text-primary-foreground">
          {isPaying ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CreditCard className="mr-2 h-4 w-4" />}
          Complete Payment (₦{tournament.rewardDetails.prizePool.toLocaleString()})
        </Button>
      </CardContent>
    </Card>
  );
}

export default function TournamentPage() {
  const { id } = useParams() as { id: string };
  const searchParams = useSearchParams();
  const tabFromUrl = searchParams.get('tab');
  
  const { user, userProfile } = useAuth();
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [allMatches, setAllMatches] = useState<Match[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [standings, setStandings] = useState<Standing[]>([]);
  const [loading, setLoading] = useState(true);
  const [userTeam, setUserTeam] = useState<Team | null | undefined>(undefined);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [isJoinDialogOpen, setIsJoinDialogOpen] = useState(false);
  const [activeTab, setActiveTab] = useState(tabFromUrl || 'overview');
  const router = useRouter();

  useEffect(() => {
    if (tabFromUrl) {
      setActiveTab(tabFromUrl);
      return;
    }
    if (userTeam) {
      setActiveTab('my-matches');
    }
  }, [userTeam, tabFromUrl]);

  const fetchTournament = useCallback(async () => {
    if (!id) return;
    try {
        const tournamentData = await getTournamentById(id);
        setTournament(tournamentData);
        if (user && tournamentData) {
            const team = await getUserTeamForTournament(tournamentData.id, user.uid);
            setUserTeam(team);
        } else {
            setUserTeam(null);
        }
    } catch (error) {
        console.error("Failed to fetch tournament:", error);
        setTournament(null);
    }
  }, [id, user]);

  // Effect for auto-opening join dialog
  useEffect(() => {
    const action = searchParams.get('action');
    if (action === 'join' && user && !userTeam && tournament && tournament.status === 'open_for_registration') {
      setIsJoinDialogOpen(true);
      // Clean the URL by removing the action parameter
      router.replace(`/tournaments/${tournament.id}`, { scroll: false });
    }
  }, [user, userTeam, searchParams, router, tournament]);


  useEffect(() => {
    setLoading(true);
    fetchTournament().finally(() => setLoading(false));
  }, [id, user, fetchTournament]);

  useEffect(() => {
    if (!id) return;
    const matchesQuery = query(collection(db, `tournaments/${id}/matches`), orderBy("round", "asc"));
    const teamsQuery = query(collection(db, `tournaments/${id}/teams`));
    const standingsQuery = query(collection(db, "standings"), where("tournamentId", "==", id), orderBy("ranking", "asc"));

    const unsubMatches = onSnapshot(matchesQuery, (snapshot) => setAllMatches(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Match))));
    const unsubTeams = onSnapshot(teamsQuery, (snapshot) => setTeams(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Team))));
    const unsubStandings = onSnapshot(standingsQuery, (snapshot) => setStandings(snapshot.docs.map(doc => doc.data() as Standing)));
    
    return () => {
        unsubMatches();
        unsubTeams();
        unsubStandings();
    };
  }, [id]);

  const handleLeave = async () => {
    if (!user || !userTeam || !tournament) return;
    setIsActionLoading(true);
    try {
        await leaveTournament(tournament.id, userTeam.id, user.uid);
        setUserTeam(null); 
    } catch (error: any) {
        // toast({ variant: "destructive", title: "Error", description: error.message });
    } finally {
        setIsActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-screen w-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!tournament) {
      return (
        <div className="container py-24 text-center">
            <h1 className="text-4xl font-bold font-headline">404 - Not Found</h1>
            <p className="text-lg text-muted-foreground mt-4">The tournament you are looking for does not exist or has been deleted.</p>
            <Link href="/tournaments">
                <Button className="mt-8">Back to Tournaments</Button>
            </Link>
        </div>
      )
  }

  const getStatusBadge = (status: TournamentStatus) => {
    const statusMap = {
        pending: { label: 'Pending Payment', className: 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-yellow-600/10 dark:text-yellow-400 dark:border-yellow-500/20' },
        open_for_registration: { label: 'Open for Registration', className: 'bg-green-100 text-green-800 border-green-300 dark:bg-green-600/10 dark:text-green-400 dark:border-green-500/20' },
        generating_fixtures: { label: 'Generating Fixtures', className: 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-yellow-600/10 dark:text-yellow-400 dark:border-yellow-500/20 animate-pulse' },
        ready_to_start: { label: 'Ready to Start', className: 'bg-cyan-100 text-cyan-800 border-cyan-300 dark:bg-cyan-600/10 dark:text-cyan-400 dark:border-cyan-500/20' },
        in_progress: { label: 'In Progress', className: 'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-600/10 dark:text-blue-400 dark:border-blue-500/20' },
        completed: { label: 'Completed', className: 'bg-muted text-muted-foreground border-border' },
    };
    const currentStatus = statusMap[status] || { label: status, className: ''};

    return <Badge variant="secondary" className={currentStatus.className}>{currentStatus.label}</Badge>;
  };
  
  const isOrganizer = user?.uid === tournament.organizerId;
  const isRegistrationOpen = tournament.registrationStartDate && tournament.registrationEndDate && isAfter(new Date(), toDate(tournament.registrationStartDate)) && isBefore(new Date(), endOfDay(toDate(tournament.registrationEndDate)));
  const isPendingPayment = tournament.status === 'pending';
  const canJoin = isRegistrationOpen && !userTeam && tournament.teamCount < tournament.maxTeams && tournament.status === 'open_for_registration';


  return (
    <div className="space-y-6 pb-24 md:pb-8">
        <div className="relative w-full h-auto aspect-[16/9] md:aspect-[21/9] max-h-[400px] overflow-hidden bg-muted group md:rounded-b-lg">
            <Image
                src={tournament.flyerUrl || "/images/Tournament.png"}
                data-ai-hint="esports gaming"
                alt={tournament.name}
                fill
                sizes="100vw"
                style={{objectFit: 'cover'}}
                className="transition-transform group-hover:scale-105"
                priority
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/50 to-transparent" />
            {isOrganizer && <EditFlyerDialog tournament={tournament} />}
        </div>
        <div className="container -mt-16 md:-mt-24 relative z-10">
            {tournament.status === 'completed' && <TournamentPodium tournament={tournament} matches={allMatches} standings={standings} teams={teams} />}
            
            {isPendingPayment && <PaymentPrompt tournament={tournament} />}

            <div className="flex flex-col md:flex-row gap-6 md:gap-8 mt-6 md:mt-8">
                <div className="hidden md:block w-full md:w-1/3 lg:w-1/4 space-y-6">
                    <div className="space-y-4">
                        <div className="space-y-1">{getStatusBadge(tournament.status)}</div>
                        <h1 className="font-headline text-4xl font-bold">{tournament.name}</h1>
                    </div>
                    
                    <div className="space-y-3">
                        <TournamentStatusTimers tournament={tournament} />
                        {isOrganizer && user && <OrganizerTools tournament={tournament} user={user} allMatches={allMatches} onSuccess={fetchTournament} />}
                    </div>

                    {isOrganizer && user && tournament.status === 'ready_to_start' && (
                        <StartTournamentDialog tournament={tournament} organizerId={user.uid} onSuccess={fetchTournament} />
                    )}
                    
                    <div className="pt-4 border-t">
                       {userTeam !== undefined && (
                            userTeam ? (
                                tournament.status === 'open_for_registration' && (
                                    <AlertDialog>
                                        <AlertDialogTrigger asChild>
                                            <Button variant="destructive" className="w-full h-11" disabled={isActionLoading}>
                                                {isActionLoading ? <Loader2 className="animate-spin" /> : "Leave Tournament"}
                                            </Button>
                                        </AlertDialogTrigger>
                                        <AlertDialogContent>
                                            <AlertDialogHeader>
                                                <AlertDialogTitle>Are you sure you want to leave?</AlertDialogTitle>
                                                <AlertDialogDescription>This will remove your team ({userTeam.name}) from the tournament. This action cannot be undone.</AlertDialogDescription>
                                            </AlertDialogHeader>
                                            <AlertDialogFooter>
                                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                <AlertDialogAction onClick={handleLeave}>Confirm & Leave</AlertDialogAction>
                                            </AlertDialogFooter>
                                        </AlertDialogContent>
                                    </AlertDialog>
                                )
                            ) : canJoin ? (
                                user && userProfile ? (
                                    <JoinTournamentDialog 
                                        tournament={tournament}
                                        user={user} 
                                        userProfile={userProfile}
                                        onTeamJoined={(team) => setUserTeam(team)}
                                        open={isJoinDialogOpen}
                                        onOpenChange={setIsJoinDialogOpen}
                                    />
                                ) : (
                                    <Link href={`/login?redirectUrl=${encodeURIComponent(`/tournaments/${tournament.id}`)}&action=join`}>
                                        <Button className="w-full h-11"><PlusCircle className="mr-2"/>Join Tournament</Button>
                                    </Link>
                                )
                            ) : (
                                !isOrganizer && (
                                    <Button className="w-full h-11" disabled>
                                        {isPendingPayment ? 'Awaiting Organizer Payment' : (tournament.status === 'open_for_registration' ? 'Tournament is Full' : 'Registration Closed')}
                                    </Button>
                                )
                            )
                        )}
                    </div>
                     {isOrganizer && <PrizeAllocationEditor tournament={tournament} />}
                </div>

                <div className="md:hidden space-y-3">
                    <div className="space-y-1">{getStatusBadge(tournament.status)}</div>
                    <h1 className="font-headline text-2xl font-bold leading-tight">{tournament.name}</h1>
                    <TournamentStatusTimers tournament={tournament} />
                    <Accordion type="single" collapsible className="rounded-xl border bg-card px-3">
                        <AccordionItem value="details" className="border-0">
                            <AccordionTrigger className="text-sm font-medium py-3 hover:no-underline">
                                Tournament details
                            </AccordionTrigger>
                            <AccordionContent className="space-y-3 pb-4">
                                {isOrganizer && user && <OrganizerTools tournament={tournament} user={user} allMatches={allMatches} onSuccess={fetchTournament} />}
                                {isOrganizer && user && tournament.status === 'ready_to_start' && (
                                    <StartTournamentDialog tournament={tournament} organizerId={user.uid} onSuccess={fetchTournament} />
                                )}
                                {isOrganizer && <PrizeAllocationEditor tournament={tournament} />}
                            </AccordionContent>
                        </AccordionItem>
                    </Accordion>
                </div>

                <div className="w-full md:w-2/3 lg:w-3/4 min-w-0">
                    <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                        <div className="sticky top-14 z-20 -mx-4 border-b border-border/60 bg-background/95 px-4 py-2 backdrop-blur md:static md:mx-0 md:border-0 md:bg-transparent md:px-0 md:py-0">
                            <ScrollArea>
                                <TabsList className="grid w-max grid-flow-col h-11">
                                    <TabsTrigger value="overview" className="gap-1.5 px-3"><Info className="w-4 h-4" /><span className="sm:inline">Info</span></TabsTrigger>
                                    {userTeam && <TabsTrigger value="my-matches" className="gap-1.5 px-3"><Swords className="w-4 h-4" /><span>Matches</span></TabsTrigger>}
                                    <TabsTrigger value="teams" className="gap-1.5 px-3"><Users className="w-4 h-4" /><span>Teams</span></TabsTrigger>
                                    <TabsTrigger value="fixtures" className="gap-1.5 px-3"><BookOpenCheck className="w-4 h-4" /><span className="hidden sm:inline">Fixtures</span><span className="sm:hidden">Fix</span></TabsTrigger>
                                    <TabsTrigger value="standings" className="gap-1.5 px-3"><Trophy className="w-4 h-4" /><span className="hidden sm:inline">Standings</span><span className="sm:hidden">Table</span></TabsTrigger>
                                    <TabsTrigger value="rewards" className="gap-1.5 px-3"><Award className="w-4 h-4" /><span>Prizes</span></TabsTrigger>
                                    <TabsTrigger value="chat" className="gap-1.5 px-3"><Rss className="w-4 h-4" /><span>Chat</span></TabsTrigger>
                                </TabsList>
                                <ScrollBar orientation="horizontal" />
                            </ScrollArea>
                        </div>
                        <TabsContent value="overview" className="mt-4">
                        <OverviewTab tournament={tournament} isOrganizer={isOrganizer} />
                        </TabsContent>
                        {userTeam && 
                            <TabsContent value="my-matches" className="mt-4">
                                <MyMatchesTab tournament={tournament} isOrganizer={isOrganizer} userTeam={userTeam} />
                            </TabsContent>
                        }
                        <TabsContent value="teams" className="mt-4">
                        <TeamsTab tournament={tournament} isOrganizer={isOrganizer} />
                        </TabsContent>
                        <TabsContent value="fixtures" className="mt-4">
                            <FixturesTab tournament={tournament} isOrganizer={isOrganizer} />
                        </TabsContent>
                        <TabsContent value="standings" className="mt-4">
                        <StandingsTab tournament={tournament} />
                        </TabsContent>
                        <TabsContent value="rewards" className="mt-4">
                        <RewardsTab tournament={tournament} />
                        </TabsContent>
                        <TabsContent value="chat" className="mt-4">
                        <CommunicationHub tournament={tournament} isOrganizer={isOrganizer} userTeam={userTeam ?? null}/>
                        </TabsContent>
                    </Tabs>
                </div>
            </div>
        </div>

        {userTeam !== undefined && !isOrganizer && (
          <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom,0px))] z-30 border-t border-border/60 bg-background/95 p-3 backdrop-blur md:hidden">
            {userTeam ? (
              tournament.status === 'open_for_registration' ? (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" className="w-full h-12" disabled={isActionLoading}>
                      {isActionLoading ? <Loader2 className="animate-spin" /> : "Leave Tournament"}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Leave this tournament?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This removes your team ({userTeam.name}). This cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={handleLeave}>Confirm & Leave</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              ) : (
                <Button className="w-full h-12" onClick={() => setActiveTab('my-matches')}>
                  <Swords className="mr-2 h-4 w-4" /> My Matches
                </Button>
              )
            ) : canJoin ? (
              user && userProfile ? (
                <JoinTournamentDialog
                  tournament={tournament}
                  user={user}
                  userProfile={userProfile}
                  onTeamJoined={(team) => setUserTeam(team)}
                  open={isJoinDialogOpen}
                  onOpenChange={setIsJoinDialogOpen}
                />
              ) : (
                <Link href={`/login?redirectUrl=${encodeURIComponent(`/tournaments/${tournament.id}`)}&action=join`}>
                  <Button className="w-full h-12"><PlusCircle className="mr-2"/>Join Tournament</Button>
                </Link>
              )
            ) : (
              <Button className="w-full h-12" disabled>
                {isPendingPayment ? 'Awaiting Payment' : (tournament.status === 'open_for_registration' ? 'Tournament Full' : 'Registration Closed')}
              </Button>
            )}
          </div>
        )}
    </div>
  );
}
