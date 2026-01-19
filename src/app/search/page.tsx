

'use client';

import { useState, useEffect, useTransition } from 'react';
import { findUsersByUsername } from '@/lib/actions/user';
import type { UserProfile } from '@/lib/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Loader2, Search as SearchIcon, Trophy, User } from 'lucide-react';
import { ReputationAvatar } from '@/components/reputation-avatar';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { AchievementIcons } from '@/components/achievement-icons';
import { Badge } from '@/components/ui/badge';

function UserResultCard({ user }: { user: UserProfile }) {
    return (
        <Card className="hover:border-primary/50 transition-colors">
            <CardHeader>
                <div className="flex items-center gap-4">
                    <ReputationAvatar profile={user} className="w-16 h-16" />
                    <div>
                        <div className="flex items-center gap-2">
                            <CardTitle>{user.username}</CardTitle>
                            <AchievementIcons profile={user} />
                        </div>
                        {user.activeTitle && <Badge variant="outline" className="text-xs w-fit mt-1">{user.activeTitle}</Badge>}
                    </div>
                </div>
            </CardHeader>
            <CardContent className="flex justify-between items-center">
                 <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Trophy className="w-4 h-4 text-amber-400"/>
                    <span>{user.tournamentsWon || 0} Wins</span>
                 </div>
                 <Button asChild variant="secondary" size="sm">
                    <Link href={`/profile/${user.uid}`}>
                        View Profile
                    </Link>
                 </Button>
            </CardContent>
        </Card>
    )
}

export default function SearchPage() {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<UserProfile[]>([]);
    const [isSearching, startSearchTransition] = useTransition();

    useEffect(() => {
        const handler = setTimeout(() => {
            if (query.trim().length > 1) {
                startSearchTransition(async () => {
                    const foundUsers = await findUsersByUsername(query);
                    setResults(foundUsers);
                });
            } else {
                setResults([]);
            }
        }, 300); // Debounce search

        return () => {
            clearTimeout(handler);
        };
    }, [query]);

    return (
        <div className="container py-10 space-y-8">
            <div className="text-center">
                <h1 className="text-4xl font-bold font-headline">Find Players</h1>
                <p className="max-w-xl mx-auto mt-2 text-muted-foreground">
                    Search for friends, rivals, or new opponents by their username.
                </p>
            </div>

            <div className="relative max-w-2xl mx-auto">
                <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                <Input
                    placeholder="Search by username..."
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    className="pl-10 h-12 text-lg"
                />
            </div>
            
            <div className="max-w-4xl mx-auto">
                {isSearching && (
                    <div className="flex justify-center p-8">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    </div>
                )}

                {!isSearching && results.length > 0 && (
                    <div className="grid md:grid-cols-2 gap-4">
                        {results.map(user => (
                            <UserResultCard key={user.uid} user={user} />
                        ))}
                    </div>
                )}

                {!isSearching && query.length > 1 && results.length === 0 && (
                    <div className="text-center py-16 border-2 border-dashed border-muted rounded-lg">
                        <User className="mx-auto h-12 w-12 text-muted-foreground" />
                        <h2 className="mt-4 text-xl font-semibold">No Players Found</h2>
                        <p className="text-muted-foreground mt-2">No users matched your search for "{query}".</p>
                    </div>
                )}
            </div>
        </div>
    );
}
