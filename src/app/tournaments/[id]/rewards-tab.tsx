

"use client";

import { useState, useEffect } from "react";
import { getPrizeDistribution } from "@/lib/actions";
import type { Tournament } from "@/lib/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Award, Trophy, User } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

interface PrizeDistribution {
    category: string;
    percentage: number;
    amount: number;
    winner?: {
        teamId: string;
        teamName: string;
        logoUrl?: string;
    } | null;
}

export function RewardsTab({ tournament }: { tournament: Tournament }) {
    const [distribution, setDistribution] = useState<PrizeDistribution[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!tournament.rewardDetails || tournament.rewardDetails.type === 'virtual') {
            setLoading(false);
            return;
        }

        const fetchDistribution = async () => {
            setLoading(true);
            try {
                const data = await getPrizeDistribution(tournament.id);
                setDistribution(data);
            } catch (error) {
                console.error("Failed to fetch prize distribution", error);
            } finally {
                setLoading(false);
            }
        };

        fetchDistribution();
    }, [tournament.id, tournament.rewardDetails]);

    if (!tournament.rewardDetails || tournament.rewardDetails.type === 'virtual') {
        return (
            <Card>
                <CardHeader>
                    <CardTitle className="font-headline flex items-center gap-2"><Award className="w-5 h-5"/> Rewards &amp; Prizes</CardTitle>
                    <CardDescription>This is a free-to-enter tournament.</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col items-center text-center py-8">
                     <Trophy className="w-24 h-24 text-amber-400/80 mb-4" />
                    <p className="text-muted-foreground max-w-sm">
                        Winners will receive virtual trophies and exclusive badges on their profiles to commemorate their achievement.
                    </p>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle className="font-headline flex items-center gap-2"><Trophy className="w-5 h-5 text-amber-400"/> Prize Pool Distribution</CardTitle>
                <CardDescription>Total Prize Pool: <span className="font-bold text-lg text-foreground">₦{tournament.rewardDetails.prizePool.toLocaleString()}</span></CardDescription>
            </CardHeader>
            <CardContent>
                {loading ? (
                    <div className="flex justify-center items-center h-40">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    </div>
                ) : (
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Category</TableHead>
                                <TableHead className="text-center">Allocation</TableHead>
                                <TableHead className="text-center">Amount (NGN)</TableHead>
                                {tournament.status === 'completed' && <TableHead>Winner</TableHead>}
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {distribution.map((item, index) => (
                                <TableRow key={index}>
                                    <TableCell className="font-semibold">{item.category}</TableCell>
                                    <TableCell className="text-center">{item.percentage}%</TableCell>
                                    <TableCell className="text-center font-mono">₦{item.amount.toLocaleString()}</TableCell>
                                    {tournament.status === 'completed' && (
                                        <TableCell>
                                            {item.winner ? (
                                                 <div className="flex items-center gap-2">
                                                    <Avatar className="h-6 w-6">
                                                        <AvatarImage src={item.winner.logoUrl} alt={item.winner.teamName} />
                                                        <AvatarFallback><User /></AvatarFallback>
                                                    </Avatar>
                                                    <span className="font-medium">{item.winner.teamName}</span>
                                                </div>
                                            ) : (
                                                <span className="text-muted-foreground">N/A</span>
                                            )}
                                        </TableCell>
                                    )}
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                )}
            </CardContent>
        </Card>
    );
}
