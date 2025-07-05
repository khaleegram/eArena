
'use client';

import { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { findUsersByUsername, getPlayerStats } from '@/lib/actions';
import type { UserProfile, PlayerStats } from '@/lib/types';
import { Loader2, BarChart, Users, Search, X } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, Legend, Tooltip } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from './ui/chart';

// The main dialog component
export function PlayerComparisonDialog({ currentUserProfile, currentUserStats }: { currentUserProfile: UserProfile, currentUserStats: PlayerStats | null }) {
    const [open, setOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [searchResults, setSearchResults] = useState<UserProfile[]>([]);
    const [isLoadingSearch, setIsLoadingSearch] = useState(false);
    const [opponentProfile, setOpponentProfile] = useState<UserProfile | null>(null);
    const [opponentStats, setOpponentStats] = useState<PlayerStats | null>(null);
    const [isLoadingStats, setIsLoadingStats] = useState(false);
    const { toast } = useToast();

    useEffect(() => {
        const delayDebounceFn = setTimeout(async () => {
            if (searchTerm.length < 3) {
                setSearchResults([]);
                return;
            }
            setIsLoadingSearch(true);
            try {
                const results = await findUsersByUsername(searchTerm);
                setSearchResults(results.filter(p => p.uid !== currentUserProfile.uid)); // Exclude self
            } catch (error) {
                toast({ variant: 'destructive', title: 'Error', description: 'Could not search for players.' });
            } finally {
                setIsLoadingSearch(false);
            }
        }, 300);

        return () => clearTimeout(delayDebounceFn);
    }, [searchTerm, toast, currentUserProfile.uid]);

    const handleSelectOpponent = async (profile: UserProfile) => {
        setIsLoadingStats(true);
        setSearchTerm('');
        setSearchResults([]);
        setOpponentProfile(profile);
        try {
            const stats = await getPlayerStats(profile.uid);
            setOpponentStats(stats);
        } catch (error) {
            toast({ variant: 'destructive', title: 'Error', description: 'Could not fetch opponent stats.' });
            setOpponentProfile(null);
        } finally {
            setIsLoadingStats(false);
        }
    };
    
    const handleReset = () => {
        setOpponentProfile(null);
        setOpponentStats(null);
    }

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button><BarChart className="mr-2 h-4 w-4" /> Compare Stats</Button>
            </DialogTrigger>
            <DialogContent className="max-w-4xl">
                <DialogHeader>
                    <DialogTitle>Compare Player Performance</DialogTitle>
                    <DialogDescription>
                        Select another player to compare your career stats side-by-side.
                    </DialogDescription>
                </DialogHeader>
                
                {!opponentProfile ? (
                    <div className="py-4">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Search by username..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="pl-10"
                            />
                        </div>
                        {isLoadingSearch && <div className="flex justify-center p-4"><Loader2 className="h-6 w-6 animate-spin" /></div>}
                        <div className="mt-4 space-y-2 max-h-60 overflow-y-auto">
                            {searchResults.map(profile => (
                                <div key={profile.uid} onClick={() => handleSelectOpponent(profile)} className="flex items-center gap-4 p-2 rounded-md hover:bg-accent cursor-pointer">
                                    <Avatar>
                                        <AvatarImage src={profile.photoURL} />
                                        <AvatarFallback>{profile.username?.charAt(0)}</AvatarFallback>
                                    </Avatar>
                                    <span className="font-medium">{profile.username}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                ) : (
                     <div className="py-4">
                        {isLoadingStats ? (
                            <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin" /></div>
                        ) : (
                           <ComparisonView
                                profileA={currentUserProfile}
                                statsA={currentUserStats}
                                profileB={opponentProfile}
                                statsB={opponentStats}
                                onReset={handleReset}
                           />
                        )}
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}

// Sub-component for displaying the actual comparison
function ComparisonView({ profileA, statsA, profileB, statsB, onReset }: { profileA: UserProfile, statsA: PlayerStats | null, profileB: UserProfile, statsB: PlayerStats | null, onReset: () => void }) {
    const comparisonData = useMemo(() => {
        const sA = statsA || { totalWins: 0, totalGoals: 0, totalShots: 0, totalShotsOnTarget: 0, totalCleanSheets: 0, totalTackles: 0, totalInterceptions: 0, totalSaves: 0 };
        const sB = statsB || { totalWins: 0, totalGoals: 0, totalShots: 0, totalShotsOnTarget: 0, totalCleanSheets: 0, totalTackles: 0, totalInterceptions: 0, totalSaves: 0 };

        const attacking = [
            { subject: 'Wins', A: sA.totalWins, B: sB.totalWins, fullMark: Math.max(10, sA.totalWins, sB.totalWins) },
            { subject: 'Goals', A: sA.totalGoals, B: sB.totalGoals, fullMark: Math.max(10, sA.totalGoals, sB.totalGoals) },
            { subject: 'Shots', A: sA.totalShots, B: sB.totalShots, fullMark: Math.max(10, sA.totalShots, sB.totalShots) },
            { subject: 'On Target', A: sA.totalShotsOnTarget, B: sB.totalShotsOnTarget, fullMark: Math.max(10, sA.totalShotsOnTarget, sB.totalShotsOnTarget) },
        ];

        const defending = [
            { subject: 'Clean Sheets', A: sA.totalCleanSheets, B: sB.totalCleanSheets, fullMark: Math.max(5, sA.totalCleanSheets, sB.totalCleanSheets) },
            { subject: 'Tackles', A: sA.totalTackles, B: sB.totalTackles, fullMark: Math.max(10, sA.totalTackles, sB.totalTackles) },
            { subject: 'Interceptions', A: sA.totalInterceptions, B: sB.totalInterceptions, fullMark: Math.max(10, sA.totalInterceptions, sB.totalInterceptions) },
            { subject: 'Saves', A: sA.totalSaves, B: sB.totalSaves, fullMark: Math.max(10, sA.totalSaves, sB.totalSaves) },
        ];
        return { attacking, defending };
    }, [statsA, statsB]);

    return (
        <div className="space-y-4">
             <div className="flex justify-between items-center">
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2"><div className="h-3 w-3 rounded-sm bg-blue-500"/><span>{profileA.username}</span></div>
                    <div className="flex items-center gap-2"><div className="h-3 w-3 rounded-sm bg-green-500"/><span>{profileB.username}</span></div>
                </div>
                <Button variant="ghost" size="icon" onClick={onReset}><X className="h-4 w-4" /></Button>
             </div>
             <div className="grid md:grid-cols-2 gap-4">
                 <Card>
                    <CardHeader><CardTitle className="text-lg">Attacking Prowess</CardTitle></CardHeader>
                    <CardContent>
                        <ChartContainer config={{}} className="mx-auto aspect-square max-h-[250px]">
                            <RadarChart data={comparisonData.attacking}>
                                <Tooltip content={<ChartTooltipContent />} />
                                <PolarGrid />
                                <PolarAngleAxis dataKey="subject" />
                                <Radar name={profileA.username || 'Player A'} dataKey="A" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.6} />
                                <Radar name={profileB.username || 'Player B'} dataKey="B" stroke="#22c55e" fill="#22c55e" fillOpacity={0.6} />
                            </RadarChart>
                        </ChartContainer>
                    </CardContent>
                 </Card>
                 <Card>
                    <CardHeader><CardTitle className="text-lg">Defensive Solidity</CardTitle></CardHeader>
                    <CardContent>
                         <ChartContainer config={{}} className="mx-auto aspect-square max-h-[250px]">
                             <RadarChart data={comparisonData.defending}>
                                <Tooltip content={<ChartTooltipContent />} />
                                <PolarGrid />
                                <PolarAngleAxis dataKey="subject" />
                                <Radar name={profileA.username || 'Player A'} dataKey="A" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.6} />
                                <Radar name={profileB.username || 'Player B'} dataKey="B" stroke="#22c55e" fill="#22c55e" fillOpacity={0.6} />
                            </RadarChart>
                        </ChartContainer>
                    </CardContent>
                 </Card>
             </div>
        </div>
    );
}
