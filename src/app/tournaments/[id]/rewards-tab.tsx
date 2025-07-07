

"use client";

import { useState, useEffect } from "react";
import { getPrizeDistribution, getTournamentAwards } from "@/lib/actions";
import type { Tournament, TournamentAward } from "@/lib/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Award, Trophy, User, Target, Shield, Star } from "lucide-react";
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

const AwardCard = ({ title, icon: Icon, award }: { title: string; icon: React.ElementType; award: TournamentAward | undefined }) => {
    if (!award) return null;
    return (
        <Card className="text-center">
            <CardHeader>
                <div className="flex flex-col items-center gap-2">
                    <Icon className="w-8 h-8 text-primary" />
                    <CardTitle className="text-lg">{title}</CardTitle>
                </div>
            </CardHeader>
            <CardContent>
                <div className="flex flex-col items-center gap-2">
                    <Avatar className="h-16 w-16">
                        <AvatarImage src={award.team.logoUrl} />
                        <AvatarFallback><User /></AvatarFallback>
                    </Avatar>
                    <p className="font-bold">{award.team.name}</p>
                    <p className="text-sm text-muted-foreground">{award.reason}</p>
                </div>
            </CardContent>
        </Card>
    );
};

export function RewardsTab({ tournament }: { tournament: Tournament }) {
    const [distribution, setDistribution] = useState<PrizeDistribution[]>([]);
    const [awards, setAwards] = useState<Record<string, TournamentAward>>({});
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            try {
                if (tournament.rewardDetails && tournament.rewardDetails.type === 'money') {
                    const prizeData = await getPrizeDistribution(tournament.id);
                    setDistribution(prizeData);
                }
                
                if(tournament.status === 'completed') {
                    const awardData = await getTournamentAwards(tournament.id);
                    setAwards(awardData);
                }
            } catch (error) {
                console.error("Failed to fetch rewards data", error);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [tournament.id, tournament.rewardDetails, tournament.status]);

    if (!tournament.rewardDetails) {
        return <p>Loading reward information...</p>
    }

    const specialAwardsExist = Object.keys(awards).length > 0;

    return (
         <div className="space-y-8">
            {tournament.rewardDetails.type === 'virtual' ? (
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
            ) : (
                <Card>
                    <CardHeader>
                        <CardTitle className="font-headline flex items-center gap-2"><Trophy className="w-5 h-5 text-amber-400"/> Prize Pool Distribution</CardTitle>
                        <CardDescription>Total Prize Pool: <span className="font-bold text-lg text-foreground">₦{tournament.rewardDetails.prizePool.toLocaleString()}</span></CardDescription>
                    </CardHeader>
                    <CardContent>
                        {loading && distribution.length === 0 ? (
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
            )}

            {loading && !specialAwardsExist && (
                <div className="flex justify-center items-center h-40"><Loader2 className="h-8 w-8 animate-spin text-primary"/></div>
            )}
            
            {specialAwardsExist && (
                <div>
                     <h3 className="text-2xl font-headline font-semibold mb-4 text-center">Special Awards</h3>
                    <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
                        <AwardCard title="Best Overall Team" icon={Star} award={awards.bestOverall} />
                        <AwardCard title="Best Attacking Team" icon={Target} award={awards.bestAttacking} />
                        <AwardCard title="Best Defensive Team" icon={Shield} award={awards.bestDefensive} />
                        <AwardCard title="Highest Scoring Team" icon={Trophy} award={awards.highestScoring} />
                    </div>
                </div>
            )}
        </div>
    );
}
