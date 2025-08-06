
'use client';

import type { Match, Team } from '@/lib/types';
import { Card } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { User } from 'lucide-react';

interface BracketMatchProps {
    match: Match;
    homeTeam?: Team;
    awayTeam?: Team;
}

const TeamDisplay = ({ team, score }: { team?: Team, score: number | null }) => (
    <div className="flex items-center justify-between w-full">
        <div className="flex items-center gap-2">
            <Avatar className="h-6 w-6">
                {team?.logoUrl && <AvatarImage src={team.logoUrl} />}
                <AvatarFallback><User className="w-4 h-4" /></AvatarFallback>
            </Avatar>
            <span className="text-sm font-medium">{team?.name || 'TBD'}</span>
        </div>
        <span className="font-bold text-sm">{score ?? ''}</span>
    </div>
);

export function BracketMatch({ match, homeTeam, awayTeam }: BracketMatchProps) {
    return (
        <div className="flex items-center">
            <Card className="w-64 p-2 space-y-2">
                <TeamDisplay team={homeTeam} score={match.homeScore} />
                <div className="border-b" />
                <TeamDisplay team={awayTeam} score={match.awayScore} />
            </Card>
            <div className="bracket-connector bracket-connector-top bracket-connector-bottom"></div>
        </div>
    );
}
