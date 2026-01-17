
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

    // Sort rounds in proper tournament progression order
    const roundOrder = ['Final', 'Semi-finals', 'Quarter-finals'];
    const getRoundOrder = (round: string): number => {
        // Extract number from "Round of X"
        const match = round.match(/Round of (\d+)/);
        if (match) {
            return parseInt(match[1]!, 10); // Higher number = earlier round
        }
        // Check for named rounds
        const index = roundOrder.indexOf(round);
        if (index !== -1) {
            return 1000 - index; // Final = 1000, Semi-finals = 999, etc.
        }
        return 0; // Unknown rounds go first
    };
    
    const roundKeys = Object.keys(rounds).sort((a, b) => {
        return getRoundOrder(b) - getRoundOrder(a); // Descending: Round of 16 -> Round of 8 -> Semi-finals -> Final
    });

    return (
        <div className="flex gap-8 overflow-x-auto p-4 bg-muted/20 rounded-lg no-scrollbar">
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
