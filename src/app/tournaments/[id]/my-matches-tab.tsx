
"use client";

import { useState, useEffect, useRef } from "react";
import { db, storage } from "@/lib/firebase";
import { collection, onSnapshot, query, type Timestamp, orderBy, doc, updateDoc, getDocs } from "firebase/firestore";
import type { Match, Team, MatchReport, MatchStatus, Tournament, Player, ChatMessage, UserProfile, TeamMatchStats, UnifiedTimestamp, ReplayRequest } from "@/lib/types";
import { useAuth } from "@/hooks/use-auth";
import { useCountdown } from "@/hooks/use-countdown";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, DialogClose } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { approveMatchResult, submitMatchResult, transferHost, setMatchRoomCode, postMatchMessage, deleteMatchReport, submitSecondaryEvidence, getMatchPrediction, scheduleRematch, submitPlayerStreamUrl, requestPlayerReplay, respondToPlayerReplay, organizerForceReplayProblematicMatches, deleteMatchMessage } from "@/lib/actions";
import { Loader2, CheckCircle, Clock, AlertTriangle, User, MessageSquareQuote, FileText, BarChartHorizontal, Video, Tv, Sparkles, History, Send, Handshake, Trash2, Upload, Copy, Check, ArrowRightLeft, Swords, Info, Timer, Hourglass, Bot, MessageCircle } from "lucide-react";
import { format, formatDistanceToNow, isToday, isFuture, endOfDay, isPast } from "date-fns";
import { Badge } from "@/components/ui/badge";
import Link from 'next/link';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import Image from "next/image";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../components/ui/select";
import { Separator } from "@/components/ui/separator";

const toDate = (timestamp: UnifiedTimestamp): Date => {
    if (typeof timestamp === 'string') {
        return new Date(timestamp);
    }
    if (timestamp && typeof (timestamp as any).toDate === 'function') {
        return (timestamp as any).toDate();
    }
    return timestamp as Date;
};

const ChatMessageDisplay = ({ messages, currentUser, isOrganizer, tournamentId, matchId }: { messages: ChatMessage[]; currentUser: UserProfile | null, isOrganizer: boolean, tournamentId: string, matchId: string }) => {
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
            toast({ title: "Message Deleted" });
        } catch (error: any) {
            toast({ variant: 'destructive', title: "Error", description: error.message });
        } finally {
            setIsDeleting(null);
        }
    };

    if (!messages.length) {
        return <p className="text-center text-muted-foreground py-8">No messages yet. Start the conversation!</p>;
    }

    return (
        <ScrollArea className="h-72 w-full pr-4" ref={scrollAreaRef as any}>
            <div className="space-y-4">
                {messages.map(msg => {
                    const isCurrentUser = msg.userId === currentUser?.uid;
                    return (
                        <div key={msg.id} className={cn("flex items-start gap-3 group", isCurrentUser ? "flex-row-reverse" : "")}>
                             <Avatar className="h-8 w-8">
                                <AvatarImage src={msg.photoURL} alt={msg.username}/>
                                <AvatarFallback>{msg.username.charAt(0)}</AvatarFallback>
                            </Avatar>
                            <div className={cn("rounded-lg p-3 max-w-xs md:max-w-md", isCurrentUser ? "bg-primary text-primary-foreground" : "bg-muted")}>
                                {!isCurrentUser && <p className="text-xs font-bold pb-1">{msg.username}</p>}
                                <p className="text-sm whitespace-pre-wrap">{msg.message}</p>
                                <p className="text-xs opacity-70 pt-1 text-right">
                                    {msg.timestamp ? formatDistanceToNow(toDate(msg.timestamp), { addSuffix: true }) : 'sending...'}
                                </p>
                            </div>
                            {isOrganizer && !isCurrentUser && (
                                <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                        <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity" disabled={isDeleting === msg.id}>
                                            {isDeleting === msg.id ? <Loader2 className="h-4 w-4 animate-spin"/> : <Trash2 className="h-4 w-4 text-destructive"/>}
                                        </Button>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent>
                                        <AlertDialogHeader><AlertDialogTitle>Delete Message?</AlertDialogTitle><AlertDialogDescription>This will permanently delete the message from the chat. This cannot be undone.</AlertDialogDescription></AlertDialogHeader>
                                        <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => handleDelete(msg.id)} className="bg-destructive hover:bg-destructive/90">Delete</AlertDialogAction></AlertDialogFooter>
                                    </AlertDialogContent>
                                </AlertDialog>
                            )}
                        </div>
                    );
                })}
            </div>
        </ScrollArea>
    );
};

// ChatInput Component
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

const MatchChatDialog = ({ match, homeTeamName, awayTeamName, isMatchDay, isOrganizer }: { match: Match; homeTeamName: string, awayTeamName: string, isMatchDay: boolean, isOrganizer: boolean }) => {
    const { user, userProfile } = useAuth();
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const { toast } = useToast();

    useEffect(() => {
        const q = query(collection(db, `tournaments/${match.tournamentId}/matches/${match.id}/messages`), orderBy("timestamp", "asc"));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const msgs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ChatMessage));
            setMessages(msgs);
        });
        return () => unsubscribe();
    }, [match.tournamentId, match.id]);

    const handleSendMessage = async (message: string) => {
        if (!user || !userProfile) {
            toast({ variant: "destructive", title: "Error", description: "You must be logged in to chat." });
            return;
        }
        await postMatchMessage(match.tournamentId, match.id, user.uid, userProfile.username || user.email!, userProfile.photoURL || '', message);
    };

    return (
        <Dialog>
            <DialogTrigger asChild>
                <Button variant="outline" size="sm" disabled={!isMatchDay}><MessageCircle className="h-4 w-4 mr-2" /> Match Chat</Button>
            </DialogTrigger>
            <DialogContent>
                 <DialogHeader>
                    <DialogTitle>Chat: {homeTeamName} vs {awayTeamName}</DialogTitle>
                    <DialogDescription>Coordinate with your opponent for this match.</DialogDescription>
                </DialogHeader>
                <div className="flex flex-col h-full">
                    <ChatMessageDisplay messages={messages} currentUser={userProfile} isOrganizer={isOrganizer} tournamentId={match.tournamentId} matchId={match.id} />
                    <ChatInput onSendMessage={handleSendMessage} />
                </div>
            </DialogContent>
        </Dialog>
    );
};


const RoomCodeManager = ({ match, isMatchDay }: { match: Match, isMatchDay: boolean }) => {
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
            toast({ title: "Success", description: "Room code saved." });
            setOpen(false);
        } catch (error: any) {
            toast({ variant: "destructive", title: "Error", description: error.message });
        } finally {
            setIsLoading(false);
        }
    };

    const handleCopy = () => {
        if (!match.roomCode) return;
        navigator.clipboard.writeText(match.roomCode);
        setHasCopied(true);
        setTimeout(() => setHasCopied(false), 2000);
    }

    if (isHost) {
        return (
            <Dialog open={open} onOpenChange={setOpen}>
                <DialogTrigger asChild>
                    <Button variant="outline" size="sm" disabled={!isMatchDay}>{match.roomCode ? "Edit Code" : "Set Room Code"}</Button>
                </DialogTrigger>
                <DialogContent>
                     <DialogHeader>
                        <DialogTitle>Set Match Room Code</DialogTitle>
                        <DialogDescription>Enter the 8-digit code for your friendly match room.</DialogDescription>
                    </DialogHeader>
                    <div className="py-4 space-y-2">
                        <Label htmlFor="room-code">Room Code</Label>
                        <Input id="room-code" value={code} onChange={e => setCode(e.target.value)} maxLength={8} />
                    </div>
                    <DialogFooter>
                        <Button onClick={handleSaveCode} disabled={isLoading || code.length < 8}>
                            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>}
                            Save Code
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        )
    }

    if (match.roomCode) {
        return (
            <div className="flex items-center gap-2">
                <span className="text-sm font-semibold">Room Code:</span>
                <span className="font-mono bg-muted px-2 py-1 rounded-md">{match.roomCode}</span>
                <Button variant="ghost" size="icon" onClick={handleCopy}>
                    {hasCopied ? <Check className="h-4 w-4 text-green-500"/> : <Copy className="h-4 w-4"/>}
                </Button>
            </div>
        )
    }

    return <span className="text-sm text-muted-foreground">{!isMatchDay ? "Room code will be available on match day." : "Waiting for host to create room..."}</span>
}


export function MyMatchesTab({ tournament, isOrganizer, userTeam }: { tournament: Tournament, isOrganizer: boolean, userTeam: Team | null }) {
    const [matches, setMatches] = useState<Match[]>([]);
    const [teams, setTeams] = useState<Team[]>([]);
    const [loading, setLoading] = useState(true);
    
    useEffect(() => {
        if (!userTeam) {
            setLoading(false);
            return;
        }

        let active = true;
        const matchQuery = query(collection(db, `tournaments/${tournament.id}/matches`));
        const teamQuery = query(collection(db, `tournaments/${tournament.id}/teams`));

        let teamsLoaded = false;
        let matchesLoaded = false;

        const checkDone = () => {
            if (active && teamsLoaded && matchesLoaded) setLoading(false);
        };

        const unsubMatches = onSnapshot(matchQuery, snapshot => {
            if (!active) return;
            const allMatches = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Match));
            const myMatches = allMatches.filter(m => m.homeTeamId === userTeam.id || m.awayTeamId === userTeam.id);
            const sortedMatches = myMatches.sort((a,b) => (a.round || "").localeCompare(b.round || ""));
            setMatches(sortedMatches);
            matchesLoaded = true;
            checkDone();
        });

        const unsubTeams = onSnapshot(teamQuery, snapshot => {
            if (!active) return;
            const teamsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }) as Team);
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
    
    const getTeam = (teamId: string) => teams.find(t => t.id === teamId);
    
    return (
        <Card>
            <CardHeader>
                <CardTitle className="font-headline flex items-center gap-2"><Swords />My Matches</CardTitle>
                <CardDescription>Your personal match schedule and reporting hub.</CardDescription>
            </CardHeader>
            <CardContent>
                {loading ? (
                    <div className="flex justify-center items-center h-40"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
                ) : matches.length === 0 ? (
                    <p className="text-muted-foreground text-center py-8">Your matches will appear here once fixtures are generated.</p>
                ) : (
                    <div className="space-y-4">
                        {matches.map(match => (
                            <MatchCard key={match.id} match={match} teams={teams} getTeam={getTeam} userTeam={userTeam} isOrganizer={isOrganizer} />
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
        disputed: { icon: <AlertTriangle className="h-3 w-3 mr-1" />, label: 'Disputed', variant: 'destructive' as const },
        approved: { icon: <CheckCircle className="h-3 w-3 mr-1" />, label: 'Approved', className: 'bg-green-600/80 text-primary-foreground border-transparent'},
    };
    const currentStatus = statusInfo[status] || statusInfo.scheduled;
    return <Badge variant={currentStatus.variant || 'outline'} className={currentStatus.className}>{currentStatus.icon}{currentStatus.label}</Badge>;
}

const MatchDayCountdown = ({ matchDay }: { matchDay: UnifiedTimestamp }) => {
    const endOfDayMatchDay = new Date(toDate(matchDay));
    endOfDayMatchDay.setHours(23, 59, 59, 999);

    const countdown = useCountdown(endOfDayMatchDay);

    if (countdown.isFinished) {
        return <span className="text-sm text-destructive font-semibold">Match day ended. Awaiting automated resolution.</span>
    }

    return (
        <div className="flex items-center gap-2 text-sm font-semibold text-primary">
            <Timer className="h-4 w-4" />
            <span>Reporting closes in:</span>
            <span className="font-mono">{String(countdown.hours).padStart(2, '0')}:{String(countdown.minutes).padStart(2, '0')}:{String(countdown.seconds).padStart(2, '0')}</span>
        </div>
    );
};

function MatchCard({ match, teams, getTeam, userTeam, isOrganizer }: { match: Match; teams: Team[]; getTeam: (id: string) => Team | undefined; userTeam: Team | null; isOrganizer: boolean }) {
    const { user } = useAuth();
    const homeTeam = getTeam(match.homeTeamId);
    const awayTeam = getTeam(match.awayTeamId);

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
    

    if (!homeTeam || !awayTeam || !userTeam || !user) return null;
    
    const isMatchDay = isToday(toDate(match.matchDay));
    const isPastMatchDay = isPast(endOfDay(toDate(match.matchDay)));

    const isHomeCaptain = user?.uid === homeTeam.captainId;
    const isAwayCaptain = user?.uid === awayTeam.captainId;
    
    const hasHomeReported = !!match.homeTeamReport;
    const hasAwayReported = !!match.awayTeamReport;
    const hasHomeSecondaryReported = !!match.homeTeamSecondaryReport;
    const hasAwaySecondaryReported = !!match.awayTeamSecondaryReport;

    const canHomeReport = isHomeCaptain && !hasHomeReported && isMatchDay;
    const canAwayReport = isAwayCaptain && !hasAwayReported && isMatchDay;
    const showReportButton = (canHomeReport || canAwayReport) && match.status !== 'approved' && match.status !== 'disputed' && match.status !== 'needs_secondary_evidence';
    
    const canHomeDelete = isHomeCaptain && hasHomeReported && match.status === 'awaiting_confirmation';
    const canAwayDelete = isAwayCaptain && hasAwayReported && match.status === 'awaiting_confirmation';

    const canSubmitSecondaryHome = isHomeCaptain && !hasHomeSecondaryReported && isMatchDay;
    const canSubmitSecondaryAway = isAwayCaptain && !hasAwaySecondaryReported && isMatchDay;
    const showSecondaryButton = match.status === 'needs_secondary_evidence' && (canSubmitSecondaryHome || canSubmitSecondaryAway);
    
    const hostTeamName = getTeam(match.hostId)?.name || 'N/A';
    const isHostCaptain = user?.uid === getTeam(match.hostId)?.captainId;
    
    const replayRequest = match.replayRequest;
    const isMyTeam = userTeam.id === homeTeam.id || userTeam.id === awayTeam.id;
    const canRequestReplay = isMyTeam && !replayRequest && match.status === 'scheduled';
    const opponentId = user.uid === homeTeam.captainId ? awayTeam.captainId : homeTeam.captainId;
    const canRespondToReplay = user.uid === opponentId && replayRequest?.status === 'pending';


    return (
        <div className="border rounded-lg p-4 space-y-4 bg-card/50 transition-colors hover:bg-card">
            <div className="flex justify-between items-start flex-wrap gap-2">
                <div className="flex items-center gap-2">
                    <MatchStatusBadge status={match.status} />
                    <Badge variant="outline"><Clock className="h-3 w-3 mr-1" />{format(toDate(match.matchDay), 'MMM d, yyyy')}</Badge>
                    <span className="text-xs text-muted-foreground">{match.round}</span>
                </div>
                <div className="flex gap-2">
                    {showReportButton && (
                         <ReportScoreDialog match={match} teamToReportFor={canHomeReport ? homeTeam : awayTeam} homeTeamName={homeTeam.name} awayTeamName={awayTeam.name} />
                    )}
                    {showSecondaryButton && (
                        <SubmitSecondaryEvidenceDialog match={match} teamToReportFor={canSubmitSecondaryHome ? homeTeam : awayTeam} />
                    )}
                    {(canHomeDelete || canAwayDelete) && (
                        <DeleteReportButton match={match} userId={user!.uid} />
                    )}
                </div>
            </div>
            <div className="flex justify-between items-center text-center">
                <div className="flex-1 font-semibold text-lg">{homeTeam.name}</div>
                <div className="text-2xl font-bold px-4">
                    {match.status === 'approved' ? `${match.homeScore} - ${match.awayScore}` : 'vs'}
                </div>
                <div className="flex-1 font-semibold text-lg">{awayTeam.name}</div>
            </div>
            <div className="border-t pt-3 mt-2 text-sm text-muted-foreground space-y-3">
                <div className="flex justify-between items-center flex-wrap gap-2">
                    <span>Host: <span className="font-semibold text-foreground">{hostTeamName}</span></span>
                    {isHostCaptain && match.status === 'scheduled' && isMatchDay && <TransferHostButton matchId={match.id} tournamentId={match.tournamentId}/>}
                </div>
                 <div className="flex justify-between items-center flex-wrap gap-2">
                    <RoomCodeManager match={{...match, host: getTeam(match.hostId)}} isMatchDay={isMatchDay} />
                </div>
                {match.hostTransferRequested && (
                    <Alert variant="default" className="text-xs p-2">
                        <ArrowRightLeft className="h-4 w-4" />
                        <AlertTitle>Host Transfer</AlertTitle>
                        <AlertDescription>
                            {isHostCaptain ? "You are now the host. Please create the room." : "The original host has requested a host transfer."}
                        </AlertDescription>
                    </Alert>
                )}
            </div>
            
            <div className="flex justify-between items-center border-t pt-3 mt-3">
                 {(hasHomeReported || hasAwayReported) ? (
                    <div className="text-xs text-muted-foreground flex gap-4">
                        <span>Home Reported: {hasHomeReported ? '✔️' : '❌'}</span>
                        <span>Away Reported: {hasAwayReported ? '✔️' : '❌'}</span>
                    </div>
                ) : <div/>}
                <div className="flex flex-wrap gap-2 justify-end">
                    {match.highlightUrl && (
                        <a href={match.highlightUrl} target="_blank" rel="noopener noreferrer">
                            <Button variant="outline" size="sm"><Video className="h-4 w-4 mr-2" /> View Highlight</Button>
                        </a>
                    )}
                    {match.status === 'approved' && <MatchStatsDialog match={match} homeTeam={homeTeam} awayTeam={awayTeam} />}
                    <MatchChatDialog match={match} homeTeamName={homeTeam.name} awayTeamName={awayTeam.name} isMatchDay={isMatchDay} isOrganizer={isOrganizer} />
                </div>
            </div>
            
             <div className="flex justify-between items-center border-t pt-3 mt-3 flex-wrap gap-2">
                <span className="text-sm font-semibold">Live Streams</span>
                <div className="flex gap-2 flex-wrap justify-end">
                    {match.streamLinks && Object.entries(match.streamLinks).map(([key, link]) => (
                        <Button asChild size="sm" key={key} variant={key === 'organizer' ? 'default' : 'secondary'}>
                            <a href={link.url} target="_blank" rel="noopener noreferrer">
                                <Tv className="h-4 w-4 mr-2" /> Watch {link.username}
                            </a>
                        </Button>
                    ))}
                    <SetPlayerStreamUrlDialog match={match} userTeam={userTeam} />
                </div>
            </div>

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
            
            {replayRequest && (
                <Alert className="mt-2 text-xs" variant={replayRequest.status === 'accepted' ? 'default' : 'destructive'}>
                    <Handshake className="h-4 w-4" />
                    <AlertTitle>Replay Request: {replayRequest.status}</AlertTitle>
                    <AlertDescription>
                       Reason: {replayRequest.reason}
                    </AlertDescription>
                </Alert>
            )}

            <div className="flex justify-end pt-2">
                {canRequestReplay && <RequestReplayDialog match={match} />}
                {canRespondToReplay && <RespondToReplayDialog match={match} />}
            </div>

             {isMatchDay && match.status !== 'approved' && (
                <div className="border-t pt-3 mt-3">
                    <MatchDayCountdown matchDay={match.matchDay} />
                </div>
            )}

            {!isMatchDay && !isPastMatchDay && (
                <Alert variant="default" className="text-xs p-3 mt-2">
                    <Info className="h-4 w-4" />
                    <AlertTitle className="font-semibold">Match Locked</AlertTitle>
                    <AlertDescription>
                        You can interact with this match on its scheduled day: {format(toDate(match.matchDay), 'PPP')}.
                    </AlertDescription>
                </Alert>
            )}

            {match.resolutionNotes && (
                 <Alert variant="default" className="text-xs p-3 mt-2">
                    <FileText className="h-4 w-4" />
                    <AlertTitle className="font-semibold">Organizer's Verdict</AlertTitle>
                    <AlertDescription>
                        {match.resolutionNotes}
                    </AlertDescription>
                </Alert>
            )}
        </div>
    )
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


function TransferHostButton({ matchId, tournamentId }: { matchId: string, tournamentId: string }) {
    const { user } = useAuth();
    const { toast } = useToast();
    const [isLoading, setIsLoading] = useState(false);

    const handleTransfer = async () => {
        if (!user) return;
        setIsLoading(true);
        try {
            await transferHost(tournamentId, matchId, user.uid);
            toast({ title: 'Host Transferred', description: 'The away team is now responsible for creating the room.' });
        } catch (error: any) {
            toast({ variant: "destructive", title: "Error", description: error.message || "Failed to transfer host." });
        } finally {
            setIsLoading(false);
        }
    }

    return (
        <Button size="sm" variant="outline" onClick={handleTransfer} disabled={isLoading}>
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin"/> : <ArrowRightLeft className="h-4 w-4 mr-2"/>}
            Transfer Host
        </Button>
    )
}

function ReportScoreDialog({ match, teamToReportFor, homeTeamName, awayTeamName }: { match: Match; teamToReportFor: Team; homeTeamName: string, awayTeamName: string }) {
    const [open, setOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const { toast } = useToast();
    const { user } = useAuth();

    const handleFormAction = async (formData: FormData) => {
        if (!user) {
            toast({ variant: 'destructive', title: 'Error', description: 'You must be logged in.' });
            return;
        }

        const homeScore = formData.get('homeScore');
        const awayScore = formData.get('awayScore');
        const evidence = formData.get('evidence') as File;

        if (homeScore === null || awayScore === null || !evidence || evidence.size === 0) {
            toast({variant: "destructive", title: "Error", description: "Please enter scores for both teams and upload a screenshot."});
            return;
        }

        setIsSubmitting(true);
        try {
            await submitMatchResult(match.tournamentId, match.id, teamToReportFor.id, user.uid, formData);
            toast({ title: "Success", description: "Your score has been reported for verification." });
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
                <Button size="sm"><Upload className="h-4 w-4 mr-2" /> Report Score</Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>Report Match Result</DialogTitle>
                    <DialogDescription>{homeTeamName} vs {awayTeamName}</DialogDescription>
                </DialogHeader>
                <form action={handleFormAction}>
                    <div className="grid gap-6 py-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="homeScore">{homeTeamName} Score</Label>
                                <Input id="homeScore" name="homeScore" type="number" required />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="awayScore">{awayTeamName} Score</Label>
                                <Input id="awayScore" name="awayScore" type="number" required />
                            </div>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="evidence">Screenshot Evidence (Match Stats)</Label>
                          <Input id="evidence" name="evidence" type="file" accept="image/*" required />
                          <p className="text-xs text-muted-foreground">A screenshot of the final match stats screen is required.</p>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="highlightUrl">Highlight URL (Optional)</Label>
                          <Input id="highlightUrl" name="highlightUrl" type="url" placeholder="e.g., https://youtube.com/watch?v=..." />
                          <p className="text-xs text-muted-foreground">Link to a YouTube or Twitch clip of a key moment.</p>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button type="submit" disabled={isSubmitting}>
                            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Submit Report
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
            toast({ variant: 'destructive', title: 'Error', description: 'You must be logged in.' });
            return;
        }

        const evidence = formData.get('evidence') as File;
        if (!evidence || evidence.size === 0) {
            toast({variant: "destructive", title: "Error", description: "Please upload a screenshot."});
            return;
        }

        setIsSubmitting(true);
        try {
            await submitSecondaryEvidence(match.tournamentId, match.id, teamToReportFor.id, user.uid, formData);
            toast({ title: "Success", description: "Your secondary evidence has been submitted." });
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
                <Button size="sm" variant="outline" className="border-yellow-500/80 text-yellow-500 hover:bg-yellow-500/10 hover:text-yellow-400">
                    <Upload className="h-4 w-4 mr-2" /> Submit More Evidence
                </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>Submit Secondary Evidence</DialogTitle>
                    <DialogDescription>
                        The AI needs more information. Please submit a screenshot of the **Match History** screen for this game.
                    </DialogDescription>
                </DialogHeader>
                <div className="text-sm p-3 my-2 bg-muted rounded-md space-y-1">
                    <p className="font-semibold">How to find Match History:</p>
                    <p>1. From the eFootball main menu, go to <span className="font-bold">`Extras`</span>.</p>
                    <p>2. Select <span className="font-bold">`User Information`</span>, then <span className="font-bold">`Match History`</span>.</p>
                    <p>3. Find the correct match and take a screenshot.</p>
                </div>
                <form action={handleFormAction}>
                    <div className="grid gap-6 py-4">
                         <div className="space-y-2">
                          <Label htmlFor="evidence">Screenshot (Match History)</Label>
                          <Input id="evidence" name="evidence" type="file" accept="image/*" required />
                          <p className="text-xs text-muted-foreground">This screenshot helps verify the time and date of the match.</p>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button type="submit" disabled={isSubmitting}>
                            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Submit Evidence
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}

function DeleteReportButton({ match, userId }: { match: Match, userId: string }) {
    const [isDeleting, setIsDeleting] = useState(false);
    const { toast } = useToast();

    const handleDelete = async () => {
        setIsDeleting(true);
        try {
            await deleteMatchReport(match.tournamentId, match.id, userId);
            toast({ title: "Success", description: "Your report has been deleted. You can now submit a new one." });
        } catch (error: any) {
            toast({ variant: "destructive", title: "Error", description: error.message });
        } finally {
            setIsDeleting(false);
        }
    };

    return (
        <AlertDialog>
            <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" disabled={isDeleting}>
                    {isDeleting ? <Loader2 className="h-4 w-4 animate-spin"/> : <Trash2 className="h-4 w-4 mr-2"/>}
                    Delete Report
                </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                    <AlertDialogDescription>
                        This will delete your submitted match report. You will need to submit a new one. This action cannot be undone.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDelete} disabled={isDeleting}>
                        Yes, delete it
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
        const reason = formData.get('reason') as string;
        if (!reason) {
            toast({ variant: 'destructive', title: 'A reason is required.' });
            return;
        }

        setIsSubmitting(true);
        try {
            await requestPlayerReplay(match.tournamentId, match.id, user.uid, reason);
            toast({ title: "Replay Requested", description: "Your opponent has been notified." });
            setOpen(false);
        } catch (error: any) {
            toast({ variant: "destructive", title: "Error", description: error.message });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button variant="outline" size="sm"><History className="mr-2 h-4 w-4"/>Request Replay</Button></DialogTrigger>
            <DialogContent>
                <DialogHeader><DialogTitle>Request a Replay</DialogTitle><DialogDescription>If you had network issues or other problems, you can request a replay. Your opponent must agree.</DialogDescription></DialogHeader>
                <form action={handleFormAction} className="space-y-4 py-4">
                    <div className="space-y-2">
                        <Label htmlFor="reason">Reason for Request</Label>
                        <Textarea id="reason" name="reason" placeholder="e.g., My internet disconnected in the 80th minute." required />
                    </div>
                    <DialogFooter><Button type="submit" disabled={isSubmitting}>{isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>}Send Request</Button></DialogFooter>
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
            toast({ title: "Response Sent", description: "The organizer has been notified." });
        } catch (error: any) {
             toast({ variant: "destructive", title: "Error", description: error.message });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={() => handleResponse(true)} disabled={isLoading}>
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Accept Replay'}
            </Button>
            <Button size="sm" variant="destructive" onClick={() => handleResponse(false)} disabled={isLoading}>
                Reject
            </Button>
        </div>
    );
}


function SetPlayerStreamUrlDialog({ match, userTeam }: { match: Match; userTeam: Team | null; }) {
    const { user, userProfile } = useAuth();
    const [open, setOpen] = useState(false);
    const [url, setUrl] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const { toast } = useToast();

    if (!user || !userTeam || (match.homeTeamId !== userTeam.id && match.awayTeamId !== userTeam.id)) {
        return null;
    }

    const handleSave = async () => {
        if (!user || !userProfile) return;
        setIsLoading(true);
        try {
            await submitPlayerStreamUrl(match.tournamentId, match.id, user.uid, userProfile.username || 'Player', url);
            toast({ title: "Success", description: "Your stream URL has been added." });
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
                <Button variant="outline" size="sm"><Tv className="mr-2 h-4 w-4" /> Add My Stream</Button>
            </DialogTrigger>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Add Your Live Stream</DialogTitle>
                    <DialogDescription>Let others watch you play!</DialogDescription>
                </DialogHeader>
                <div className="py-4 space-y-2">
                    <Label htmlFor="player-stream-url">Your Stream URL</Label>
                    <Input id="player-stream-url" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://twitch.tv/..." />
                </div>
                <DialogFooter>
                    <Button onClick={handleSave} disabled={isLoading || !url}>
                        {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>}
                        Add Link
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

export function ForceReplayAllDialog({ tournament, organizerId }: { tournament: Tournament; organizerId: string }) {
    const [open, setOpen] = useState(false);
    const [reason, setReason] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const { toast } = useToast();

    const handleForceReplayAll = async () => {
        if (!reason.trim()) {
            toast({ variant: "destructive", title: "Reason Required", description: "Please provide a reason for replaying." });
            return;
        }
        setIsSubmitting(true);
        try {
            const count = await organizerForceReplayProblematicMatches(tournament.id, organizerId, reason);
            toast({ title: "Replays Ordered", description: `${count} problematic match(es) have been reset and rescheduled.` });
            setOpen(false);
        } catch (error: any) {
            toast({ variant: "destructive", title: "Error", description: error.message || "Failed to order replays." });
        } finally {
            setIsSubmitting(false);
        }
    };

    if (tournament.status !== 'in_progress' && tournament.status !== 'completed') return null;

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button variant="destructive" size="sm" className="w-full justify-start"><History className="mr-2" /> Force Replay All Pending</Button>
            </DialogTrigger>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Force Replay All Problematic Matches?</DialogTitle>
                    <DialogDescription>
                        This will find all matches that are stuck (e.g., disputed, unconfirmed, or automatically forfeited) and schedule a new match for them. Use this to resolve widespread issues. This action is final.
                    </DialogDescription>
                </DialogHeader>
                <div className="py-4 space-y-2">
                    <Label htmlFor="reason">Reason for mass replay</Label>
                    <Textarea
                        id="reason"
                        placeholder="e.g., Clearing all stuck matches for the end of the round."
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                    />
                </div>
                <DialogFooter>
                    <Button variant="destructive" onClick={handleForceReplayAll} disabled={isSubmitting}>
                        {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>}
                        Confirm & Order Replays
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

    

    
