

"use client";

import { useAuth } from '@/hooks/use-auth';
import { getPlayerStats, getUserProfileById, startConversation, getPlayerPerformanceAnalysis } from '@/lib/actions';
import { useToast } from '@/hooks/use-toast';
import * as React from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Trophy, FileText, BrainCircuit, BarChart, Medal, MessageSquare } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { UnifiedTimestamp, PlayerStats as PlayerStatsType, UserProfile } from '@/lib/types';
import { PlayerStats } from '@/components/player-stats';
import { ReputationAvatar } from '@/components/reputation-avatar';
import { FollowButton } from '@/components/follow-button';
import { PlayerComparisonDialog } from '@/components/player-comparison-dialog';
import { Badge } from '@/components/ui/badge';
import { AchievementsDisplay } from '@/components/achievements-display';
import { TrophyCase } from '@/components/trophy-case';
import { FollowersDialog } from '@/components/followers-dialog';
import { db } from '@/lib/firebase';
import { doc, onSnapshot } from 'firebase/firestore';

const toDate = (timestamp: UnifiedTimestamp | undefined): Date | null => {
    if (!timestamp) return null;
    if (timestamp instanceof Date) return timestamp;
    if (typeof timestamp === 'string') return new Date(timestamp);
    if (typeof (timestamp as any).toDate === 'function') return (timestamp as any).toDate();
    return null;
}

const safeFormatDate = (timestamp: UnifiedTimestamp | undefined): string => {
    const date = toDate(timestamp);
    if (!date) return 'Invalid Date';
    try {
        return format(date, 'PPP');
    } catch (error) {
        console.error("Failed to format date:", timestamp, error);
        return 'Invalid Date';
    }
};

const AIAnalysisCard = ({ analysis, archetype }: { analysis: string, archetype: string }) => {
    return (
        <Card>
            <CardHeader>
                <CardTitle className="font-headline flex items-center gap-2"><BrainCircuit className="w-5 h-5 text-primary"/> AI Performance Analysis</CardTitle>
                <CardDescription>
                    Player archetype: <span className="font-bold text-foreground">{archetype}</span>
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

export default function PublicProfilePage() {
  const params = useParams() as { id: string };
  const { toast } = useToast();
  const { user, userProfile: currentUserProfile } = useAuth();
  const router = useRouter();
  
  const [profile, setProfile] = React.useState<UserProfile | null>(null);
  const [stats, setStats] = React.useState<PlayerStatsType | null>(null);
  const [currentUserStats, setCurrentUserStats] = React.useState<PlayerStatsType | null>(null);
  const [analysis, setAnalysis] = React.useState<{archetype: string, analysis: string} | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [isMessaging, setIsMessaging] = React.useState(false);
  
  React.useEffect(() => {
    if (!params.id) return;

    setLoading(true);
    
    // Real-time listener for the profile document
    const profileRef = doc(db, 'users', params.id);
    const unsubscribe = onSnapshot(profileRef, (docSnap) => {
        if (docSnap.exists()) {
            setProfile({ uid: docSnap.id, ...docSnap.data() } as UserProfile);
        } else {
            setProfile(null);
            toast({ variant: 'destructive', title: 'Error', description: 'Could not load user profile.' });
        }
    }, (error) => {
        console.error("Error fetching profile:", error);
        toast({ variant: 'destructive', title: 'Error', description: 'Could not load user profile.' });
    });

    // One-time fetch for stats and other data
    const fetchAncillaryData = async () => {
      try {
        const statsData = await getPlayerStats(params.id);
        setStats(statsData);

        if (statsData && statsData.totalMatches > 0) {
          const analysisData = await getPlayerPerformanceAnalysis(statsData);
          setAnalysis(analysisData);
        }

        if (user) {
          const cUserStats = await getPlayerStats(user.uid);
          setCurrentUserStats(cUserStats);
        }
      } catch (error) {
        console.error("Error fetching ancillary data:", error);
        toast({ variant: 'destructive', title: 'Error', description: 'Could not load some profile data.' });
      } finally {
        setLoading(false);
      }
    };

    fetchAncillaryData();

    // Cleanup the listener on component unmount
    return () => unsubscribe();
  }, [params.id, toast, user]);


  const handleStartMessage = async () => {
    if (!user || !profile) return;
    setIsMessaging(true);
    try {
        const conversationId = await startConversation(user.uid, profile.uid);
        router.push(`/messages/${conversationId}`);
    } catch(error: any) {
        toast({ variant: 'destructive', title: 'Error', description: error.message });
    } finally {
        setIsMessaging(false);
    }
  }

  if (loading) {
      return (
          <div className="flex h-screen w-full items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
      )
  }
  
  if (!profile) {
      return (
          <div className="container py-24 text-center">
            <h1 className="text-4xl font-bold font-headline">404 - Player Not Found</h1>
            <p className="text-lg text-muted-foreground mt-4">The player profile you are looking for does not exist.</p>
            <Link href="/tournaments">
                <Button className="mt-8">Back to Tournaments</Button>
            </Link>
        </div>
      )
  }

  return (
    <div className="container py-10 space-y-8">
        <Card>
            <CardHeader className="items-center text-center">
                <ReputationAvatar profile={profile} className="h-24 w-24" />
                <div className="flex items-center gap-2 pt-2">
                    <CardTitle className="font-headline text-2xl">{profile.username}</CardTitle>
                    {profile.activeTitle && (
                        <Badge variant="outline" className="text-sm font-bold text-amber-400 border-amber-400/50">{profile.activeTitle}</Badge>
                    )}
                </div>
                <CardDescription>{profile.email}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col items-center text-center gap-4">
                <div className="flex gap-6">
                    <FollowersDialog userProfile={profile} type="followers">
                        <div className="text-center cursor-pointer">
                            <p className="font-bold text-lg">{profile.followers?.length || 0}</p>
                            <p className="text-xs text-muted-foreground">Followers</p>
                        </div>
                    </FollowersDialog>
                    <FollowersDialog userProfile={profile} type="following">
                        <div className="text-center cursor-pointer">
                            <p className="font-bold text-lg">{profile.following?.length || 0}</p>
                            <p className="text-xs text-muted-foreground">Following</p>
                        </div>
                    </FollowersDialog>
                </div>
                {user && user.uid !== profile.uid && (
                    <div className="w-full px-4 max-w-xs space-y-2">
                        <FollowButton targetUserId={profile.uid} />
                        <Button className="w-full" variant="secondary" onClick={handleStartMessage} disabled={isMessaging}>
                            {isMessaging ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <MessageSquare className="mr-2 h-4 w-4" />}
                             Message
                        </Button>
                    </div>
                )}
            </CardContent>
        </Card>

        <div className="grid lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-8">
                <PlayerStats stats={stats} />
                {analysis && <AIAnalysisCard archetype={analysis.archetype} analysis={analysis.analysis} />}
                 <Card>
                    <CardHeader>
                        <CardTitle className="font-headline flex items-center gap-2"><Medal className="w-5 h-5 text-primary"/> Achievements</CardTitle>
                        <CardDescription>
                            A collection of badges earned on eArena.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <AchievementsDisplay userProfile={profile} playerStats={stats} />
                    </CardContent>
                 </Card>
            </div>
            <div className="lg:col-span-1 space-y-8">
                {user && profile.uid !== user.uid && currentUserProfile && currentUserStats && (
                    <Card>
                        <CardHeader>
                            <CardTitle className="font-headline flex items-center gap-2"><BarChart className="w-5 h-5 text-primary"/> Performance Tools</CardTitle>
                            <CardDescription>
                                Analyze performance against your own stats.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <PlayerComparisonDialog
                                profileA={profile}
                                statsA={stats}
                                profileB={currentUserProfile}
                                statsB={currentUserStats}
                            />
                        </CardContent>
                    </Card>
                )}
                <TrophyCase profile={profile} />
                <Card>
                    <CardHeader>
                        <CardTitle className="font-headline text-xl flex items-center gap-2"><FileText className="w-5 h-5"/> Incident Log</CardTitle>
                        <CardDescription>A record of warnings and disputes.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-1">
                             <p className="font-semibold">{profile?.warnings || 0} Warnings</p>
                             <p className="text-sm text-muted-foreground">Reputation impacts tournament eligibility.</p>
                        </div>
                        {profile?.incidentLog && profile.incidentLog.length > 0 ? (
                        <div className="space-y-3 mt-4">
                            {profile.incidentLog.slice(0, 5).map((log, index) => (
                            <div key={index} className="text-xs border-l-2 pl-2">
                                <p className="font-medium">{log.reason}</p>
                                <p className="text-muted-foreground">{safeFormatDate(log.date)}</p>
                            </div>
                            ))}
                        </div>
                        ) : (
                        <p className="text-muted-foreground text-center py-4 text-sm">No incidents recorded.</p>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    </div>
  );
}
