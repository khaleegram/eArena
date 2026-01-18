
'use client';

import type { Match, Team } from '@/lib/types';
import { BracketMatch } from './bracket-match';
import { getOverallRoundRank } from '@/lib/cup-progression';

interface BracketProps {
    matches: Match[];
    teams: Team[];
}

export function Bracket({ matches, teams }: BracketProps) {
    const rounds = matches.reduce((acc, match) => {
        const round = match.round || 'Round 1';
        if (!acc[round]) {
            acc[round] = [];
        }
        acc[round].push(match);
        return acc;
    }, {} as Record<string, Match[]>);

    const getTeam = (teamId: string) => teams.find(t => t.id === teamId);

    // Sort rounds in proper tournament progression order
    const roundKeys = Object.keys(rounds).sort((a, b) => {
        return getOverallRoundRank(a) - getOverallRoundRank(b); // Ascending: Round of 16 -> ... -> Final
    });

    return (
        <div className="flex gap-8 overflow-x-auto p-4 bg-muted/20 rounded-lg no-scrollbar">
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
    );
}
