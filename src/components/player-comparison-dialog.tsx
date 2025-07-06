

'use client';

import { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import type { UserProfile, PlayerStats } from '@/lib/types';
import { Loader2, BarChart, Users } from 'lucide-react';
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, Legend, Tooltip } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from './ui/chart';

interface PlayerComparisonDialogProps {
    profileA: UserProfile;
    statsA: PlayerStats | null;
    profileB: UserProfile;
    statsB: PlayerStats | null;
}

export function PlayerComparisonDialog({ profileA, statsA, profileB, statsB }: PlayerComparisonDialogProps) {
    const [open, setOpen] = useState(false);
    
    // Determine if we are still loading data needed for the chart
    const isLoading = !statsA || !statsB;

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button disabled={!profileA || !profileB}><BarChart className="mr-2 h-4 w-4" /> Compare Stats</Button>
            </DialogTrigger>
            <DialogContent className="max-w-4xl">
                <DialogHeader>
                    <DialogTitle>Compare Player Performance</DialogTitle>
                    <DialogDescription>
                        A side-by-side comparison of career stats.
                    </DialogDescription>
                </DialogHeader>
                
                <div className="py-4">
                    {isLoading ? (
                        <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin" /></div>
                    ) : (
                        <ComparisonView
                            profileA={profileA}
                            statsA={statsA}
                            profileB={profileB}
                            statsB={statsB}
                        />
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}

// Sub-component for displaying the actual comparison
function ComparisonView({ profileA, statsA, profileB, statsB }: { profileA: UserProfile, statsA: PlayerStats | null, profileB: UserProfile, statsB: PlayerStats | null }) {
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
