
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { db } from '@/lib/firebase';
import { collection, query, where, onSnapshot, getDocs } from 'firebase/firestore';
import { useAuth } from '@/hooks/use-auth';
import type { Tournament, Team, UnifiedTimestamp } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { deleteTournament, getTournamentsByIds } from '@/lib/actions';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { PlusCircle, ArrowRight, Loader2, Gamepad2, Trash2, CheckCircle, Trophy, Users, Calendar } from 'lucide-react';
import { format } from 'date-fns';
import { Separator } from '@/components/ui/separator';

const toDate = (timestamp: UnifiedTimestamp): Date => {
    if (typeof timestamp === 'string') {
        return new Date(timestamp);
    }
    if (timestamp && typeof (timestamp as any).toDate === 'function') {
        return (timestamp as any).toDate();
    }
    return timestamp as Date;
};

const TournamentCard = ({ tournament, isOrganizer }: { tournament: Tournament, isOrganizer: boolean }) => {
    const [isDeleting, setIsDeleting] = useState<string | null>(null);
    const { toast } = useToast();
    const { user } = useAuth();

    const handleDelete = async (tournamentId: string) => {
        if (!user) {
            toast({ variant: "destructive", title: "Error", description: "You must be logged in to perform this action." });
            return;
        }
        setIsDeleting(tournamentId);
        try {
            await deleteTournament(tournamentId, user.uid);
            toast({ title: "Success", description: "Tournament deleted successfully." });
        } catch (error: any) {
            toast({ variant: "destructive", title: "Error", description: "Failed to delete tournament." });
        } finally {
            setIsDeleting(null);
        }
    }

    const startDate = toDate(tournament.tournamentStartDate);
    const endDate = toDate(tournament.tournamentEndDate);

    return (
        <Card className="flex flex-col bg-card/50 hover:bg-card transition-colors">
            <CardHeader>
                <div className="flex items-center justify-between">
                    <CardTitle className="font-headline">{tournament.name}</CardTitle>
                    {isOrganizer ? (
                        <Trophy className="w-5 h-5 text-amber-400" />
                    ) : (
                        <CheckCircle className="w-5 h-5 text-green-500" />
                    )}
                </div>
                <CardDescription className="flex items-center gap-2">
                    <Gamepad2 className="w-4 h-4"/>
                    {tournament.game} on {tournament.platform}
                </CardDescription>
            </CardHeader>
            <CardContent className="flex-grow">
                <p className="text-sm text-muted-foreground line-clamp-3">{tournament.description}</p>
                {startDate && endDate && (
                    <div className="text-sm text-muted-foreground mt-4">
                        {format(startDate, 'PPP')} - {format(endDate, 'PPP')}
                    </div>
                )}
            </CardContent>
            <CardFooter className="flex items-center justify-between gap-2">
                <Link href={`/tournaments/${tournament.id}`} className="flex-grow">
                    <Button variant="secondary" className="w-full">
                        {isOrganizer ? 'Manage' : 'View'} Tournament
                        <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                </Link>
                {isOrganizer && (
                    <AlertDialog>
                        <AlertDialogTrigger asChild>
                            <Button variant="destructive" size="icon" disabled={isDeleting === tournament.id}>
                                {isDeleting === tournament.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                            </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                            <AlertDialogHeader>
                                <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                                <AlertDialogDescription>
                                    This action cannot be undone. This will permanently delete the
                                    tournament and all of its associated data.
                                </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleDelete(tournament.id)}>
                                    Yes, delete it
                                </AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                )}
            </CardFooter>
        </Card>
    );
}

export default function MyTournamentsPage() {
  const { user, settings: platformSettings } = useAuth();
  const [organizedTournaments, setOrganizedTournaments] = useState<Tournament[]>([]);
  const [joinedTournaments, setJoinedTournaments] = useState<Tournament[]>([]);
  const [loading, setLoading] = useState(true);


  useEffect(() => {
    if (!user) {
        setLoading(false);
        return;
    };

    setLoading(true);
    let organizedUnsub: () => void;
    let joinedUnsub: () => void;
    
    // Fetch organized tournaments
    const orgQuery = query(collection(db, 'tournaments'), where('organizerId', '==', user.uid));
    organizedUnsub = onSnapshot(orgQuery, (querySnapshot) => {
        const userTournaments = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Tournament));
        setOrganizedTournaments(userTournaments);
    });
    
    // Fetch joined tournaments
    const joinedQuery = query(collection(db, 'userMemberships'), where('userId', '==', user.uid));
    joinedUnsub = onSnapshot(joinedQuery, async (snapshot) => {
        const tournamentIds = snapshot.docs.map(doc => doc.data().tournamentId);
        if (tournamentIds.length > 0) {
            const tournaments = await getTournamentsByIds(tournamentIds);
            setJoinedTournaments(tournaments);
        } else {
            setJoinedTournaments([]);
        }
    });

    const initialLoad = async () => {
        const orgSnapshot = await getDocs(orgQuery);
        const joinedSnapshot = await getDocs(joinedQuery);

        const orgTournaments = orgSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Tournament));
        setOrganizedTournaments(orgTournaments);

        const tournamentIds = joinedSnapshot.docs.map(doc => doc.data().tournamentId);
        if (tournamentIds.length > 0) {
            const joinedData = await getTournamentsByIds(tournamentIds);
            setJoinedTournaments(joinedData);
        } else {
            setJoinedTournaments([]);
        }
        setLoading(false);
    };

    initialLoad();

    return () => {
        if (organizedUnsub) organizedUnsub();
        if (joinedUnsub) joinedUnsub();
    };
  }, [user]);

  if (loading || platformSettings === null) {
    return (
      <div className="flex justify-center items-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold font-headline">My Dashboard</h1>
        {platformSettings.allowNewTournaments && (
            <Link href="/dashboard/create-tournament">
            <Button>
                <PlusCircle className="mr-2 h-4 w-4" />
                Create Tournament
            </Button>
            </Link>
        )}
      </div>

      <div className="space-y-8">
        <div>
            <h2 className="text-2xl font-semibold font-headline flex items-center gap-2 mb-4">
                <Trophy className="text-amber-400" /> Organized Tournaments
            </h2>
            {organizedTournaments.length === 0 ? (
                <div className="text-center py-16 border-2 border-dashed border-muted rounded-lg">
                    <h2 className="text-xl font-semibold">Your arena is empty!</h2>
                    <p className="text-muted-foreground mt-2">Get started by creating your first tournament.</p>
                    {platformSettings.allowNewTournaments && (
                        <Link href="/dashboard/create-tournament" className="mt-4 inline-block">
                            <Button variant="outline">Create a New Tournament</Button>
                        </Link>
                    )}
                </div>
            ) : (
                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                    {organizedTournaments.map((tournament) => (
                        <TournamentCard key={tournament.id} tournament={tournament} isOrganizer={true} />
                    ))}
                </div>
            )}
        </div>

        <Separator />

         <div>
            <h2 className="text-2xl font-semibold font-headline flex items-center gap-2 mb-4">
                <Users className="text-blue-400" /> Joined Tournaments
            </h2>
            {joinedTournaments.length === 0 ? (
                 <div className="text-center py-16 border-2 border-dashed border-muted rounded-lg">
                    <h2 className="text-xl font-semibold">You haven't joined any tournaments yet.</h2>
                    <p className="text-muted-foreground mt-2">Find a competition and jump into the action!</p>
                    <Link href="/tournaments" className="mt-4 inline-block">
                        <Button variant="outline">Browse Public Tournaments</Button>
                    </Link>
                </div>
            ) : (
                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                    {joinedTournaments.map((tournament) => (
                         <TournamentCard key={tournament.id} tournament={tournament} isOrganizer={false} />
                    ))}
                </div>
            )}
        </div>
      </div>
    </div>
  );
}
