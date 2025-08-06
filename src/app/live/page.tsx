
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getLiveMatches } from '@/lib/actions';
import type { Match, Team, UnifiedTimestamp } from '@/lib/types';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, Video, Clapperboard, Tv } from 'lucide-react';
import { format } from 'date-fns';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '../components/ui/badge';

const toDate = (timestamp: UnifiedTimestamp): Date => {
    if (typeof timestamp === 'string') {
        return new Date(timestamp);
    }
    if (timestamp && typeof (timestamp as any).toDate === 'function') {
        return (timestamp as any).toDate();
    }
    return timestamp as Date;
};

const LiveMatchCard = ({ match, homeTeam, awayTeam }: { match: Match; homeTeam: Team; awayTeam: Team; }) => {
  const streamLinks = Object.entries(match.streamLinks || {});
  return (
    <Card className="flex flex-col bg-card/50 hover:bg-card transition-colors overflow-hidden">
      <CardHeader>
        <div className="flex justify-between items-start">
            <CardTitle className="font-headline text-lg">{homeTeam.name} vs {awayTeam.name}</CardTitle>
            <Badge variant="destructive" className="animate-pulse">LIVE</Badge>
        </div>
        <CardDescription>
            In <Link href={`/tournaments/${match.tournamentId}`} className="hover:underline text-primary/80">{match.tournamentName}</Link>
        </CardDescription>
      </CardHeader>
      <CardContent className="flex-grow flex flex-col items-center justify-center text-center py-8 bg-muted/20">
        <Tv className="w-16 h-16 text-primary" />
        <p className="mt-4 text-muted-foreground">Match is currently live!</p>
      </CardContent>
       <CardFooter className="flex-col items-start gap-3 p-4">
        <p className="text-sm font-semibold">Available Streams:</p>
         <div className="flex flex-col gap-2 w-full">
            {streamLinks.map(([key, link]) => (
                 <Button asChild key={key} variant={key === 'organizer' ? 'default' : 'secondary'} className="w-full justify-start">
                    <a href={link.url} target="_blank" rel="noopener noreferrer">
                        <Video className="w-4 h-4 mr-2" />
                        Watch {link.username}'s Stream
                    </a>
                </Button>
            ))}
        </div>
      </CardFooter>
    </Card>
  );
};

export default function LiveMatchesPage() {
    const [liveMatches, setLiveMatches] = useState<{ match: Match; homeTeam: Team; awayTeam: Team; }[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchLiveMatches = async () => {
            setLoading(true);
            try {
                const data = await getLiveMatches();
                setLiveMatches(data);
            } catch (error) {
                console.error("Failed to fetch live matches:", error);
            } finally {
                setLoading(false);
            }
        };

        fetchLiveMatches();
    }, []);

    return (
        <div className="container py-10">
            <div className="space-y-8">
                <div className="flex flex-col items-center text-center">
                    <h1 className="text-4xl font-bold font-headline">Live Matches</h1>
                    <p className="max-w-2xl mt-2 text-muted-foreground">
                        Watch ongoing matches from around the eArena community right now.
                    </p>
                </div>

                {loading ? (
                    <div className="flex justify-center items-center h-64">
                        <Loader2 className="h-12 w-12 animate-spin text-primary" />
                    </div>
                ) : liveMatches.length === 0 ? (
                    <div className="text-center py-16 border-2 border-dashed rounded-lg">
                        <Clapperboard className="mx-auto h-12 w-12 text-muted-foreground" />
                        <h2 className="mt-4 text-xl font-semibold">No Matches Live</h2>
                        <p className="text-muted-foreground mt-2">There are no community streams live at the moment. Check back soon!</p>
                    </div>
                ) : (
                    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                        {liveMatches.map(({ match, homeTeam, awayTeam }) => (
                            <LiveMatchCard key={match.id} match={match} homeTeam={homeTeam} awayTeam={awayTeam} />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
