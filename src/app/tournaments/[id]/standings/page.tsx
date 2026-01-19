
'use client';

import { useState, useEffect } from 'react';
import { useParams, notFound } from 'next/navigation';
import { db } from '@/lib/firebase';
import { collection, onSnapshot, query, where, orderBy, doc, getDoc } from 'firebase/firestore';
import { getTournamentById } from '@/lib/actions/tournament';
import type { Tournament, Standing, Team, Match } from '@/lib/types';
import { computeAllGroupStandings } from '@/lib/group-stage';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Trophy, Loader2 } from "lucide-react";
import { ReputationAvatar } from "@/components/reputation-avatar";
import Link from 'next/link';
import { ExportStandingsButton } from "./export-standings-button";
import { Skeleton } from '@/components/ui/skeleton';

export default function StandingsPage() {
    const params = useParams() as { id: string };
    const [tournament, setTournament] = useState<Tournament | null>(null);
    const [standings, setStandings] = useState<Standing[]>([]);
    const [teams, setTeams] = useState<Team[]>([]);
    const [groupTables, setGroupTables] = useState<Record<string, any[]>>({});
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!params.id) return;

        let active = true;

        const fetchTournamentDetails = async () => {
            try {
                const tournamentData = await getTournamentById(params.id);
                 if (!active) return;
                if (tournamentData) {
                    setTournament(tournamentData);
                } else {
                    setLoading(false); // Trigger notFound if fetch completes with no data
                }
            } catch (error) {
                console.error("Error fetching tournament details:", error);
                if(active) setLoading(false);
            }
        };

        fetchTournamentDetails();

        return () => { active = false; };
    }, [params.id]);

    useEffect(() => {
        if (!tournament) {
            return;
        }

        const tournamentId = tournament.id;
        let teamsLoaded = false;
        let dataLoaded = false;
        
        const checkDone = () => {
            if (teamsLoaded && dataLoaded) setLoading(false);
        };

        const unsubTeams = onSnapshot(query(collection(db, `tournaments/${tournamentId}/teams`)), (snapshot) => {
            const teamsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }) as Team);
            setTeams(teamsData);
            teamsLoaded = true;
            checkDone();
        });

        let unsubData: () => void;
        if (tournament.format === 'cup') {
            const matchesQuery = query(collection(db, `tournaments/${tournamentId}/matches`), orderBy("round", "asc"));
            unsubData = onSnapshot(matchesQuery, (snapshot) => {
                const matchesData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Match));
                const tables = computeAllGroupStandings(matchesData);
                setGroupTables(tables);
                dataLoaded = true;
                checkDone();
            });
        } else {
            const standingsQuery = query(collection(db, "standings"), where("tournamentId", "==", tournamentId), orderBy("ranking", "asc"));
            unsubData = onSnapshot(standingsQuery, (snapshot) => {
                const standingsData = snapshot.docs.map(doc => doc.data() as Standing);
                setStandings(standingsData);
                dataLoaded = true;
                checkDone();
            });
        }
        
        return () => {
            unsubTeams();
            if(unsubData) unsubData();
        };

    }, [tournament]);

    const getTeamInfo = (teamId: string) => {
        return teams.find(t => t.id === teamId) || { name: 'Unknown', logoUrl: '', captainId: '' };
    }
    
    if (loading) {
        return (
            <div className="container py-10">
                <Card>
                    <CardHeader>
                        <Skeleton className="h-8 w-3/5" />
                        <Skeleton className="h-4 w-4/5" />
                    </CardHeader>
                    <CardContent className="flex justify-center items-center h-64">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    </CardContent>
                </Card>
            </div>
        )
    }

    if (!tournament) {
        return notFound();
    }
    
    const isCupStyle = tournament.format === 'cup';

    return (
        <div className="container py-10">
            <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                    <div>
                        <CardTitle className="font-headline flex items-center gap-2"><Trophy className="w-5 h-5" /> {tournament.name} Standings</CardTitle>
                        <CardDescription>
                            {isCupStyle ? 'Group stage tables (top 2 advance to knockout).' : 'Live rankings based on approved match results.'}
                        </CardDescription>
                    </div>
                    {!isCupStyle && <ExportStandingsButton tournamentId={params.id} />}
                </CardHeader>
                <CardContent>
                    {isCupStyle ? (
                        Object.keys(groupTables as any).length === 0 ? (
                            <p className="text-muted-foreground text-center py-8">Group tables will appear once group matches are played and results are approved.</p>
                        ) : (
                            <div className="space-y-10">
                                {Object.entries(groupTables as any).map(([groupName, rows]: any) => (
                                    <div key={groupName} className="space-y-3">
                                        <div>
                                            <h3 className="text-lg font-semibold font-headline">{groupName}</h3>
                                            <p className="text-sm text-muted-foreground">Top 2 teams advance to the knockout stage.</p>
                                        </div>
                                        <Table>
                                            <TableHeader>
                                                <TableRow>
                                                    <TableHead className="w-[50px]">Pos</TableHead>
                                                    <TableHead>Team</TableHead>
                                                    <TableHead className="text-center">MP</TableHead>
                                                    <TableHead className="text-center">W</TableHead>
                                                    <TableHead className="text-center">D</TableHead>
                                                    <TableHead className="text-center">L</TableHead>
                                                    <TableHead className="text-center">GF</TableHead>
                                                    <TableHead className="text-center">GA</TableHead>
                                                    <TableHead className="text-center">GD</TableHead>
                                                    <TableHead className="text-center">Pts</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {rows.map((row: any, idx: number) => {
                                                    const teamInfo = getTeamInfo(row.teamId);
                                                    const highlight = idx < 2 ? 'bg-primary/5' : '';
                                                    return (
                                                        <TableRow key={row.teamId} className={highlight}>
                                                            <TableCell className="font-bold text-lg">{idx + 1}</TableCell>
                                                            <TableCell>
                                                                <Link href={`/profile/${teamInfo.captainId}`} className="flex items-center gap-2 hover:underline">
                                                                    <ReputationAvatar profile={teamInfo} className="h-8 w-8" />
                                                                    <span className="font-medium">{teamInfo.name}</span>
                                                                </Link>
                                                            </TableCell>
                                                            <TableCell className="text-center font-semibold">{row.matchesPlayed}</TableCell>
                                                            <TableCell className="text-center">{row.wins}</TableCell>
                                                            <TableCell className="text-center">{row.draws}</TableCell>
                                                            <TableCell className="text-center">{row.losses}</TableCell>
                                                            <TableCell className="text-center">{row.goalsFor}</TableCell>
                                                            <TableCell className="text-center">{row.goalsAgainst}</TableCell>
                                                            <TableCell className="text-center">{row.goalDifference > 0 ? `+${row.goalDifference}` : row.goalDifference}</TableCell>
                                                            <TableCell className="text-center font-bold">{row.points}</TableCell>
                                                        </TableRow>
                                                    );
                                                })}
                                            </TableBody>
                                        </Table>
                                    </div>
                                ))}
                            </div>
                        )
                    ) : standings.length === 0 ? (
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
