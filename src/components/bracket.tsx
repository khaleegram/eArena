
'use client';

import type { Match, Team } from '@/lib/types';
import { BracketMatch } from './bracket-match';

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

    const roundKeys = Object.keys(rounds).sort((a,b) => {
        // Simple sort for now, can be improved for "Final", "Semi-Final" etc.
        return a.localeCompare(b, undefined, { numeric: true });
    });

    return (
        <div className="flex gap-8 overflow-x-auto p-4 bg-muted/20 rounded-lg">
            {roundKeys.map((roundKey) => (
                <div key={roundKey} className="flex flex-col gap-8 justify-around">
                    <h3 className="text-lg font-bold text-center font-headline">{roundKey}</h3>
                    <div className="flex flex-col gap-12">
                        {rounds[roundKey].map(match => (
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
