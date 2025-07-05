'use client';

import type { UserProfile, UnifiedTimestamp } from '@/lib/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Trophy } from 'lucide-react';
import Link from 'next/link';
import { format } from 'date-fns';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

const toDate = (timestamp: UnifiedTimestamp | undefined): Date | null => {
    if (!timestamp) return null;
    if (timestamp instanceof Date) return timestamp;
    if (typeof timestamp === 'string') return new Date(timestamp);
    if (typeof (timestamp as any).toDate === 'function') return (timestamp as any).toDate();
    return null;
}

const safeFormatDate = (timestamp: UnifiedTimestamp | undefined): string => {
    const date = toDate(timestamp);
    if (!date) return 'Invalid Date';
    try {
        return format(date, 'PPP');
    } catch (error) {
        console.error("Failed to format date:", timestamp, error);
        return 'Invalid Date';
    }
};

export function TrophyCase({ profile }: { profile: UserProfile | null }) {
    if (!profile) return null;

    const firstPlaceBadges = profile.badges?.filter(badge => badge.rank === 1) || [];

    return (
        <Card>
            <CardHeader>
                <CardTitle className="font-headline text-xl flex items-center gap-2">
                    <Trophy className="w-5 h-5 text-amber-400" />
                    Trophy Case
                </CardTitle>
                <CardDescription>A collection of 1st place victories.</CardDescription>
            </CardHeader>
            <CardContent>
                {firstPlaceBadges.length > 0 ? (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-2 gap-4">
                        <TooltipProvider>
                            {firstPlaceBadges.map((badge, index) => (
                                <Tooltip key={index}>
                                    <TooltipTrigger asChild>
                                        <Link href={`/tournaments/${badge.tournamentId}`}>
                                            <div className="aspect-square bg-muted/50 rounded-lg flex flex-col items-center justify-center p-2 text-center hover:bg-accent transition-colors">
                                                <Trophy className="w-10 h-10 text-amber-400" />
                                                <p className="text-xs font-semibold mt-2 line-clamp-2">{badge.tournamentName}</p>
                                            </div>
                                        </Link>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                        <p>{badge.tournamentName}</p>
                                        <p className="text-sm text-muted-foreground">{safeFormatDate(badge.date)}</p>
                                    </TooltipContent>
                                </Tooltip>
                            ))}
                        </TooltipProvider>
                    </div>
                ) : (
                    <p className="text-muted-foreground text-center py-8 text-sm">No 1st place victories yet.</p>
                )}
            </CardContent>
        </Card>
    );
}
