

"use client";

import { useState, useEffect } from "react";
import { db } from "@/lib/firebase";
import { collection, onSnapshot, query, where, doc, getDoc, getDocs } from "firebase/firestore";
import type { Team, Tournament, Player, PlayerRole, UserProfile } from "@/lib/types";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ReputationAvatar } from "@/components/reputation-avatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { updateTeamRoster, findUserByEmail, startTournamentAndGenerateFixtures, removeTeamAsOrganizer, approveTeamRegistration } from "@/lib/actions";
import { Loader2, PlusCircle, User, Users, Bot, Trash2, Mail, ShieldAlert, CheckCircle } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import Link from "next/link";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";

function ApproveTeamButton({ tournamentId, teamId, organizerId }: { tournamentId: string, teamId: string, organizerId: string }) {
    const { toast } = useToast();
    const [isLoading, setIsLoading] = useState(false);

    const handleApprove = async () => {
        setIsLoading(true);
        try {
            await approveTeamRegistration(tournamentId, teamId, organizerId);
            toast({ title: "Team Approved", description: "The team is now officially part of the tournament." });
        } catch (error: any) {
            toast({ variant: "destructive", title: "Error", description: error.message });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Button onClick={handleApprove} variant="secondary" size="sm" disabled={isLoading}>
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin"/> : <CheckCircle className="h-4 w-4" />}
            <span className="ml-2">Approve</span>
        </Button>
    )
}

export function TeamsTab({ tournament, isOrganizer }: { tournament: Tournament; isOrganizer: boolean }) {
  const [teams, setTeams] = useState<Team[]>([]);
  const [teamCaptainProfiles, setTeamCaptainProfiles] = useState<Record<string, UserProfile>>({});
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  useEffect(() => {
    const q = query(collection(db, `tournaments/${tournament.id}/teams`));
    const unsubscribe = onSnapshot(q, async (snapshot) => {
      const teamsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Team[];
      setTeams(teamsData);
      
      const profilesToFetch = teamsData
        .map(team => team.captainId)
        .filter(id => id && !teamCaptainProfiles[id]);

      if (profilesToFetch.length > 0) {
        const uniqueIds = [...new Set(profilesToFetch)];
        const profiles: Record<string, UserProfile> = {};
        // Fetch in chunks of 10 for 'in' query limit
        for (let i = 0; i < uniqueIds.length; i += 10) {
            const chunk = uniqueIds.slice(i, i + 10);
            const userDocs = await getDocs(query(collection(db, 'users'), where('uid', 'in', chunk)));
            userDocs.forEach(doc => {
                profiles[doc.id] = doc.data() as UserProfile;
            });
        }
        setTeamCaptainProfiles(prev => ({...prev, ...profiles}));
      }

      setLoading(false);
    }, (error) => {
      console.error("Error fetching teams: ", error);
      setLoading(false);
    });
    return () => unsubscribe();
  }, [tournament.id, teamCaptainProfiles]);
  
  return (
    <Card>
      <CardHeader className="flex flex-row items-start sm:items-center justify-between gap-2">
        <div>
          <CardTitle className="font-headline flex items-center gap-2"><Users className="w-5 h-5"/>Registered Teams</CardTitle>
          <CardDescription>The teams competing in this tournament.</CardDescription>
        </div>
        <div className="flex gap-2">
            {isOrganizer && user && tournament.status === 'open_for_registration' && teams.length >= 4 && <StartTournamentButton tournamentId={tournament.id} organizerId={user.uid} />}
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
            <div className="flex justify-center items-center h-40">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        ) : teams.length === 0 ? (
            <div className="text-center py-16 border-2 border-dashed border-muted rounded-lg">
                <h2 className="text-xl font-semibold">No Teams Yet</h2>
                <p className="text-muted-foreground mt-2">Teams who register will appear here.</p>
                {tournament.status === 'open_for_registration' && (
                    <p className="text-muted-foreground mt-1">Waiting for players to join!</p>
                )}
            </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Team</TableHead>
                <TableHead>Captain</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {teams.map(team => {
                  const captainProfile = teamCaptainProfiles[team.captainId];
                  const isTeamCaptainByCurrentUser = user?.uid === team.captainId;
                  const needsApproval = team.isApproved === false;

                  return (
                    <TableRow key={team.id}>
                        <TableCell>
                            <Link href={`/profile/${team.captainId}`} className="flex items-center gap-3 hover:underline">
                                <ReputationAvatar profile={{ ...captainProfile, photoURL: team.logoUrl }} className="h-8 w-8"/>
                                <span className="font-medium">{team.name}</span>
                                {needsApproval && <ShieldAlert className="h-4 w-4 text-yellow-500" title="Needs Approval" />}
                            </Link>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{captainProfile?.username || 'N/A'}</TableCell>
                        <TableCell className="text-right">
                             <div className="flex gap-2 justify-end">
                                {isOrganizer && needsApproval && (
                                    <ApproveTeamButton tournamentId={tournament.id} teamId={team.id} organizerId={user!.uid} />
                                )}
                                {isTeamCaptainByCurrentUser && tournament.status === 'open_for_registration' && (
                                    <ManageRosterDialog team={team} tournamentId={tournament.id} />
                                )}
                                {isOrganizer && tournament.status === 'open_for_registration' && (
                                    <RemoveTeamDialog team={team} tournamentId={tournament.id} />
                                )}
                            </div>
                        </TableCell>
                    </TableRow>
                  );
                })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function RemoveTeamDialog({ team, tournamentId }: { team: Team, tournamentId: string }) {
    const { user } = useAuth();
    const [isRemoving, setIsRemoving] = useState(false);
    const { toast } = useToast();

    const handleRemove = async () => {
        if (!user) {
            toast({ variant: "destructive", title: "Authentication Error", description: "You must be logged in to perform this action." });
            return;
        }
        setIsRemoving(true);
        try {
            await removeTeamAsOrganizer(tournamentId, team.id, user.uid);
            toast({ title: "Team Removed", description: `"${team.name}" has been removed from the tournament.` });
        } catch (error: any) {
            toast({ variant: "destructive", title: "Error", description: error.message || "Failed to remove team." });
        } finally {
            setIsRemoving(false);
        }
    };

    return (
        <AlertDialog>
            <AlertDialogTrigger asChild>
                <Button variant="destructive" size="icon">
                    <Trash2 className="h-4 w-4" />
                </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                    <AlertDialogDescription>
                        This will permanently remove "{team.name}" from the tournament. This action cannot be undone.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleRemove} disabled={isRemoving} className="bg-destructive hover:bg-destructive/90">
                        {isRemoving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : "Remove Team"}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}

function ManageRosterDialog({ team, tournamentId }: { team: Team, tournamentId: string}) {
    const [open, setOpen] = useState(false);
    const [players, setPlayers] = useState<Player[]>(team.players);
    const [newPlayerEmail, setNewPlayerEmail] = useState("");
    const [isSearching, setIsSearching] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const { toast } = useToast();

    useEffect(() => {
        setPlayers(team.players);
    }, [team.players]);

    const handleAddPlayer = async () => {
        if (!newPlayerEmail) return;
        setIsSearching(true);
        try {
            const userToAdd = await findUserByEmail(newPlayerEmail);
            if (!userToAdd) {
                toast({ variant: "destructive", title: "User not found", description: `No user with email ${newPlayerEmail} was found.` });
                return;
            }
            if (players.some(p => p.uid === userToAdd.uid)) {
                toast({ variant: "destructive", title: "Already on team", description: "This user is already in your roster." });
                return;
            }
            const newPlayer: Player = {
                uid: userToAdd.uid,
                username: userToAdd.username || 'New Player',
                role: 'player',
                photoURL: userToAdd.photoURL,
            };
            setPlayers(prev => [...prev, newPlayer]);
            setNewPlayerEmail("");
        } catch (error) {
            toast({ variant: "destructive", title: "Error", description: "Failed to find user." });
        } finally {
            setIsSearching(false);
        }
    };

    const handleRemovePlayer = (uid: string) => {
        setPlayers(prev => prev.filter(p => p.uid !== uid));
    };
    
    const handleRoleChange = (uid: string, role: PlayerRole) => {
        setPlayers(prev => prev.map(p => p.uid === uid ? { ...p, role } : p));
    };

    const handleSaveChanges = async () => {
        setIsSaving(true);
        try {
            await updateTeamRoster(tournamentId, team.id, players);
            toast({ title: "Success!", description: "Roster updated." });
            setOpen(false);
        } catch (error) {
            toast({ variant: "destructive", title: "Error", description: "Failed to save changes." });
        } finally {
            setIsSaving(false);
        }
    };
    
    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button variant="secondary">Manage Roster</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>Manage Roster for {team.name}</DialogTitle>
                    <DialogDescription>Add, remove, and manage player roles.</DialogDescription>
                </DialogHeader>
                
                <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
                    {players.map(player => (
                        <div key={player.uid} className="flex items-center gap-2">
                            <ReputationAvatar profile={player} className="h-8 w-8" />
                            <span className="flex-1 font-medium">{player.username}</span>
                            
                            <Select onValueChange={(role) => handleRoleChange(player.uid, role as PlayerRole)} defaultValue={player.role} disabled={player.role === 'captain'}>
                                <SelectTrigger className="w-[120px]">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="player">Player</SelectItem>
                                    <SelectItem value="co-captain">Co-Captain</SelectItem>
                                    <SelectItem value="captain" disabled>Captain</SelectItem>
                                </SelectContent>
                            </Select>

                            <Button variant="ghost" size="icon" onClick={() => handleRemovePlayer(player.uid)} disabled={player.role === 'captain'}>
                                <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                        </div>
                    ))}
                </div>

                <Separator />

                <div className="grid gap-2">
                    <Label htmlFor="email">Add Player by Email</Label>
                    <div className="flex gap-2">
                        <Input id="email" type="email" placeholder="player@email.com" value={newPlayerEmail} onChange={e => setNewPlayerEmail(e.target.value)} />
                        <Button onClick={handleAddPlayer} disabled={isSearching}>
                            {isSearching ? <Loader2 className="h-4 w-4 animate-spin"/> : <Mail className="h-4 w-4" />}
                        </Button>
                    </div>
                </div>

                <DialogFooter>
                    <Button onClick={handleSaveChanges} disabled={isSaving}>
                        {isSaving && <Loader2 className="animate-spin mr-2"/>}
                        Save Changes
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function StartTournamentButton({ tournamentId, organizerId }: { tournamentId: string, organizerId: string }) {
    const [isLoading, setIsLoading] = useState(false);
    const { toast } = useToast();

    const handleGenerate = async () => {
        setIsLoading(true);
        try {
            await startTournamentAndGenerateFixtures(tournamentId, organizerId);
            toast({ title: "Success!", description: "Fixtures are being generated by the AI. The tournament will start shortly." });
        } catch (error: any) {
            toast({ variant: "destructive", title: "Error Starting Tournament", description: error.message || "An unknown error occurred." });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <AlertDialog>
            <AlertDialogTrigger asChild>
                <Button variant="outline" disabled={isLoading}>
                    {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Bot className="mr-2 h-4 w-4" />}
                    Start & Generate Fixtures
                </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Start Tournament?</AlertDialogTitle>
                    <AlertDialogDescription>
                        This will use AI to generate the initial match schedule. Once started, team registrations will be locked, and the tournament will officially begin. This action cannot be undone.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleGenerate}>Continue</AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}
