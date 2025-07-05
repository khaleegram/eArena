
"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getHighlights } from '@/lib/actions';
import type { Highlight, UnifiedTimestamp } from '@/lib/types';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, Video, Clapperboard } from 'lucide-react';
import { format } from 'date-fns';
import Image from 'next/image';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

const toDate = (timestamp: UnifiedTimestamp): Date => {
    if (typeof timestamp === 'string') {
        return new Date(timestamp);
    }
    if (timestamp && typeof (timestamp as any).toDate === 'function') {
        return (timestamp as any).toDate();
    }
    return timestamp as Date;
};

const HighlightCard = ({ highlight }: { highlight: Highlight }) => {
  return (
    <Card className="flex flex-col bg-card/50 hover:bg-card transition-colors overflow-hidden">
      <CardHeader>
        <div className="flex justify-between items-start">
            <CardTitle className="font-headline text-lg">{highlight.homeTeamName} vs {highlight.awayTeamName}</CardTitle>
            <span className="text-xs text-muted-foreground">{format(toDate(highlight.matchDay), 'PPP')}</span>
        </div>
        <CardDescription>
            In <Link href={`/tournaments/${highlight.tournamentId}`} className="hover:underline text-primary/80">{highlight.tournamentName}</Link>
        </CardDescription>
      </CardHeader>
      <CardContent className="flex-grow space-y-4">
        <a href={highlight.highlightUrl} target="_blank" rel="noopener noreferrer" className="block relative aspect-video w-full rounded-md overflow-hidden group">
            <Image 
                src="https://placehold.co/1280x720.png" 
                alt={`Highlight thumbnail for ${highlight.homeTeamName} vs ${highlight.awayTeamName}`} 
                fill
                sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                style={{objectFit: 'cover'}}
                data-ai-hint="esports gaming"
            />
            <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <Video className="w-16 h-16 text-white" />
            </div>
        </a>
      </CardContent>
       <CardFooter className="flex justify-between items-center bg-muted/30 p-4">
        <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
                <Avatar className="h-6 w-6"><AvatarImage src={highlight.homeTeamLogo} /><AvatarFallback>{highlight.homeTeamName.charAt(0)}</AvatarFallback></Avatar>
                <span className="font-medium text-sm">{highlight.homeTeamName}</span>
            </div>
            <span className="font-bold text-lg">{highlight.homeScore} - {highlight.awayScore}</span>
             <div className="flex items-center gap-2">
                <span className="font-medium text-sm">{highlight.awayTeamName}</span>
                <Avatar className="h-6 w-6"><AvatarImage src={highlight.awayTeamLogo} /><AvatarFallback>{highlight.awayTeamName.charAt(0)}</AvatarFallback></Avatar>
            </div>
        </div>
        <Button asChild size="sm">
            <a href={highlight.highlightUrl} target="_blank" rel="noopener noreferrer">
                Watch
            </a>
        </Button>
      </CardFooter>
    </Card>
  );
};

export default function HighlightsPage() {
    const [highlights, setHighlights] = useState<Highlight[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchHighlights = async () => {
            setLoading(true);
            try {
                const data = await getHighlights();
                setHighlights(data);
            } catch (error) {
                console.error("Failed to fetch highlights:", error);
            } finally {
                setLoading(false);
            }
        };

        fetchHighlights();
    }, []);

    return (
        <div className="container py-10">
            <div className="space-y-8">
                <div className="flex flex-col items-center text-center">
                    <h1 className="text-4xl font-bold font-headline">Community Highlights</h1>
                    <p className="max-w-2xl mt-2 text-muted-foreground">
                        Check out the best plays, stunning goals, and top moments submitted by the eArena community.
                    </p>
                </div>

                {loading ? (
                    <div className="flex justify-center items-center h-64">
                        <Loader2 className="h-12 w-12 animate-spin text-primary" />
                    </div>
                ) : highlights.length === 0 ? (
                    <div className="text-center py-16 border-2 border-dashed rounded-lg">
                        <Clapperboard className="mx-auto h-12 w-12 text-muted-foreground" />
                        <h2 className="mt-4 text-xl font-semibold">No Highlights Yet</h2>
                        <p className="text-muted-foreground mt-2">Play matches and submit your highlight clips to be featured here!</p>
                    </div>
                ) : (
                    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                        {highlights.map((highlight) => (
                            <HighlightCard key={highlight.id} highlight={highlight} />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
