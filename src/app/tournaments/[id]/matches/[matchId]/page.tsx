'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { db } from '@/lib/firebase';
import { doc, getDoc, collection, onSnapshot, query } from 'firebase/firestore';
import type { Match, Team, Tournament, TeamMatchStats } from '@/lib/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Loader2, ArrowLeft, Sparkles, Trophy, Clock, CheckCircle, AlertTriangle, FileText, Tv, Calendar } from 'lucide-react';
import Link from 'next/link';
import { format, isPast, endOfDay } from 'date-fns';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { getMatchPrediction } from '@/lib/actions';

const toDate = (timestamp: any): Date => {
    if (typeof timestamp === 'string') return new Date(timestamp);
    if (timestamp && typeof timestamp.toDate === 'function') return timestamp.toDate();
    return timestamp as Date;
};

type MatchStatus = 'scheduled' | 'awaiting_confirmation' | 'needs_secondary_evidence' | 'disputed' | 'approved';

export default function MatchDetailsPage() {
    const params = useParams();
    const { user } = useAuth();
    const { toast } = useToast();
    const tournamentId = params.id as string;
    const matchId = params.matchId as string;

    const [match, setMatch] = useState<Match | null>(null);
    const [tournament, setTournament] = useState<Tournament | null>(null);
    const [homeTeam, setHomeTeam] = useState<Team | null>(null);
    const [awayTeam, setAwayTeam] = useState<Team | null>(null);
    const [loading, setLoading] = useState(true);
    const [prediction, setPrediction] = useState<{ predictedWinnerName: string; confidence: number; reasoning: string } | null>(null);
    const [isPredicting, setIsPredicting] = useState(false);
    const [isOrganizer, setIsOrganizer] = useState(false);

    useEffect(() => {
        const fetchData = async () => {
            try {
                // Fetch tournament
                const tournamentDoc = await getDoc(doc(db, 'tournaments', tournamentId));
                if (tournamentDoc.exists()) {
                    const tournamentData = tournamentDoc.data() as Tournament;
                    setTournament(tournamentData);
                    setIsOrganizer(tournamentData.organizerId === user?.uid);
                }

                // Fetch match in real-time
                const unsubMatch = onSnapshot(doc(db, `tournaments/${tournamentId}/matches`, matchId), (snapshot) => {
                    if (snapshot.exists()) {
                        setMatch({ id: snapshot.id, ...snapshot.data() } as Match);
                    }
                });

                // Fetch teams
                const unsubTeams = onSnapshot(query(collection(db, `tournaments/${tournamentId}/teams`)), (snapshot) => {
                    const teams = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Team));
                    setLoading(false);
                });

                return () => {
                    unsubMatch();
                    unsubTeams();
                };
            } catch (error) {
                console.error('Error fetching match details:', error);
                setLoading(false);
            }
        };

        if (tournamentId && matchId) {
            fetchData();
        }
    }, [tournamentId, matchId, user?.uid]);

    useEffect(() => {
        if (match?.homeTeamId) {
            const fetchTeam = async () => {
                const teamDoc = await getDoc(doc(db, `tournaments/${tournamentId}/teams`, match.homeTeamId));
                if (teamDoc.exists()) {
                    setHomeTeam({ id: teamDoc.id, ...teamDoc.data() } as Team);
                }
            };
            fetchTeam();
        }
    }, [match?.homeTeamId, tournamentId]);

    useEffect(() => {
        if (match?.awayTeamId) {
            const fetchTeam = async () => {
                const teamDoc = await getDoc(doc(db, `tournaments/${tournamentId}/teams`, match.awayTeamId));
                if (teamDoc.exists()) {
                    setAwayTeam({ id: teamDoc.id, ...teamDoc.data() } as Team);
                }
            };
            fetchTeam();
        }
    }, [match?.awayTeamId, tournamentId]);

    const handleGetPrediction = async () => {
        setIsPredicting(true);
        try {
            const result = await getMatchPrediction(match!.id, tournamentId);
            setPrediction(result);
        } catch (error: any) {
            toast({ variant: 'destructive', title: 'Prediction Failed', description: error.message });
        } finally {
            setIsPredicting(false);
        }
    };

    const getStatusColor = (status: MatchStatus) => {
        const colors = {
            scheduled: 'bg-slate-500/15 text-slate-600 border-slate-300',
            awaiting_confirmation: 'bg-amber-500/15 text-amber-600 border-amber-300',
            needs_secondary_evidence: 'bg-yellow-500/15 text-yellow-600 border-yellow-300',
            disputed: 'bg-red-500/15 text-red-600 border-red-300',
            approved: 'bg-green-600/15 text-green-600 border-green-300',
        };
        return colors[status] || colors.scheduled;
    };

    const getStatusIcon = (status: MatchStatus) => {
        const icons = {
            scheduled: <Clock className="h-4 w-4" />,
            awaiting_confirmation: <Clock className="h-4 w-4" />,
            needs_secondary_evidence: <AlertTriangle className="h-4 w-4" />,
            disputed: <AlertTriangle className="h-4 w-4" />,
            approved: <CheckCircle className="h-4 w-4" />,
        };
        return icons[status] || icons.scheduled;
    };

    if (loading) {
        return (
            <div className="flex justify-center items-center h-96">
                <Loader2 className="h-12 w-12 animate-spin text-primary" />
            </div>
        );
    }

    if (!match || !homeTeam || !awayTeam) {
        return (
            <div className="max-w-4xl mx-auto p-6">
                <Link href={`/tournaments/${tournamentId}`}>
                    <Button variant="outline" className="mb-6">
                        <ArrowLeft className="h-4 w-4 mr-2" />
                        Back to Tournament
                    </Button>
                </Link>
                <Card>
                    <CardContent className="pt-6">
                        <p className="text-center text-muted-foreground">Match not found</p>
                    </CardContent>
                </Card>
            </div>
        );
    }

    const statsMap = [
        { label: 'Possession', key: 'possession' as keyof TeamMatchStats },
        { label: 'Shots', key: 'shots' as keyof TeamMatchStats },
        { label: 'Shots on Target', key: 'shotsOnTarget' as keyof TeamMatchStats },
        { label: 'Passes', key: 'passes' as keyof TeamMatchStats },
        { label: 'Tackles', key: 'tackles' as keyof TeamMatchStats },
        { label: 'Fouls', key: 'fouls' as keyof TeamMatchStats },
    ];

    return (
        <div className="max-w-5xl mx-auto p-6 space-y-6">
            {/* Back Button */}
            <Link href={`/tournaments/${tournamentId}`}>
                <Button variant="outline">
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Back to Tournament
                </Button>
            </Link>

            {/* Match Header Card */}
            <Card className="border-2">
                <CardContent className="pt-6">
                    <div className="space-y-6">
                        {/* Teams & Score */}
                        <div className="flex items-center justify-between gap-4">
                            {/* Home Team */}
                            <div className="flex-1 text-center">
                                <Avatar className="h-16 w-16 mx-auto mb-2">
                                    <AvatarImage src={homeTeam.logoUrl} alt={homeTeam.name} />
                                    <AvatarFallback>{homeTeam.name[0]}</AvatarFallback>
                                </Avatar>
                                <h3 className="font-bold text-lg">{homeTeam.name}</h3>
                                {match.status === 'approved' && (
                                    <p className="text-2xl font-bold text-primary mt-2">{match.homeScore}</p>
                                )}
                            </div>

                            {/* Score/VS */}
                            <div className="text-center px-6">
                                {match.status === 'approved' ? (
                                    <div className="text-3xl font-bold">{match.homeScore} - {match.awayScore}</div>
                                ) : (
                                    <div className="text-2xl font-bold text-muted-foreground">vs</div>
                                )}
                                <div className="mt-3">
                                    <Badge className={`${getStatusColor(match.status)}`}>
                                        {getStatusIcon(match.status)}
                                        <span className="ml-2">{match.status.replace(/_/g, ' ').toUpperCase()}</span>
                                    </Badge>
                                </div>
                            </div>

                            {/* Away Team */}
                            <div className="flex-1 text-center">
                                <Avatar className="h-16 w-16 mx-auto mb-2">
                                    <AvatarImage src={awayTeam.logoUrl} alt={awayTeam.name} />
                                    <AvatarFallback>{awayTeam.name[0]}</AvatarFallback>
                                </Avatar>
                                <h3 className="font-bold text-lg">{awayTeam.name}</h3>
                                {match.status === 'approved' && (
                                    <p className="text-2xl font-bold text-primary mt-2">{match.awayScore}</p>
                                )}
                            </div>
                        </div>

                        {/* Match Info */}
                        <div className="border-t pt-4 flex flex-wrap justify-center gap-6 text-sm text-muted-foreground">
                            <div className="flex items-center gap-2">
                                <Calendar className="h-4 w-4" />
                                <span>{format(toDate(match.matchDay), 'PPP p')}</span>
                            </div>
                            {match.round && (
                                <div>
                                    <span className="font-semibold">{match.round}</span>
                                </div>
                            )}
                            {match.organizerStreamUrl && (
                                <a href={match.organizerStreamUrl} target="_blank" rel="noopener noreferrer">
                                    <Button variant="outline" size="sm">
                                        <Tv className="h-4 w-4 mr-2" />
                                        Watch Live
                                    </Button>
                                </a>
                            )}
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* AI Summary */}
            {match.summary && (
                <Alert className="border-2 border-yellow-500/30 bg-yellow-500/5">
                    <Sparkles className="h-5 w-5 text-yellow-500" />
                    <AlertTitle className="font-bold text-lg">AI Match Summary</AlertTitle>
                    <AlertDescription className="mt-2 text-base">
                        {match.summary}
                    </AlertDescription>
                </Alert>
            )}

            {/* Match Statistics */}
            {match.status === 'approved' && match.homeTeamStats && (
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Trophy className="h-5 w-5 text-primary" />
                            Match Statistics
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-3">
                            {statsMap.map((stat) => (
                                <div key={stat.key} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                                    <span className="font-medium text-sm">{stat.label}</span>
                                    <div className="flex items-center gap-4">
                                        <span className="text-sm font-bold w-8 text-right">
                                            {match.homeTeamStats?.[stat.key] ?? 'N/A'}
                                            {stat.key === 'possession' && '%'}
                                        </span>
                                        <span className="text-muted-foreground">-</span>
                                        <span className="text-sm font-bold w-8 text-left">
                                            {match.awayTeamStats?.[stat.key] ?? 'N/A'}
                                            {stat.key === 'possession' && '%'}
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Organizer's Verdict */}
            {match.resolutionNotes && (
                <Alert className="border-2 border-blue-500/30">
                    <FileText className="h-5 w-5 text-blue-500" />
                    <AlertTitle className="font-bold text-lg">Organizer's Verdict</AlertTitle>
                    <AlertDescription className="mt-2 text-base">
                        {match.resolutionNotes}
                    </AlertDescription>
                </Alert>
            )}

            {/* AI Prediction */}
            {match.status === 'scheduled' && (
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Sparkles className="h-5 w-5 text-yellow-500" />
                            AI Prediction
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {!prediction ? (
                            <Button onClick={handleGetPrediction} disabled={isPredicting} className="w-full">
                                {isPredicting ? (
                                    <>
                                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                        Analyzing Match...
                                    </>
                                ) : (
                                    <>
                                        <Sparkles className="h-4 w-4 mr-2 text-yellow-400" />
                                        Generate AI Prediction
                                    </>
                                )}
                            </Button>
                        ) : (
                            <div className="space-y-3">
                                <div className="p-4 bg-primary/10 rounded-lg border border-primary/20">
                                    <p className="text-sm text-muted-foreground">Predicted Winner</p>
                                    <p className="text-xl font-bold text-primary">{prediction.predictedWinnerName}</p>
                                    <p className="text-sm text-muted-foreground mt-1">
                                        Confidence: <span className="font-bold text-primary">{prediction.confidence}%</span>
                                    </p>
                                </div>
                                <div className="p-4 bg-muted/50 rounded-lg">
                                    <p className="text-sm text-muted-foreground mb-2">Analysis</p>
                                    <p className="text-sm italic">{prediction.reasoning}</p>
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>
            )}

            {/* Organizer Tools Section */}
            {isOrganizer && (
                <Card className="border-orange-500/30 bg-orange-500/5">
                    <CardHeader>
                        <CardTitle className="text-orange-600">Organizer Tools</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-sm text-muted-foreground mb-4">
                            Access additional organizer controls from the tournament admin dashboard.
                        </p>
                        <Link href={`/tournaments/${tournamentId}`}>
                            <Button variant="outline">Open Tournament Admin</Button>
                        </Link>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
