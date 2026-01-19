

'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { getTournamentById, organizerResolveOverdueMatches, extendRegistration, startTournamentAndGenerateFixtures, regenerateTournamentFixtures, devSeedDummyTeams, devAutoApproveCurrentStageMatches, devAutoApproveAndProgress, devAutoRunCupToCompletion, retryTournamentPayment, rescheduleTournament, recalculateStandings, progressTournamentStage } from '@/lib/actions';
import { getUserTeamForTournament, leaveTournament, addTeam } from '@/lib/actions';
import { findUserByEmail } from '@/lib/actions';
import { useAuth } from "@/hooks/use-auth";
import type { Tournament, TournamentStatus, Team, Player, UserProfile, UnifiedTimestamp, Match, Standing } from "@/lib/types";
import { format, isBefore, isAfter, isToday, isFuture, addDays, differenceInDays, endOfDay, isPast } from "date-fns";
import { collection, onSnapshot, query, where, orderBy } from 'firebase/firestore';
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
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from "@/hooks/use-toast";
import Image from "next/image";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { storage } from '@/lib/firebase';
import { CommunicationHub } from './communication-hub';
import { cn, toDate } from "@/lib/utils";
import { useCountdown } from '@/hooks/use-countdown';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarPicker } from '@/components/ui/calendar';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from '@/components/ui/textarea';
import { TournamentPodium } from '@/components/tournament-podium';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { PrizeAllocationEditor } from './prize-allocation';

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

function JoinTournamentDialog({ tournament, user, userProfile, onTeamJoined }: { tournament: Tournament, user: UserProfile, userProfile: UserProfile, onTeamJoined: (team: Team) => void }) {
    const { toast } = useToast();
    const [open, setOpen] = useState(false);
    // Auto-load saved team name from localStorage
    const [teamName, setTeamName] = useState(() => {
        if (typeof window !== 'undefined') {
            return localStorage.getItem('lastTeamName') || '';
        }
        return '';
    });
    const [teamLogo, setTeamLogo] = useState<File | null>(null);
    const [previewLogo, setPreviewLogo] = useState<string | null>(userProfile?.photoURL || null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [captainProfile, setCaptainProfile] = useState<UserProfile | null>(null);

     useEffect(() => {
        if(user?.uid) {
            const fetchProfile = async () => {
                const profile = await findUserByEmail(user.email!);
                setCaptainProfile(profile);
            };
            fetchProfile();
        }
    }, [user]);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setTeamLogo(file);
            setPreviewLogo(URL.createObjectURL(file));
        } else {
            setTeamLogo(null);
            setPreviewLogo(userProfile?.photoURL || null);
        }
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!teamName || !user || !userProfile) {
            toast({ variant: "destructive", title: "Error", description: "You must be logged in and provide a team name." });
            return;
        }

        // Save team name to localStorage for next time
        if (typeof window !== 'undefined') {
            localStorage.setItem('lastTeamName', teamName);
        }

        if(captainProfile?.warnings && captainProfile.warnings >= 5) {
             toast({ variant: "destructive", title: "Registration Flagged", description: "Your account has multiple warnings. The tournament organizer must manually approve your registration." });
        }

        setIsSubmitting(true);
        try {
            let logoUrl = "";
            if (teamLogo) {
                const storageRef = ref(storage, `tournaments/${tournament.id}/logos/${Date.now()}_${teamLogo.name}`);
                const snapshot = await uploadBytes(storageRef, teamLogo);
                logoUrl = await getDownloadURL(snapshot.ref);
            } else if (previewLogo) {
                logoUrl = previewLogo;
            }

            const captain: Player = {
                uid: user.uid,
                role: 'captain',
                username: userProfile.username || 'Captain',
                photoURL: userProfile.photoURL || '',
            };

            const newTeam = await addTeam(tournament.id, { name: teamName, logoUrl, captainId: user.uid, captain });

            toast({ title: "Success!", description: `Your team "${teamName}" has joined the tournament.` });
            onTeamJoined(newTeam);
            setOpen(false);
        } catch (error: any) {
            toast({ variant: "destructive", title: "Error", description: error.message || "Failed to create team." });
        } finally {
            setIsSubmitting(false);
        }
    };
    
    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button className="w-full"><PlusCircle className="mr-2"/>Join Tournament</Button>
            </DialogTrigger>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Join {tournament.name}</DialogTitle>
                    <DialogDescription>Create your team to enter the competition.</DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                     <div className="flex items-center gap-4">
                        <div className="relative h-24 w-24 rounded-full border-2 border-dashed flex items-center justify-center bg-muted/50">
                            {previewLogo ? (
                                <Image src={previewLogo} alt="Team logo preview" fill style={{ objectFit: 'cover' }} className="rounded-full" unoptimized/>
                            ) : (
                                <Users className="h-10 w-10 text-muted-foreground" />
                            )}
                        </div>
                        <div className="space-y-2 flex-1">
                            <Label htmlFor="logo">Team Logo (Optional)</Label>
                            <Input id="logo" type="file" onChange={handleFileChange} accept="image/*" />
                            <p className="text-xs text-muted-foreground">Defaults to your profile picture.</p>
                        </div>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="teamName">Team Name <span className="text-destructive">*</span></Label>
                        <Input id="teamName" value={teamName} onChange={e => setTeamName(e.target.value)} required placeholder="e.g., The All-Stars" />
                        <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800">
                            <Info className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
                            <p className="text-xs text-blue-800 dark:text-blue-200">
                                <strong>Important:</strong> Your team name must <strong>exactly match</strong> your in-game team name. 
                                This is required for AI verification of match screenshots. The system will use this name to verify your submitted evidence.
                            </p>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button type="submit" className="w-full" disabled={isSubmitting}>
                            {isSubmitting ? <Loader2 className="animate-spin mr-2" /> : <PlusCircle className="mr-2" />}
                            Create Team & Join
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
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
    <Card className="mb-6 bg-yellow-500/10 border-yellow-500/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-yellow-400">
          <Hourglass className="h-5 w-5" />
          Action Required: Complete Payment
        </CardTitle>
        <CardDescription className="text-yellow-200/80">
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
  const defaultTab = searchParams.get('tab') || 'overview';
  
  const { user, userProfile } = useAuth();
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [allMatches, setAllMatches] = useState<Match[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [standings, setStandings] = useState<Standing[]>([]);
  const [loading, setLoading] = useState(true);
  const [userTeam, setUserTeam] = useState<Team | null | undefined>(undefined);
  const [isActionLoading, setIsActionLoading] = useState(false);

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
        // Do not toast here as it can be annoying on re-renders
        setTournament(null);
    }
  }, [id, user]);


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
        pending: { label: 'Pending Payment', className: 'bg-yellow-600/10 text-yellow-400 border-yellow-500/20' },
        open_for_registration: { label: 'Open for Registration', className: 'bg-green-600/10 text-green-400 border-green-500/20' },
        generating_fixtures: { label: 'Generating Fixtures', className: 'bg-yellow-600/10 text-yellow-400 border-yellow-500/20 animate-pulse' },
        ready_to_start: { label: 'Ready to Start', className: 'bg-cyan-600/10 text-cyan-400 border-cyan-500/20' },
        in_progress: { label: 'In Progress', className: 'bg-blue-600/10 text-blue-400 border-blue-500/20' },
        completed: { label: 'Completed', className: 'bg-gray-600/10 text-gray-400 border-gray-500/20' },
    };
    const currentStatus = statusMap[status] || { label: status, className: ''};

    return <Badge variant="secondary" className={currentStatus.className}>{currentStatus.label}</Badge>;
  };
  
  const isOrganizer = user?.uid === tournament.organizerId;
  const isRegistrationOpen = tournament.registrationStartDate && tournament.registrationEndDate && isAfter(new Date(), toDate(tournament.registrationStartDate)) && isBefore(new Date(), endOfDay(toDate(tournament.registrationEndDate)));
  const isPendingPayment = tournament.status === 'pending';
  const canJoin = isRegistrationOpen && !userTeam && !isOrganizer && tournament.status === 'open_for_registration';

  return (
    <div className="relative min-h-[calc(100vh-3.5rem)]">
        <Image
            src={tournament.flyerUrl || "/images/Tournament.png"}
            data-ai-hint="esports gaming"
            alt={tournament.name}
            fill
            sizes="100vw"
            style={{objectFit: 'cover'}}
            className="absolute inset-0 z-[-1] opacity-10"
            priority
        />
        <div className="container py-10 relative z-10">
            {tournament.status === 'completed' && <TournamentPodium tournament={tournament} matches={allMatches} standings={standings} teams={teams} />}
            
            {isPendingPayment && <PaymentPrompt tournament={tournament} />}

            <div className="flex flex-col md:flex-row gap-8 mt-8">
                <div className="w-full md:w-1/3 lg:w-1/4 space-y-6">
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
                    
                    {user && userProfile && userTeam !== undefined && !isOrganizer && (
                        <div className="pt-4 border-t">
                        {userTeam ? (
                            tournament.status === 'open_for_registration' && (
                                <AlertDialog>
                                <AlertDialogTrigger asChild>
                                    <Button variant="destructive" className="w-full" disabled={isActionLoading}>
                                    {isActionLoading ? <Loader2 className="animate-spin" /> : "Leave Tournament"}
                                    </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                    <AlertDialogHeader>
                                    <AlertDialogTitle>Are you sure you want to leave?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                        This will remove your team ({userTeam.name}) from the tournament. This action cannot be undone.
                                    </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction onClick={handleLeave}>Confirm & Leave</AlertDialogAction>
                                    </AlertDialogFooter>
                                </AlertDialogContent>
                                </AlertDialog>
                            )
                        ) : canJoin ? (
                            <JoinTournamentDialog 
                            tournament={tournament}
                            user={user} 
                            userProfile={userProfile}
                            onTeamJoined={(team) => setUserTeam(team)}
                            />
                        ) : (
                            <Button className="w-full" disabled>
                                {isPendingPayment ? 'Awaiting Organizer Payment' : (tournament.status === 'open_for_registration' ? 'Tournament is Full' : 'Registration Closed')}
                            </Button>
                        )}
                        </div>
                    )}
                     {isOrganizer && <PrizeAllocationEditor tournament={tournament} />}
                </div>

                <div className="w-full md:w-2/3 lg:w-3/4">
                    <Tabs defaultValue={defaultTab} className="w-full">
                        <div className="relative">
                            <ScrollArea>
                                <TabsList className="grid w-max grid-flow-col">
                                    <TabsTrigger value="overview"><Info className="w-4 h-4 mr-2 sm:hidden md:inline-block"/>Overview</TabsTrigger>
                                    {userTeam && <TabsTrigger value="my-matches"><Swords className="w-4 h-4 mr-2 sm:hidden md:inline-block"/>My Matches</TabsTrigger>}
                                    <TabsTrigger value="teams"><Users className="w-4 h-4 mr-2 sm:hidden md:inline-block"/>Teams</TabsTrigger>
                                    <TabsTrigger value="fixtures"><BookOpenCheck className="w-4 h-4 mr-2 sm:hidden md:inline-block"/>Fixtures</TabsTrigger>
                                    <TabsTrigger value="standings"><Trophy className="w-4 h-4 mr-2 sm:hidden md:inline-block"/>Standings</TabsTrigger>
                                    <TabsTrigger value="rewards"><Award className="w-4 h-4 mr-2 sm:hidden md:inline-block"/>Rewards</TabsTrigger>
                                    <TabsTrigger value="chat"><Rss className="w-4 h-4 mr-2 sm:hidden md:inline-block"/>Chat</TabsTrigger>
                                </TabsList>
                                <ScrollBar orientation="horizontal" />
                            </ScrollArea>
                        </div>
                        <TabsContent value="overview" className="mt-4">
                        <OverviewTab tournament={tournament} />
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
                        <CommunicationHub tournament={tournament} isOrganizer={isOrganizer} userTeam={userTeam}/>
                        </TabsContent>
                    </Tabs>
                </div>
            </div>
        </div>
    </div>
  );
}
