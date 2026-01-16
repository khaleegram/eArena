
'use client';

import { useMemo } from 'react';
import type { Match, Standing, Team, Tournament } from '@/lib/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Trophy, Flame, Shield, User } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import Link from 'next/link';

interface TournamentPodiumProps {
    tournament: Tournament;
    matches: Match[];
    standings: Standing[];
    teams: Team[];
}

export function TournamentPodium({ tournament, matches, standings, teams }: TournamentPodiumProps) {
    const podium = useMemo(() => {
        const getTeamInfo = (teamId: string) => teams.find(t => t.id === teamId);

        const finalMatch = matches.find(m => (m.round || '').toLowerCase() === 'final' && m.status === 'approved');
        const isBracketFormat = ['cup', 'double-elimination'].includes(tournament.format);

        const bracketResult = (() => {
            if (!isBracketFormat || !finalMatch) return null;
            if (finalMatch.homeScore == null || finalMatch.awayScore == null) return null;
            let winnerTeamId: string | null = null;
            let runnerUpTeamId: string | null = null;

            if (finalMatch.homeScore > finalMatch.awayScore) {
                winnerTeamId = finalMatch.homeTeamId;
                runnerUpTeamId = finalMatch.awayTeamId;
            } else if (finalMatch.awayScore > finalMatch.homeScore) {
                winnerTeamId = finalMatch.awayTeamId;
                runnerUpTeamId = finalMatch.homeTeamId;
            } else if (finalMatch.pkHomeScore != null && finalMatch.pkAwayScore != null) {
                winnerTeamId = finalMatch.pkHomeScore > finalMatch.pkAwayScore ? finalMatch.homeTeamId : finalMatch.awayTeamId;
                runnerUpTeamId = winnerTeamId === finalMatch.homeTeamId ? finalMatch.awayTeamId : finalMatch.homeTeamId;
            }

            if (!winnerTeamId || !runnerUpTeamId) return null;
            return {
                winner: getTeamInfo(winnerTeamId),
                runnerUp: getTeamInfo(runnerUpTeamId),
            };
        })();
        
        const topThree = standings.slice(0, 3).map(s => ({
            ...s,
            team: getTeamInfo(s.teamId)
        }));

        const topScorer = standings.reduce((prev, current) => (prev.goalsFor > current.goalsFor) ? prev : current, standings[0] || {});
        const bestDefense = standings.reduce((prev, current) => (prev.cleanSheets > current.cleanSheets) ? prev : current, standings[0] || {});

        return {
            bracketResult,
            first: topThree.find(s => s.ranking === 1),
            second: topThree.find(s => s.ranking === 2),
            third: topThree.find(s => s.ranking === 3),
            topScorer: { ...topScorer, team: getTeamInfo(topScorer.teamId) },
            bestDefense: { ...bestDefense, team: getTeamInfo(bestDefense.teamId) },
        };
    }, [tournament.format, matches, standings, teams]);

    if (!podium.first && !podium.bracketResult?.winner) {
        return (
            <Card className="text-center">
                <CardHeader>
                    <CardTitle className="font-headline">Tournament Concluded</CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="text-muted-foreground">Final standings are being calculated. Check back soon for the results!</p>
                </CardContent>
            </Card>
        );
    }
    
    const PodiumCard = ({ place, team, rank, color }: { place: string, team: Team | undefined, rank: number, color: string }) => {
        if(!team) return null;
        return (
            <div className="flex flex-col items-center">
                <Trophy className={`w-12 h-12 mb-2 ${color}`} />
                <h3 className="text-xl font-bold">{place}</h3>
                <Link href={`/profile/${team.captainId}`} className="flex items-center gap-2 mt-1 hover:underline">
                    <Avatar className="h-6 w-6">
                        <AvatarImage src={team.logoUrl} />
                        <AvatarFallback><User /></AvatarFallback>
                    </Avatar>
                    <span className="font-medium">{team.name}</span>
                </Link>
            </div>
        )
    }

    return (
        <Card className="w-full">
            <CardHeader className="text-center">
                 <CardTitle className="font-headline text-3xl">Tournament Complete!</CardTitle>
                 <CardDescription>Congratulations to the winners!</CardDescription>
            </CardHeader>
            <CardContent>
                {podium.bracketResult?.winner ? (
                    <div className="flex justify-around items-end text-center mb-8">
                        {podium.bracketResult.runnerUp && <PodiumCard place="Runner-up" team={podium.bracketResult.runnerUp} rank={2} color="text-slate-400" />}
                        {podium.bracketResult.winner && <PodiumCard place="Champion" team={podium.bracketResult.winner} rank={1} color="text-amber-400" />}
                    </div>
                ) : (
                    <div className="flex justify-around items-end text-center mb-8">
                        {podium.second && podium.second.team && <PodiumCard place="2nd Place" team={podium.second.team} rank={2} color="text-slate-400" />}
                        {podium.first && podium.first.team && <PodiumCard place="1st Place" team={podium.first.team} rank={1} color="text-amber-400" />}
                        {podium.third && podium.third.team && <PodiumCard place="3rd Place" team={podium.third.team} rank={3} color="text-amber-700" />}
                    </div>
                )}
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-8 pt-4 border-t">
                    {podium.topScorer.team && (
                        <div className="p-4 bg-muted/50 rounded-lg text-center">
                            <h4 className="font-semibold flex items-center justify-center gap-2"><Flame className="text-destructive"/>Top Scorer</h4>
                            <p className="text-sm text-muted-foreground">{podium.topScorer.team.name} ({podium.topScorer.goalsFor} goals)</p>
                        </div>
                    )}
                    {podium.bestDefense.team && (
                         <div className="p-4 bg-muted/50 rounded-lg text-center">
                            <h4 className="font-semibold flex items-center justify-center gap-2"><Shield className="text-primary"/>Best Defense</h4>
                            <p className="text-sm text-muted-foreground">{podium.bestDefense.team.name} ({podium.bestDefense.cleanSheets} clean sheets)</p>
                        </div>
                    )}
                </div>
            </CardContent>
        </Card>
    )
}
