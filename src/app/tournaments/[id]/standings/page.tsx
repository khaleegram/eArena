
import { getTournamentById } from "@/lib/actions";
import { getTeamsForTournament, getStandingsForTournament } from "@/lib/actions";
import { notFound } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Trophy } from "lucide-react";
import { ReputationAvatar } from "@/components/reputation-avatar";
import Link from 'next/link';
import { ExportStandingsButton } from "./export-standings-button";

export default async function StandingsPage({ params }: { params: { id: string } }) {
    const tournament = await getTournamentById(params.id);

    if (!tournament) {
        notFound();
    }

    const [standings, teams] = await Promise.all([
        getStandingsForTournament(params.id),
        getTeamsForTournament(params.id),
    ]);

    const getTeamInfo = (teamId: string) => {
        return teams.find(t => t.id === teamId) || { name: 'Unknown', logoUrl: '' };
    }

    return (
        <div className="container py-10">
            <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                    <div>
                        <CardTitle className="font-headline flex items-center gap-2"><Trophy className="w-5 h-5" /> {tournament.name} Standings</CardTitle>
                        <CardDescription>Live rankings based on approved match results.</CardDescription>
                    </div>
                    <ExportStandingsButton tournamentId={params.id} />
                </CardHeader>
                <CardContent>
                    {standings.length === 0 ? (
                        <p className="text-muted-foreground text-center py-8">Standings will appear here once matches are played and results are approved.</p>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="w-[50px]">Rank</TableHead>
                                    <TableHead>Team</TableHead>
                                    <TableHead className="text-center">MP</TableHead>
                                    <TableHead className="text-center">W</TableHead>
                                    <TableHead className="text-center">D</TableHead>
                                    <TableHead className="text-center">L</TableHead>
                                    <TableHead className="text-center">GF</TableHead>
                                    <TableHead className="text-center">GA</TableHead>
                                    <TableHead className="text-center">GD</TableHead>
                                    <TableHead className="text-center">CS</TableHead>
                                    <TableHead className="text-center">Pts</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {standings.map(standing => {
                                    const teamInfo = getTeamInfo(standing.teamId);
                                    const goalDifference = standing.goalsFor - standing.goalsAgainst;
                                    return (
                                        <TableRow key={standing.teamId}>
                                            <TableCell className="font-bold text-lg">{standing.ranking}</TableCell>
                                            <TableCell>
                                                <Link href={`/profile/${teamInfo.captainId}`} className="flex items-center gap-2 hover:underline">
                                                    <ReputationAvatar profile={teamInfo} className="h-8 w-8" />
                                                    <span className="font-medium">{teamInfo.name}</span>
                                                </Link>
                                            </TableCell>
                                            <TableCell className="text-center font-semibold">{standing.matchesPlayed}</TableCell>
                                            <TableCell className="text-center">{standing.wins}</TableCell>
                                            <TableCell className="text-center">{standing.draws}</TableCell>
                                            <TableCell className="text-center">{standing.losses}</TableCell>
                                            <TableCell className="text-center">{standing.goalsFor}</TableCell>
                                            <TableCell className="text-center">{standing.goalsAgainst}</TableCell>
                                            <TableCell className="text-center">{goalDifference > 0 ? `+${goalDifference}` : goalDifference}</TableCell>
                                            <TableCell className="text-center">{standing.cleanSheets}</TableCell>
                                            <TableCell className="text-center font-bold">{standing.points}</TableCell>
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
