

"use client";

import type { PlayerStats as PlayerStatsType } from "@/lib/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { TrendingUp, ShieldCheck, Target, ShieldOff, Handshake, Percent, Disc3, Crosshair, ArrowRightLeft, Shield, Zap, Gamepad2 } from "lucide-react";

export function PlayerStats({ stats }: { stats: PlayerStatsType | null }) {
    if (!stats) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle>Career Statistics</CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="text-muted-foreground text-center py-8">No match data available to generate stats.</p>
                </CardContent>
            </Card>
        );
    }
    
    const kpiStats = [
        { name: 'Wins', value: stats.totalWins, icon: ShieldCheck },
        { name: 'Goals', value: stats.totalGoals, icon: Target },
        { name: 'Goals Conceded', value: stats.totalConceded, icon: ShieldOff },
        { name: 'Draws', value: stats.totalDraws, icon: Handshake },
        { name: 'Avg. Pass %', value: `${stats.avgPossession.toFixed(0)}%`, icon: Percent },
        { name: 'Clean Sheets', value: stats.totalCleanSheets, icon: Disc3 },
        { name: 'Shots', value: stats.totalShots, icon: Target },
        { name: 'Shots on Target', value: stats.totalShotsOnTarget, icon: Crosshair },
        { name: 'Passes', value: stats.totalPasses, icon: ArrowRightLeft },
        { name: 'Tackles', value: stats.totalTackles, icon: Shield },
        { name: 'Interceptions', value: stats.totalInterceptions, icon: Zap },
        { name: 'Saves', value: stats.totalSaves, icon: Handshake },
    ];
    
    const chartData = [
        { name: 'Stats', Goals: stats.totalGoals, Shots: stats.totalShots, Saves: stats.totalSaves },
    ];
    
    const chartConfig = {
      Goals: { label: "Goals", color: "hsl(var(--chart-1))" },
      Shots: { label: "Shots", color: "hsl(var(--chart-2))" },
      Saves: { label: "Saves", color: "hsl(var(--chart-3))" },
    };

    return (
        <div className="space-y-8">
            <Card>
                 <CardHeader>
                    <CardTitle className="font-headline flex items-center gap-2"><Gamepad2 className="w-5 h-5"/> Matches Played</CardTitle>
                </CardHeader>
                <CardContent className="flex items-center justify-center">
                    <p className="text-6xl font-bold">{stats.totalMatches}</p>
                </CardContent>
            </Card>
            <Card>
                <CardHeader>
                    <CardTitle className="font-headline">Career At a Glance</CardTitle>
                    <CardDescription>
                        Summary of your performance across all matches.
                    </CardDescription>
                </CardHeader>
                <CardContent className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {kpiStats.map(item => (
                        <div key={item.name} className="p-4 bg-muted/50 rounded-lg flex flex-col items-center justify-center text-center">
                            <item.icon className="h-6 w-6 text-muted-foreground mb-2" />
                            <p className="text-2xl font-bold">{item.value}</p>
                            <p className="text-xs text-muted-foreground">{item.name}</p>
                        </div>
                    ))}
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle className="font-headline flex items-center gap-2"><TrendingUp/>Performance Trends</CardTitle>
                     <CardDescription>
                       A look at your key metrics and tournament history.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-8">
                     <div>
                        <h4 className="font-semibold mb-2">Key Metrics Overview</h4>
                        <ChartContainer config={chartConfig} className="min-h-[200px] w-full">
                            <BarChart accessibilityLayer data={chartData} layout="vertical">
                                <CartesianGrid horizontal={false} />
                                <YAxis type="category" dataKey="name" tickLine={false} hide />
                                <XAxis type="number" dataKey="value" hide />
                                <Tooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
                                <Legend content={({ payload }) => (
                                    <div className="flex gap-4 justify-center mt-2">
                                        {payload?.map(entry => (
                                            <div key={entry.value} className="flex items-center gap-1.5 text-xs">
                                                <div className="h-2 w-2 rounded-full" style={{backgroundColor: entry.color}}/>
                                                {entry.value}
                                            </div>
                                        ))}
                                    </div>
                                )} />
                                <Bar dataKey="Goals" fill="var(--color-Goals)" radius={4} />
                                <Bar dataKey="Shots" fill="var(--color-Shots)" radius={4} />
                                <Bar dataKey="Saves" fill="var(--color-Saves)" radius={4} />
                            </BarChart>
                        </ChartContainer>
                     </div>
                     <div>
                        <h4 className="font-semibold mb-2">Goals Per Tournament</h4>
                        {stats.performanceHistory && stats.performanceHistory.length > 1 ? (
                            <ChartContainer config={{ Goals: { label: "Goals", color: "hsl(var(--chart-1))" } }} className="min-h-[200px] w-full">
                                <LineChart data={stats.performanceHistory}>
                                    <CartesianGrid vertical={false} />
                                    <XAxis dataKey="tournamentName" tickLine={false} axisLine={false} tickMargin={8} tick={{ fontSize: 12 }} />
                                    <YAxis />
                                    <Tooltip content={<ChartTooltipContent />} />
                                    <Line type="monotone" dataKey="goals" stroke="var(--color-Goals)" strokeWidth={2} dot={false} />
                                </LineChart>
                            </ChartContainer>
                        ) : (
                            <p className="text-muted-foreground text-sm text-center py-4">Play in more tournaments to see your performance trend.</p>
                        )}
                     </div>
                </CardContent>
            </Card>
        </div>
    );
}
