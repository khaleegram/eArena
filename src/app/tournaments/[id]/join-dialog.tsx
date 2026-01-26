
'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { addTeam, findUserByEmail } from '@/lib/actions';
import type { Tournament, UserProfile, Player } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, PlusCircle, Users, Info } from 'lucide-react';
import Image from 'next/image';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '@/lib/firebase';

interface JoinTournamentDialogProps {
    tournament: Tournament;
    user: UserProfile;
    userProfile: UserProfile;
    onTeamJoined: (team: Team) => void;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export function JoinTournamentDialog({ tournament, user, userProfile, onTeamJoined, open, onOpenChange }: JoinTournamentDialogProps) {
    const { toast } = useToast();
    const [teamName, setTeamName] = useState(() => {
        if (typeof window !== 'undefined') {
            return localStorage.getItem('lastTeamName') || '';
        }
        return '';
    });
    const [teamLogo, setTeamLogo] = useState<File | null>(null);
    const [previewLogo, setPreviewLogo] = useState<string | null>(userProfile?.photoURL || null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [captainProfile, setCaptainProfile] = useState<UserProfile | null>(null);

     useEffect(() => {
        if(user?.uid) {
            const fetchProfile = async () => {
                const profile = await findUserByEmail(user.email!);
                setCaptainProfile(profile);
            };
            fetchProfile();
        }
    }, [user]);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setTeamLogo(file);
            setPreviewLogo(URL.createObjectURL(file));
        } else {
            setTeamLogo(null);
            setPreviewLogo(userProfile?.photoURL || null);
        }
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!teamName || !user || !userProfile) {
            toast({ variant: "destructive", title: "Error", description: "You must be logged in and provide a team name." });
            return;
        }

        if (typeof window !== 'undefined') {
            localStorage.setItem('lastTeamName', teamName);
        }

        if(captainProfile?.warnings && captainProfile.warnings >= 5) {
             toast({ variant: "destructive", title: "Registration Flagged", description: "Your account has multiple warnings. The tournament organizer must manually approve your registration." });
        }

        setIsSubmitting(true);
        try {
            let logoUrl = "";
            if (teamLogo) {
                const storageRef = ref(storage, `tournaments/${tournament.id}/logos/${Date.now()}_${teamLogo.name}`);
                const snapshot = await uploadBytes(storageRef, teamLogo);
                logoUrl = await getDownloadURL(snapshot.ref);
            } else if (previewLogo) {
                logoUrl = previewLogo;
            }

            const captain: Player = {
                uid: user.uid,
                role: 'captain',
                username: userProfile.username || 'Captain',
                photoURL: userProfile.photoURL || '',
            };

            const newTeam = await addTeam(tournament.id, { name: teamName, logoUrl, captainId: user.uid, captain });

            toast({ title: "Success!", description: `Your team "${teamName}" has joined the tournament.` });
            onTeamJoined(newTeam);
            onOpenChange(false);
        } catch (error: any) {
            toast({ variant: "destructive", title: "Error", description: error.message || "Failed to create team." });
        } finally {
            setIsSubmitting(false);
        }
    };
    
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogTrigger asChild>
                <Button className="w-full"><PlusCircle className="mr-2"/>Join Tournament</Button>
            </DialogTrigger>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Join {tournament.name}</DialogTitle>
                    <DialogDescription>Create your team to enter the competition.</DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                     <div className="flex items-center gap-4">
                        <div className="relative h-24 w-24 rounded-full border-2 border-dashed flex items-center justify-center bg-muted/50">
                            {previewLogo ? (
                                <Image src={previewLogo} alt="Team logo preview" fill style={{ objectFit: 'cover' }} className="rounded-full" unoptimized/>
                            ) : (
                                <Users className="h-10 w-10 text-muted-foreground" />
                            )}
                        </div>
                        <div className="space-y-2 flex-1">
                            <Label htmlFor="logo">Team Logo (Optional)</Label>
                            <Input id="logo" type="file" onChange={handleFileChange} accept="image/*" />
                            <p className="text-xs text-muted-foreground">Defaults to your profile picture.</p>
                        </div>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="teamName">Team Name <span className="text-destructive">*</span></Label>
                        <Input id="teamName" value={teamName} onChange={e => setTeamName(e.target.value)} required placeholder="e.g., The All-Stars" />
                        <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800">
                            <Info className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
                            <p className="text-xs text-blue-800 dark:text-blue-200">
                                <strong>Important:</strong> Your team name must <strong>exactly match</strong> your in-game team name. 
                                This is required for AI verification of match screenshots. The system will use this name to verify your submitted evidence.
                            </p>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button type="submit" className="w-full" disabled={isSubmitting}>
                            {isSubmitting ? <Loader2 className="animate-spin mr-2" /> : <PlusCircle className="mr-2" />}
                            Create Team & Join
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
