

"use client";

import { useState, useEffect } from "react";
import { db } from "@/lib/firebase";
import { collection, onSnapshot, query, orderBy } from "firebase/firestore";
import type { Match, Team, MatchStatus, MatchReport, TeamMatchStats, UnifiedTimestamp, ReplayRequest, Tournament } from "@/lib/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, CheckCircle, Clock, AlertTriangle, User, MessageSquareQuote, FileText, BarChartHorizontal, Video, Tv, Sparkles, History, Send, Timer } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, DialogClose } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { approveMatchResult, scheduleRematch, setOrganizerStreamUrl, getMatchPrediction, organizerForceReplay, organizerApproveReplay, organizerExtendLeagueDeadline } from "@/lib/actions";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import Image from "next/image";
import { format, isPast, endOfDay } from "date-fns";
import { useAuth } from "@/hooks/use-auth";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../components/ui/select";

const toDate = (timestamp: UnifiedTimestamp): Date => {
    if (typeof timestamp === 'string') {
        return new Date(timestamp);
    }
    if (timestamp && typeof (timestamp as any).toDate === 'function') {
        return (timestamp as any).toDate();
    }
    return timestamp as Date;
};

const ReportCard = ({ title, primaryReport, secondaryReport }: { title: string, primaryReport?: MatchReport, secondaryReport?: MatchReport }) => (
    <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><MessageSquareQuote className="h-4 w-4 text-muted-foreground"/>{title}</CardTitle></CardHeader>
        <CardContent className="space-y-4">
            {primaryReport ? (
                <>
                    <p className="text-sm text-muted-foreground">Primary Report (Match Stats)</p>
                    <p className="text-2xl font-bold text-center">{primaryReport.homeScore} - {primaryReport.awayScore}</p>
                    {primaryReport.evidenceUrl ? (
                         <div className="relative aspect-video w-full">
                           <Image src={primaryReport.evidenceUrl} alt={`Evidence for ${title}`} fill style={{objectFit: 'contain'}} className="rounded-md" unoptimized />
                         </div>
                    ) : (
                        <p className="text-sm text-center text-muted-foreground">No evidence provided.</p>
                    )}
                </>
            ) : (
                <p className="text-sm text-center text-muted-foreground py-8">No primary report submitted.</p>
            )}
             <Separator />
            {secondaryReport ? (
                 <>
                    <p className="text-sm text-muted-foreground">Secondary Report (Match History)</p>
                    {secondaryReport.evidenceUrl ? (
                         <div className="relative aspect-video w-full">
                           <Image src={secondaryReport.evidenceUrl} alt={`Secondary evidence for ${title}`} fill style={{objectFit: 'contain'}} className="rounded-md" unoptimized/>
                         </div>
                    ) : (
                        <p className="text-sm text-center text-muted-foreground">No secondary report submitted.</p>
                    )}
                </>
            ) : (
                 <p className="text-sm text-center text-muted-foreground py-4">No secondary report submitted.</p>
            )}
        </CardContent>
    </Card>
);

function ResolveDisputeDialog({ match, homeTeam, awayTeam }: { match: Match, homeTeam: Team, awayTeam: Team }) {
    const [open, setOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const { toast } = useToast();

    const [homeScore, setHomeScore] = useState<number | "">("");
    const [awayScore, setAwayScore] = useState<number | "">("");
    const [notes, setNotes] = useState("");
    const [rematchNotes, setRematchNotes] = useState("");

    const handleResolve = async () => {
        if (homeScore === "" || awayScore === "") {
            toast({variant: "destructive", title: "Error", description: "Please enter the final scores for both teams."});
            return;
        }
        setIsSubmitting(true);
        try {
            await approveMatchResult(match.tournamentId, match.id, Number(homeScore), Number(awayScore), `Organizer: ${notes}`, true); // true for stats penalty
            toast({ title: "Dispute Resolved", description: "The match result has been approved and standings will update." });
            setOpen(false);
        } catch (error: any) {
            toast({ variant: "destructive", title: "Error", description: error.message || "Failed to resolve dispute." });
        } finally {
            setIsSubmitting(false);
        }
    };
    
    const handleRematch = async () => {
        if (!rematchNotes.trim()) {
            toast({ variant: "destructive", title: "Notes Required", description: "Please provide a reason for the rematch." });
            return;
        }
        setIsSubmitting(true);
        try {
            await scheduleRematch(match.tournamentId, match.id, `Organizer: ${rematchNotes}`);
            toast({ title: "Rematch Scheduled", description: "The teams have been notified to play again." });
            setOpen(false);
        } catch (error: any) {
            toast({ variant: "destructive", title: "Error", description: error.message || "Failed to schedule rematch." });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button size="sm" variant="destructive"><AlertTriangle className="mr-2 h-4 w-4"/>Resolve</Button></DialogTrigger>
            <DialogContent className="max-w-4xl">
                <DialogHeader>
                    <DialogTitle>Resolve Disputed Match</DialogTitle>
                    <DialogDescription>Review the conflicting reports. You can either set the final score manually or order a rematch.</DialogDescription>
                </DialogHeader>
                <ScrollArea className="max-h-[70vh] pr-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 my-4">
                        <ReportCard title={`${homeTeam.name}'s Report`} primaryReport={match.homeTeamReport} secondaryReport={match.homeTeamSecondaryReport} />
                        <ReportCard title={`${awayTeam.name}'s Report`} primaryReport={match.awayTeamReport} secondaryReport={match.awayTeamSecondaryReport} />
                    </div>
                    
                    <Separator className="my-6" />

                    <div>
                        <h4 className="font-semibold mb-2">Option 1: Set Final Score</h4>
                        <div className="grid md:grid-cols-3 gap-4">
                            <div className="space-y-2"><Label htmlFor="finalHomeScore">{homeTeam.name} Final Score</Label><Input id="finalHomeScore" type="number" value={homeScore} onChange={e => setHomeScore(e.target.value === '' ? '' : Number(e.target.value))} required /></div>
                            <div className="space-y-2"><Label htmlFor="finalAwayScore">{awayTeam.name} Final Score</Label><Input id="finalAwayScore" type="number" value={awayScore} onChange={e => setAwayScore(e.target.value === '' ? '' : Number(e.target.value))} required /></div>
                            <div className="space-y-2 md:col-span-3">
                                <Label htmlFor="notes">Organizer's Verdict & Notes (for score approval)</Label>
                                <Textarea id="notes" placeholder="Explain your decision here. This will be visible to both teams." value={notes} onChange={e => setNotes(e.target.value)} />
                            </div>
                        </div>
                         <Button onClick={handleResolve} disabled={isSubmitting} className="mt-4">
                            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>}
                            Approve & Finalize Score
                        </Button>
                    </div>

                    <Separator className="my-6" />

                    <div>
                        <h4 className="font-semibold mb-2">Option 2: Order a Rematch</h4>
                        <div className="space-y-2">
                             <Label htmlFor="rematchNotes">Reason for Rematch</Label>
                             <Textarea id="rematchNotes" placeholder="Explain why a rematch is necessary (e.g., inconclusive evidence, connection issues)." value={rematchNotes} onChange={e => setRematchNotes(e.target.value)} />
                        </div>
                        <Button onClick={handleRematch} variant="secondary" disabled={isSubmitting} className="mt-4">
                            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>}
                            Schedule Rematch
                        </Button>
                    </div>
                </ScrollArea>
                
                <DialogFooter className="mt-4 border-t pt-4">
                    <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
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
            toast({ variant: "destructive", title: "Reason Required", description: "Please provide a reason for ordering a replay." });
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
                <Button size="sm" variant="outline" className="text-xs"><History className="mr-1 h-3 w-3"/>Force Replay</Button>
            </DialogTrigger>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Force Match Replay</DialogTitle>
                    <DialogDescription>
                        This will revert the current result (if any), player stats, and standings for this match and schedule a new one. This action is final.
                    </DialogDescription>
                </DialogHeader>
                <div className="py-4 space-y-2">
                    <Label htmlFor="reason">Reason for replay</Label>
                    <Textarea
                        id="reason"
                        placeholder="e.g., Evidence of unfair play was discovered, or by player request."
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                    />
                </div>
                <DialogFooter>
                    <Button variant="destructive" onClick={handleForceReplay} disabled={isSubmitting}>
                        {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>}
                        Confirm & Order Replay
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function OrganizerApproveReplayButton({ match, organizerId }: { match: Match, organizerId: string }) {
    const { toast } = useToast();
    const [isLoading, setIsLoading] = useState(false);

    const handleApprove = async () => {
        setIsLoading(true);
        try {
            await organizerApproveReplay(match.tournamentId, match.id, organizerId, true);
            toast({title: 'Replay Approved', description: 'The match has been rescheduled.'});
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
            toast({title: 'Replay Rejected', description: 'The original match result stands.'});
        } catch (error: any) {
            toast({ variant: "destructive", title: "Error", description: error.message });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="flex gap-2">
             <AlertDialog>
                <AlertDialogTrigger asChild>
                    <Button size="sm" variant="secondary" disabled={isLoading}><CheckCircle className="mr-2 h-4 w-4" />Approve Replay</Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Approve Replay Request?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Both players have agreed to a replay. Approving will reset this match and schedule it again.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleApprove}>Approve</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
            <Button size="sm" variant="destructive" onClick={handleReject} disabled={isLoading}>Reject</Button>
        </div>
    )
}

function ExtendDeadlineDialog({ match, organizerId, tournamentId }: { match: Match, organizerId: string, tournamentId: string }) {
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
    }

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button size="sm" variant="outline" className="text-xs"><Timer className="mr-1 h-3 w-3"/> Extend Deadline</Button></DialogTrigger>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Extend Match Deadline</DialogTitle>
                    <DialogDescription>
                        Give players more time to complete this league match. If the match was auto-forfeited, this will reset it.
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
    )
}


function SetOrganizerStreamUrlDialog({ matchId, tournamentId, organizerId }: { matchId: string, tournamentId: string, organizerId: string }) {
    const [open, setOpen] = useState(false);
    const [url, setUrl] = useState('');
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
                <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-primary"><Tv className="h-4 w-4"/> </Button>
            </DialogTrigger>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Add Official Live Stream URL</DialogTitle>
                    <DialogDescription>Link a Twitch or YouTube stream for this match.</DialogDescription>
                </DialogHeader>
                <div className="py-4 space-y-2">
                    <Label htmlFor="stream-url">Stream URL</Label>
                    <Input id="stream-url" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://twitch.tv/..." />
                </div>
                <DialogFooter>
                    <Button onClick={handleSave} disabled={isLoading || !url}>
                        {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>}
                        Save Link
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function MatchStatsDialog({ match, homeTeam, awayTeam }: { match: Match; homeTeam: Team; awayTeam: Team }) {
    const hasDetailedStats = match.homeTeamStats && Object.keys(match.homeTeamStats).length > 0;

    const statsMap: { label: string, key: keyof TeamMatchStats }[] = [
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
        if (value === undefined) return 'N/A';
        return key === 'possession' ? `${value}%` : value;
    }

    return (
        <Dialog>
            <DialogTrigger asChild>
                <Button variant="outline" size="sm"><BarChartHorizontal className="mr-2 h-4 w-4"/> View Stats</Button>
            </DialogTrigger>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Match Statistics</DialogTitle>
                    <DialogDescription>{homeTeam.name} vs {awayTeam.name}</DialogDescription>
                </DialogHeader>
                {hasDetailedStats ? (
                    <div className="space-y-2">
                        {statsMap.map(stat => (
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

export function FixturesTab({ tournament, isOrganizer }: { tournament: Tournament, isOrganizer: boolean }) {
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

        const unsubMatches = onSnapshot(matchQuery, snapshot => {
            if (!active) return;
            const matchesData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Match));
            setMatches(matchesData);
            matchesLoaded = true;
            checkDone();
        });

        const unsubTeams = onSnapshot(teamQuery, snapshot => {
            if (!active) return;
            const teamsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Team));
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
    
    const getTeam = (teamId: string) => teams.find(t => t.id === teamId);
    
    const groupedMatches = matches.reduce((acc, match) => {
        const round = match.round || 'Uncategorized';
        if (!acc[round]) acc[round] = [];
        acc[round].push(match);
        return acc;
    }, {} as Record<string, Match[]>);

    return (
        <Card>
            <CardHeader>
                <CardTitle className="font-headline">Full Schedule</CardTitle>
                <CardDescription>The complete list of all matches in the tournament.</CardDescription>
            </CardHeader>
            <CardContent>
                {loading ? (
                    <div className="flex justify-center items-center h-40"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
                ) : matches.length === 0 ? (
                    <p className="text-muted-foreground text-center py-8">Fixtures have not been generated yet.</p>
                ) : (
                    <div className="space-y-6">
                        {Object.entries(groupedMatches).map(([round, roundMatches]) => (
                            <div key={round}>
                                <h3 className="text-lg font-semibold mb-2 font-headline">{round}</h3>
                                <div className="space-y-2">
                                {roundMatches.map(match => (
                                    <MatchListItem key={match.id} match={match} getTeam={getTeam} isOrganizer={isOrganizer} tournament={tournament} />
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

const MatchStatusBadge = ({ status }: { status: MatchStatus }) => {
    const statusInfo = {
        scheduled: { icon: <Clock className="h-3 w-3 mr-1" />, label: 'Scheduled', variant: 'secondary' as const },
        awaiting_confirmation: { icon: <Clock className="h-3 w-3 mr-1" />, label: 'Awaiting Confirmation', className: 'text-amber-500 border-amber-500/50'},
        needs_secondary_evidence: { icon: <AlertTriangle className="h-3 w-3 mr-1" />, label: 'Needs More Evidence', className: 'text-yellow-500 border-yellow-500/50'},
        disputed: { icon: <AlertTriangle className="h-3 w-3 mr-1" />, label: 'Disputed', variant: 'destructive' as const},
        approved: { icon: <CheckCircle className="h-3 w-3 mr-1" />, label: 'Approved', className: 'bg-green-600/80 text-primary-foreground border-transparent'},
    };

    const currentStatus = statusInfo[status] || statusInfo.scheduled;

    return <Badge variant={currentStatus.variant || 'outline'} className={currentStatus.className}>{currentStatus.icon}{currentStatus.label}</Badge>;
}

function MatchListItem({ match, getTeam, isOrganizer, tournament }: { match: Match; getTeam: (id: string) => Team | undefined; isOrganizer: boolean; tournament: Tournament }) {
    const homeTeam = getTeam(match.homeTeamId);
    const awayTeam = getTeam(match.awayTeamId);
    const { user } = useAuth();

    const [prediction, setPrediction] = useState<{ predictedWinnerName: string; confidence: number; reasoning: string } | null>(null);
    const [isPredicting, setIsPredicting] = useState(false);
    const { toast } = useToast();

    const handleGetPrediction = async () => {
        setIsPredicting(true);
        try {
            const result = await getMatchPrediction(match.id, match.tournamentId);
            setPrediction(result);
        } catch (error: any) {
            toast({ variant: 'destructive', title: 'Prediction Failed', description: error.message });
        } finally {
            setIsPredicting(false);
        }
    };
    
    const showOrganizerApproveReplay = isOrganizer && match.replayRequest?.status === 'accepted';
    const isLeagueMatch = tournament?.format === 'league';
    const isOverdue = isPast(endOfDay(toDate(match.matchDay)));

    if (!homeTeam || !awayTeam) return null;
    
    return (
        <div className="border rounded-lg p-3 flex flex-col gap-2 bg-card/50">
            <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2 flex-1 min-w-[150px]">
                    <Avatar className="h-6 w-6">
                        <AvatarImage src={homeTeam.logoUrl} alt={homeTeam.name} />
                        <AvatarFallback><User /></AvatarFallback>
                    </Avatar>
                    <span className="font-medium text-sm text-right truncate">{homeTeam.name}</span>
                </div>
                <div className="text-base font-bold px-4 text-center">
                    {match.status === 'approved' ? `${match.homeScore} - ${match.awayScore}` : 'vs'}
                </div>
                <div className="flex items-center gap-2 flex-1 min-w-[150px] justify-end">
                    <span className="font-medium text-sm truncate">{awayTeam.name}</span>
                    <Avatar className="h-6 w-6">
                        <AvatarImage src={awayTeam.logoUrl} alt={awayTeam.name} />
                        <AvatarFallback><User /></AvatarFallback>
                    </Avatar>
                </div>
                <div className="w-auto text-right flex items-center gap-2">
                    <Badge variant="outline"><Clock className="h-3 w-3 mr-1" />{format(toDate(match.matchDay), 'MMM d')}</Badge>
                    <MatchStatusBadge status={match.status} />
                    {match.status === 'approved' && <MatchStatsDialog match={match} homeTeam={homeTeam} awayTeam={awayTeam} />}
                    <div className="flex gap-1 items-center">
                        {isOrganizer && user && match.status === 'scheduled' && <SetOrganizerStreamUrlDialog matchId={match.id} tournamentId={match.tournamentId} organizerId={user.uid} />}
                        {match.streamLinks && Object.entries(match.streamLinks).map(([key, link]) => (
                            <a href={link.url} target="_blank" rel="noopener noreferrer" key={key} title={`Watch ${link.username}'s stream`}>
                                <Button variant={key === 'organizer' ? 'secondary' : 'ghost'} size="icon" className="h-7 w-7 text-primary hover:bg-primary/10">
                                    <Video className="h-4 w-4"/>
                                </Button>
                            </a>
                        ))}
                    </div>
                </div>
            </div>
            <div className="w-full flex justify-end pt-2 border-t mt-2 gap-2">
                 {isOrganizer && user && <ForceReplayDialog match={match} organizerId={user.uid} />}
                 {isOrganizer && isLeagueMatch && isOverdue && match.status !== 'approved' && user && (
                    <ExtendDeadlineDialog match={match} organizerId={user.uid} tournamentId={tournament.id} />
                 )}
                {(isOrganizer && match.status === 'disputed') && (
                    <ResolveDisputeDialog match={match} homeTeam={homeTeam} awayTeam={awayTeam} />
                )}
                 {showOrganizerApproveReplay && user && (
                    <OrganizerApproveReplayButton match={match} organizerId={user.uid} />
                )}
            </div>

            {match.resolutionNotes && (
                <Alert variant="default" className="text-xs p-3 w-full">
                    <FileText className="h-4 w-4" />
                    <AlertTitle className="font-semibold">Organizer's Verdict</AlertTitle>
                    <AlertDescription>
                        {match.resolutionNotes}
                    </AlertDescription>
                </Alert>
            )}
             {match.status === 'scheduled' && (
                <div className="pt-2 border-t w-full">
                    {!prediction ? (
                        <Button variant="outline" size="sm" onClick={handleGetPrediction} disabled={isPredicting} className="w-full mt-2">
                            {isPredicting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2 text-yellow-400" />}
                            Get AI Prediction
                        </Button>
                    ) : (
                        <Alert className="mt-2 text-xs">
                            <Sparkles className="h-4 w-4" />
                            <AlertTitle>AI Prediction</AlertTitle>
                            <AlertDescription>
                                <strong>Winner:</strong> {prediction.predictedWinnerName} (Confidence: {prediction.confidence}%)
                                <br />
                                <span className="italic">"{prediction.reasoning}"</span>
                            </AlertDescription>
                        </Alert>
                    )}
                </div>
            )}
        </div>
    )
}

    