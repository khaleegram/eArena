

"use client";

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { updateUserProfile, getPlayerStats, updateUserProfilePhoto, getPlayerPerformanceAnalysis } from '@/lib/actions';
import { useToast } from '@/hooks/use-toast';
import * as React from 'react';
import { format } from 'date-fns';

import { Button } from '@/components/ui/button';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Trophy, FileText, Camera, Users, BrainCircuit, Medal } from 'lucide-react';
import type { UnifiedTimestamp, PlayerStats as PlayerStatsType } from '@/lib/types';
import { PlayerStats } from '@/components/player-stats';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ReputationAvatar } from '@/components/reputation-avatar';
import { Badge } from '@/components/ui/badge';
import { AchievementsDisplay } from '@/components/achievements-display';
import { TitleSelector } from '@/components/title-selector';
import { TrophyCase } from '@/components/trophy-case';
import { FollowersDialog } from '@/components/followers-dialog';

const profileSchema = z.object({
  username: z.string().min(3, { message: "Username must be at least 3 characters." }).max(20),
  psnId: z.string().optional(),
  xboxGamertag: z.string().optional(),
  konamiId: z.string().optional(),
  pcId: z.string().optional(),
});

type ProfileFormValues = z.infer<typeof profileSchema>;

const safeFormatDate = (date: UnifiedTimestamp | undefined): string => {
    if (!date) return '';
    try {
        if (typeof date === 'string') {
            return format(new Date(date), 'MMM yyyy');
        }
        if (typeof (date as any).toDate === 'function') {
            return format((date as any).toDate(), 'MMM yyyy');
        }
        return format(date as Date, 'MMM yyyy');
    } catch (error) {
        return '';
    }
};

const AIAnalysisCard = ({ analysis, archetype }: { analysis: string, archetype: string }) => {
    return (
        <Card>
            <CardHeader>
                <CardTitle className="font-headline flex items-center gap-2"><BrainCircuit className="w-5 h-5 text-primary"/> AI Performance Analysis</CardTitle>
                <CardDescription>
                    Your player archetype is: <span className="font-bold text-foreground">{archetype}</span>
                </CardDescription>
            </CardHeader>
            <CardContent>
                <p className="text-sm text-muted-foreground italic">
                    "{analysis}"
                </p>
            </CardContent>
        </Card>
    );
};

export default function ProfilePage() {
  const router = useRouter();
  const { user, userProfile, loading } = useAuth();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = React.useState(false);
  const [stats, setStats] = React.useState<PlayerStatsType | null>(null);
  const [analysis, setAnalysis] = React.useState<{archetype: string, analysis: string} | null>(null);
  const [statsLoading, setStatsLoading] = React.useState(true);
  const [isUploading, setIsUploading] = React.useState(false);
  const [newAvatarFile, setNewAvatarFile] = React.useState<File | null>(null);
  const [preview, setPreview] = React.useState<string | null>(null);
  const [isAvatarDialogOpen, setIsAvatarDialogOpen] = React.useState(false);

  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      username: '',
      psnId: '',
      xboxGamertag: '',
      konamiId: '',
      pcId: '',
    },
  });

  React.useEffect(() => {
    if (userProfile) {
      form.reset({
        username: userProfile.username || '',
        psnId: userProfile.psnId || '',
        xboxGamertag: userProfile.xboxGamertag || '',
        konamiId: userProfile.konamiId || '',
        pcId: userProfile.pcId || '',
      });
      setPreview(userProfile.photoURL || null);
    }
  }, [userProfile, form]);
  
   React.useEffect(() => {
    if(user?.uid) {
        setStatsLoading(true);
        getPlayerStats(user.uid)
            .then(async (statsData) => {
                setStats(statsData);
                if (statsData) {
                    const analysisData = await getPlayerPerformanceAnalysis(statsData);
                    setAnalysis(analysisData);
                }
            })
            .catch(err => {
                console.error("Failed to get player stats:", err);
                toast({ variant: 'destructive', title: 'Error', description: 'Could not load player statistics.' });
            })
            .finally(() => setStatsLoading(false));
    }
  }, [user, toast]);

  async function onSubmit(values: ProfileFormValues) {
    if (!user) {
      toast({ variant: "destructive", title: "Error", description: "You must be logged in." });
      return;
    }
    setIsLoading(true);
    try {
      await updateUserProfile(user.uid, values);
      toast({ title: "Success!", description: "Your profile has been updated." });
    } catch (error) {
      toast({ variant: "destructive", title: "Error", description: "Failed to update profile." });
    } finally {
      setIsLoading(false);
    }
  }

  const handleAvatarSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setNewAvatarFile(file);
      setPreview(URL.createObjectURL(file));
    }
  };

  const handleAvatarUpload = async () => {
    if (!user || !newAvatarFile) return;
    setIsUploading(true);
    const formData = new FormData();
    formData.append('photo', newAvatarFile);

    try {
      await updateUserProfilePhoto(user.uid, formData);
      toast({ title: "Success!", description: "Your avatar has been updated." });
      setNewAvatarFile(null);
      // Let AuthProvider handle updating the userProfile state
      setIsAvatarDialogOpen(false);
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Upload Failed', description: error.message });
    } finally {
      setIsUploading(false);
    }
  };

  if (loading || !userProfile) {
      return (
          <div className="flex h-screen w-full items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
      )
  }

  return (
    <div className="container py-10 space-y-8">
        <Card>
            <CardHeader className="items-center text-center">
                <div className="relative">
                    <ReputationAvatar profile={userProfile} className="h-24 w-24" />
                        <Dialog open={isAvatarDialogOpen} onOpenChange={setIsAvatarDialogOpen}>
                        <DialogTrigger asChild>
                            <Button variant="outline" size="icon" className="absolute -bottom-2 -right-2 rounded-full h-8 w-8 bg-background">
                                <Camera className="h-4 w-4"/>
                            </Button>
                        </DialogTrigger>
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle>Change Avatar</DialogTitle>
                                <DialogDescription>Select a new image for your profile.</DialogDescription>
                            </DialogHeader>
                            <div className="flex flex-col items-center gap-4 py-4">
                                <ReputationAvatar profile={{...userProfile, photoURL: preview || userProfile.photoURL}} className="h-32 w-32" />
                                <Input type="file" accept="image/*" onChange={handleAvatarSelect} />
                            </div>
                            <DialogFooter>
                                <Button onClick={handleAvatarUpload} disabled={isUploading || !newAvatarFile}>
                                    {isUploading && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>}
                                    Upload & Save
                                </Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>
                </div>
                <div className="flex items-center gap-2 pt-2">
                    <CardTitle className="font-headline text-2xl">{userProfile.username}</CardTitle>
                    {userProfile.activeTitle && (
                        <Badge variant="outline" className="text-sm font-bold text-amber-400 border-amber-400/50">{userProfile.activeTitle}</Badge>
                    )}
                </div>
                <CardDescription>{userProfile.email}</CardDescription>
            </CardHeader>
                <CardContent className="flex flex-col items-center text-center gap-4">
                <div className="flex gap-6">
                    <FollowersDialog userProfile={userProfile} type="followers">
                        <div className="text-center cursor-pointer">
                            <p className="font-bold text-lg">{userProfile.followers?.length || 0}</p>
                            <p className="text-xs text-muted-foreground">Followers</p>
                        </div>
                    </FollowersDialog>
                    <FollowersDialog userProfile={userProfile} type="following">
                        <div className="text-center cursor-pointer">
                            <p className="font-bold text-lg">{userProfile.following?.length || 0}</p>
                            <p className="text-xs text-muted-foreground">Following</p>
                        </div>
                    </FollowersDialog>
                </div>
                <div>
                        <p className="font-semibold">{userProfile?.warnings || 0} Warnings</p>
                        <p className="text-sm text-muted-foreground">Reputation impacts tournament eligibility.</p>
                </div>
            </CardContent>
        </Card>
        
        <div className="grid lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-8">
                <Card>
                     <CardHeader>
                        <CardTitle className="font-headline text-xl">Profile Settings</CardTitle>
                        <CardDescription>Manage your public profile and game IDs.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Form {...form}>
                        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
                            <FormField
                            control={form.control}
                            name="username"
                            render={({ field }) => (
                                <FormItem>
                                <FormLabel>Username</FormLabel>
                                <FormControl>
                                    <Input placeholder="Your public display name" {...field} />
                                </FormControl>
                                <FormDescription>This will be displayed on tournament pages.</FormDescription>
                                <FormMessage />
                                </FormItem>
                            )}
                            />
                            
                            <div className="space-y-4 rounded-lg border p-4">
                                <h3 className="font-semibold">Game IDs</h3>
                                <p className="text-sm text-destructive font-medium">Important: These IDs are self-reported and NOT verified by eArena. Ensure they are correct for others to find you.</p>
                                <div className="grid md:grid-cols-2 gap-4">
                                    <FormField
                                        control={form.control}
                                        name="psnId"
                                        render={({ field }) => (
                                            <FormItem>
                                            <FormLabel>PSN ID</FormLabel>
                                            <FormControl>
                                                <Input placeholder="Your PlayStation ID" {...field} />
                                            </FormControl>
                                            </FormItem>
                                        )}
                                    />
                                    <FormField
                                        control={form.control}
                                        name="xboxGamertag"
                                        render={({ field }) => (
                                            <FormItem>
                                            <FormLabel>Xbox Gamertag</FormLabel>
                                            <FormControl>
                                                <Input placeholder="Your Xbox Gamertag" {...field} />
                                            </FormControl>
                                            </FormItem>
                                        )}
                                    />
                                    <FormField
                                        control={form.control}
                                        name="konamiId"
                                        render={({ field }) => (
                                            <FormItem>
                                            <FormLabel>Konami ID (Mobile)</FormLabel>
                                            <FormControl>
                                                <Input placeholder="Your Konami ID" {...field} />
                                            </FormControl>
                                            </FormItem>
                                        )}
                                    />
                                    <FormField
                                        control={form.control}
                                        name="pcId"
                                        render={({ field }) => (
                                            <FormItem>
                                            <FormLabel>PC ID (e.g., Steam)</FormLabel>
                                            <FormControl>
                                                <Input placeholder="Your PC gaming ID" {...field} />
                                            </FormControl>
                                            </FormItem>
                                        )}
                                    />
                                </div>
                            </div>

                            <Button type="submit" disabled={isLoading}>
                            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Save Changes
                            </Button>
                        </form>
                        </Form>
                    </CardContent>
                </Card>
                {statsLoading ? (
                    <div className="flex justify-center items-center h-40"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
                ) : (
                    <>
                        <PlayerStats stats={stats} />
                        {analysis && <AIAnalysisCard archetype={analysis.archetype} analysis={analysis.analysis} />}
                    </>
                )}
                 <Card>
                    <CardHeader>
                        <CardTitle className="font-headline flex items-center gap-2"><Medal className="w-5 h-5 text-primary"/> Achievements</CardTitle>
                        <CardDescription>
                            Your collection of badges earned on eArena.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <AchievementsDisplay userProfile={userProfile} playerStats={stats} />
                    </CardContent>
                 </Card>
            </div>
            <div className="lg:col-span-1 space-y-8">
                 <TitleSelector />
                 <TrophyCase profile={userProfile} />
                 <Card>
                    <CardHeader>
                        <CardTitle className="font-headline text-xl flex items-center gap-2"><FileText className="w-5 h-5"/> Incident Log</CardTitle>
                        <CardDescription>A record of warnings and disputes.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {userProfile?.incidentLog && userProfile.incidentLog.length > 0 ? (
                        <div className="space-y-3">
                            {userProfile.incidentLog.slice(0, 5).map((log, index) => (
                            <div key={index} className="text-xs border-l-2 pl-2">
                                <p className="font-medium">{log.reason}</p>
                                <p className="text-muted-foreground">{safeFormatDate(log.date)}</p>
                            </div>
                            ))}
                        </div>
                        ) : (
                        <p className="text-muted-foreground text-center py-4 text-sm">No incidents recorded. Great job!</p>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    </div>
  );
}

