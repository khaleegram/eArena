
'use client';

import { useState, useEffect } from 'react';
import { getLeaderboardByWins, getLeaderboardByTournamentsWon, getLeaderboardByGoals, getLeaderboardByReputation } from '@/lib/actions';
import type { UserProfile, PlayerStats } from '@/lib/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, Trophy, ShieldCheck, Target, HeartHandshake } from 'lucide-react';
import { ReputationAvatar } from '@/components/reputation-avatar';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';

type LeaderboardCategory = 'wins' | 'trophies' | 'goals' | 'reputation';
type LeaderboardData = (UserProfile & Partial<PlayerStats>)[];

const categoryConfig = {
    wins: {
        title: 'Most Matches Won',
        description: 'Players with the most individual match victories.',
        icon: ShieldCheck,
        fetcher: getLeaderboardByWins,
        statKey: 'totalWins',
        statLabel: 'Wins'
    },
    trophies: {
        title: 'Most Decorated',
        description: 'Players with the most 1st place tournament victories.',
        icon: Trophy,
        fetcher: getLeaderboardByTournamentsWon,
        statKey: 'tournamentsWon',
        statLabel: 'Trophies'
    },
    goals: {
        title: 'Top Scorers',
        description: 'Players who have scored the most goals across all competitions.',
        icon: Target,
        fetcher: getLeaderboardByGoals,
        statKey: 'totalGoals',
        statLabel: 'Goals'
    },
    reputation: {
        title: 'Top Reputation',
        description: 'Players with the best sportsmanship records (fewest warnings).',
        icon: HeartHandshake,
        fetcher: getLeaderboardByReputation,
        statKey: 'warnings',
        statLabel: 'Warnings'
    }
};

const LeaderboardTable = ({ data, isLoading, statKey, statLabel, category }: { data: LeaderboardData, isLoading: boolean, statKey: keyof (UserProfile & PlayerStats), statLabel: string, category: LeaderboardCategory }) => {
    if (isLoading) {
        return <div className="flex justify-center items-center h-64"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
    }

    if (data.length === 0) {
        return <p className="text-center text-muted-foreground py-8">No data available for this leaderboard yet.</p>;
    }

    return (
        <Table>
            <TableHeader>
                <TableRow>
                    <TableHead className="w-[50px]">Rank</TableHead>
                    <TableHead>Player</TableHead>
                    <TableHead className="text-right">{statLabel}</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {data.map((player, index) => (
                    <TableRow key={player.uid}>
                        <TableCell className="font-bold text-lg">{index + 1}</TableCell>
                        <TableCell>
                            <Link href={`/profile/${player.uid}`} className="flex items-center gap-3 hover:underline">
                                <ReputationAvatar profile={player} />
                                <div className="flex flex-col">
                                  <span className="font-medium">{player.username}</span>
                                  {player.activeTitle && <Badge variant="outline" className="text-xs w-fit">{player.activeTitle}</Badge>}
                                </div>
                            </Link>
                        </TableCell>
                        <TableCell className="text-right font-semibold text-lg">
                           {String(player[statKey as keyof typeof player] ?? 0)}
                        </TableCell>
                    </TableRow>
                ))}
            </TableBody>
        </Table>
    );
};

export default function LeaderboardsPage() {
    const [activeTab, setActiveTab] = useState<LeaderboardCategory>('wins');
    const [leaderboardData, setLeaderboardData] = useState<LeaderboardData>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const fetchLeaderboard = async () => {
            setIsLoading(true);
            try {
                const data = await categoryConfig[activeTab].fetcher();
                setLeaderboardData(data);
            } catch (error) {
                console.error(`Failed to fetch ${activeTab} leaderboard:`, error);
            } finally {
                setIsLoading(false);
            }
        };

        fetchLeaderboard();
    }, [activeTab]);

    const currentConfig = categoryConfig[activeTab];

    return (
        <div className="container py-10">
            <div className="text-center mb-12">
                <h1 className="text-4xl font-bold font-headline">Leaderboards</h1>
                <p className="max-w-2xl mx-auto mt-2 text-muted-foreground">
                    See who is dominating the competition in eArena.
                </p>
            </div>

            <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as LeaderboardCategory)} className="w-full">
                <TabsList className="grid w-full grid-cols-2 md:grid-cols-4 h-auto">
                    {Object.entries(categoryConfig).map(([key, config]) => (
                        <TabsTrigger key={key} value={key} className="flex flex-col h-auto p-3 gap-1">
                            <config.icon className="w-5 h-5" />
                            <span>{config.title}</span>
                        </TabsTrigger>
                    ))}
                </TabsList>
                
                <Card className="mt-6">
                    <CardHeader>
                        <CardTitle className="font-headline flex items-center gap-2">
                            <currentConfig.icon className="w-5 h-5 text-primary" />
                            {currentConfig.title}
                        </CardTitle>
                        <CardDescription>{currentConfig.description}</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <LeaderboardTable
                            data={leaderboardData}
                            isLoading={isLoading}
                            statKey={currentConfig.statKey as keyof (UserProfile & PlayerStats)}
                            statLabel={currentConfig.statLabel}
                            category={activeTab}
                        />
                    </CardContent>
                </Card>
            </Tabs>
        </div>
    );
}
