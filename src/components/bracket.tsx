
'use client';

import type { Match, Team } from '@/lib/types';
import { BracketMatch } from './bracket-match';
import { getOverallRoundRank } from '@/lib/cup-progression';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { MatchStatusBadge } from '@/components/match-status-badge';

interface BracketProps {
    matches: Match[];
    teams: Team[];
}

export function Bracket({ matches, teams }: BracketProps) {
    const params = useParams() as { id?: string };
    const tournamentId = params?.id;

    const rounds = matches.reduce((acc, match) => {
        const round = match.round || 'Round 1';
        if (!acc[round]) {
            acc[round] = [];
        }
        acc[round].push(match);
        return acc;
    }, {} as Record<string, Match[]>);

    const getTeam = (teamId: string) => teams.find(t => t.id === teamId);

    const roundKeys = Object.keys(rounds).sort((a, b) => {
        return getOverallRoundRank(a) - getOverallRoundRank(b);
    });

    return (
        <>
            <div className="md:hidden space-y-6">
                {roundKeys.map((roundKey) => (
                    <div key={roundKey} className="space-y-3">
                        <h3 className="text-base font-bold font-headline">{roundKey}</h3>
                        <div className="space-y-2">
                            {rounds[roundKey]!.map((match) => {
                                const home = getTeam(match.homeTeamId);
                                const away = getTeam(match.awayTeamId);
                                const href = tournamentId
                                    ? `/tournaments/${tournamentId}/matches/${match.id}`
                                    : undefined;
                                const content = (
                                    <div className="rounded-xl border bg-card p-3 space-y-2">
                                        <div className="flex items-center justify-between gap-2">
                                            <MatchStatusBadge status={match.status} />
                                            {match.homeScore != null && match.awayScore != null ? (
                                                <span className="font-headline text-lg font-bold tabular-nums">
                                                    {match.homeScore} – {match.awayScore}
                                                </span>
                                            ) : (
                                                <Badge variant="outline">VS</Badge>
                                            )}
                                        </div>
                                        <div className="flex items-center justify-between gap-3">
                                            <div className="flex items-center gap-2 min-w-0 flex-1">
                                                <Avatar className="h-8 w-8">
                                                    <AvatarImage src={home?.logoUrl} />
                                                    <AvatarFallback>{home?.name?.[0]}</AvatarFallback>
                                                </Avatar>
                                                <span className="text-sm font-medium truncate">{home?.name || 'TBD'}</span>
                                            </div>
                                            <div className="flex items-center gap-2 min-w-0 flex-1 justify-end text-right">
                                                <span className="text-sm font-medium truncate">{away?.name || 'TBD'}</span>
                                                <Avatar className="h-8 w-8">
                                                    <AvatarImage src={away?.logoUrl} />
                                                    <AvatarFallback>{away?.name?.[0]}</AvatarFallback>
                                                </Avatar>
                                            </div>
                                        </div>
                                    </div>
                                );
                                return href ? (
                                    <Link key={match.id} href={href} className="block">
                                        {content}
                                    </Link>
                                ) : (
                                    <div key={match.id}>{content}</div>
                                );
                            })}
                        </div>
                    </div>
                ))}
            </div>

            <div className="hidden md:flex gap-8 overflow-x-auto p-4 bg-muted/20 rounded-lg no-scrollbar">
                {roundKeys.map((roundKey) => (
                    <div key={roundKey} className="flex flex-col gap-8 justify-around">
                        <h3 className="text-lg font-bold text-center font-headline">{roundKey}</h3>
                        <div className="flex flex-col gap-12">
                            {rounds[roundKey]!.map(match => (
                                <BracketMatch 
                                    key={match.id}
                                    match={match}
                                    homeTeam={getTeam(match.homeTeamId)}
                                    awayTeam={getTeam(match.awayTeamId)}
                                />
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </>
    );
}
