
'use client';
import { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { useAuth } from '@/hooks/use-auth';
import { followUser, unfollowUser } from '@/lib/actions';
import { Loader2, UserPlus, UserCheck } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface FollowButtonProps {
    targetUserId: string;
}

export function FollowButton({ targetUserId }: FollowButtonProps) {
    const { user, userProfile } = useAuth();
    const [isFollowing, setIsFollowing] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const { toast } = useToast();

    useEffect(() => {
        if(userProfile) {
            setIsFollowing(userProfile.following?.includes(targetUserId) || false);
            setIsLoading(false);
        } else if (user === null && !isLoading) {
            // If user is not logged in and we're done loading, stop loading.
            setIsLoading(false);
        }
    }, [user, userProfile, targetUserId, isLoading]);

    const handleToggleFollow = async () => {
        if (!user) {
            toast({ variant: 'destructive', title: 'You must be logged in to follow users.' });
            return;
        }

        setIsLoading(true);
        try {
            if (isFollowing) {
                await unfollowUser(user.uid, targetUserId);
                toast({ title: 'Unfollowed' });
            } else {
                await followUser(user.uid, targetUserId);
                toast({ title: 'Followed!' });
            }
            // The state will be updated via the onSnapshot listener in AuthProvider
        } catch (error: any) {
            toast({ variant: 'destructive', title: 'Error', description: error.message });
        } finally {
            setIsLoading(false);
        }
    };

    if (!user || user.uid === targetUserId) {
        return null; // Don't show button on own profile or if not logged in
    }
    
    if(isLoading) {
        return <Button disabled className="w-full"><Loader2 className="mr-2 h-4 w-4 animate-spin" />Loading</Button>
    }

    return (
        <Button onClick={handleToggleFollow} disabled={isLoading} variant={isFollowing ? 'secondary' : 'default'} className="w-full">
            {isLoading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : isFollowing ? (
                <><UserCheck className="mr-2 h-4 w-4" /> Following</>
            ) : (
                <><UserPlus className="mr-2 h-4 w-4" /> Follow</>
            )}
        </Button>
    );
}
