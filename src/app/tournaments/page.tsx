

"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getPublicTournaments, getJoinedTournamentIdsForUser } from '@/lib/actions';
import type { Tournament, UnifiedTimestamp, TournamentStatus } from '@/lib/types';
import { useAuth } from '@/hooks/use-auth';
import { useCountdown } from '@/hooks/use-countdown';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowRight, KeyRound, Users, Calendar, CheckCircle, Shield, History } from 'lucide-react';
import { format, isBefore, isAfter, endOfDay } from 'date-fns';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
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

const RegistrationCountdownBadge = ({ endDate }: { endDate: UnifiedTimestamp }) => {
    const countdown = useCountdown(toDate(endDate));
    if (countdown.isFinished) return null;
    
    let text = `${String(countdown.hours).padStart(2,'0')}:${String(countdown.minutes).padStart(2,'0')}:${String(countdown.seconds).padStart(2,'0')}`;
    if(countdown.days > 0) {
        text = `${countdown.days}d ${text}`;
    }

    return <Badge variant="destructive" className="animate-pulse">Closes in: {text}</Badge>;
}

const TournamentCard = ({ tournament, hasJoined }: { tournament: Tournament, hasJoined: boolean }) => {
    const isRegistrationOpen = tournament.registrationStartDate && tournament.registrationEndDate && isAfter(new Date(), toDate(tournament.registrationStartDate)) && isBefore(new Date(), endOfDay(toDate(tournament.registrationEndDate)));

    return (
        <Card key={tournament.id} className="flex flex-col bg-card/50 hover:bg-card transition-colors">
            <CardHeader>
                <div className="flex justify-between items-start">
                    <CardTitle className="font-headline">{tournament.name}</CardTitle>
                    <div className="flex flex-col items-end gap-1">
                        {hasJoined && <Badge variant="outline" className="border-green-500 text-green-500"><CheckCircle className="w-3 h-3 mr-1"/>Joined</Badge>}
                        {isRegistrationOpen && <RegistrationCountdownBadge endDate={tournament.registrationEndDate} />}
                    </div>
                </div>
                <CardDescription>{tournament.game} on {tournament.platform}</CardDescription>
            </CardHeader>
            <CardContent className="flex-grow space-y-4">
                <p className="text-sm text-muted-foreground line-clamp-3">{tournament.description}</p>
                <div className="text-sm text-muted-foreground space-y-2">
                    {tournament.tournamentStartDate && tournament.tournamentEndDate && (
                        <div className="flex items-center gap-2">
                            <Calendar className="h-4 w-4" />
                            <span>{format(toDate(tournament.tournamentStartDate), 'PPP')} - {format(toDate(tournament.tournamentEndDate), 'PPP')}</span>
                        </div>
                    )}
                    <div className="flex items-center gap-2">
                        <Users className="h-4 w-4" />
                        <span>{tournament.teamCount} / {tournament.maxTeams} teams</span>
                    </div>
                </div>
            </CardContent>
            <CardFooter>
                 <Link href={`/tournaments/${tournament.id}`} className="w-full">
                    <Button variant="secondary" className="w-full">
                        {hasJoined ? 'Manage' : (tournament.status === 'open_for_registration' ? 'Join' : 'View')}
                        <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                </Link>
            </CardFooter>
        </Card>
    );
}

export default function BrowseTournamentsPage() {
  const [allTournaments, setAllTournaments] = useState<Tournament[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const { user } = useAuth();
  const [joinedTournamentIds, setJoinedTournamentIds] = useState<string[]>([]);
  
  useEffect(() => {
    const fetchTournaments = async () => {
        setLoading(true);
        try {
            const publicTournaments = await getPublicTournaments();
            setAllTournaments(publicTournaments);
            if (user) {
              const ids = await getJoinedTournamentIdsForUser(user.uid);
              setJoinedTournamentIds(ids);
            }
        } catch (error) {
            console.error("Error fetching public tournaments:", error);
        } finally {
            setLoading(false);
        }
    };
    
    fetchTournaments();
  }, [user]);

  const activeStatuses: TournamentStatus[] = ['open_for_registration', 'in_progress', 'ready_to_start'];
  const completedStatuses: TournamentStatus[] = ['completed'];

  const filterAndSort = (tournaments: Tournament[], statuses: TournamentStatus[]) => {
      return tournaments
        .filter(t => statuses.includes(t.status))
        .filter(t => t.name.toLowerCase().includes(searchTerm.toLowerCase()) || t.game.toLowerCase().includes(searchTerm.toLowerCase()));
  }
  
  const activeTournaments = filterAndSort(allTournaments, activeStatuses);
  const pastTournaments = filterAndSort(allTournaments, completedStatuses);
  
  return (
    <div className="container py-10">
      <div className="space-y-8">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <h1 className="text-3xl font-bold font-headline">Browse Public Tournaments</h1>
          <Link href="/tournaments/join">
            <Button variant="outline">
              <KeyRound className="mr-2" /> Join with Code
            </Button>
          </Link>
        </div>
        
        <div className="relative">
            <Input 
                type="text"
                placeholder="Search by tournament or game name..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="pl-8"
            />
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"><circle cx="11" cy="11" r="8"></circle><path d="m21 21-4.3-4.3"></path></svg>
        </div>
        
        {loading ? (
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {[...Array(6)].map((_, i) => (
                <Card key={i}>
                    <CardHeader>
                    <Skeleton className="h-6 w-3/4" />
                    <Skeleton className="h-4 w-1/2" />
                    </CardHeader>
                    <CardContent>
                    <Skeleton className="h-4 w-full mb-2" />
                    <Skeleton className="h-4 w-full mb-2" />
                    <Skeleton className="h-4 w-2/3" />
                    </CardContent>
                    <CardFooter>
                    <Skeleton className="h-10 w-full" />
                    </CardFooter>
                </Card>
                ))}
            </div>
        ) : (
            <div className="space-y-12">
                <section>
                    <h2 className="text-2xl font-headline font-semibold mb-6 flex items-center gap-3">
                        <Shield className="text-primary"/>
                        Active Tournaments
                    </h2>
                     {activeTournaments.length > 0 ? (
                         <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                             {activeTournaments.map((tournament) => {
                                 const hasJoined = user ? joinedTournamentIds.includes(tournament.id) : false;
                                 return <TournamentCard key={tournament.id} tournament={tournament} hasJoined={hasJoined} />;
                             })}
                         </div>
                     ) : (
                         <div className="text-center py-16 border-2 border-dashed border-muted rounded-lg">
                            <h2 className="text-xl font-semibold">No Active Tournaments Found</h2>
                            <p className="text-muted-foreground mt-2">Check back later or create your own tournament!</p>
                            <Link href="/dashboard/create-tournament" className="mt-4 inline-block">
                                <Button>Create a Tournament</Button>
                            </Link>
                        </div>
                     )}
                </section>
                
                <Separator />
                
                <section>
                    <h2 className="text-2xl font-headline font-semibold mb-6 flex items-center gap-3">
                        <History className="text-muted-foreground"/>
                        Past Tournaments
                    </h2>
                     {pastTournaments.length > 0 ? (
                         <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                             {pastTournaments.map((tournament) => {
                                 const hasJoined = user ? joinedTournamentIds.includes(tournament.id) : false;
                                 return <TournamentCard key={tournament.id} tournament={tournament} hasJoined={hasJoined} />;
                             })}
                         </div>
                     ) : (
                        <div className="text-center py-16 border-2 border-dashed border-muted rounded-lg">
                            <h2 className="text-xl font-semibold">No Past Tournaments</h2>
                            <p className="text-muted-foreground mt-2">Completed public tournaments will be listed here.</p>
                        </div>
                     )}
                </section>
            </div>
        )}
      </div>
    </div>
  );
}
