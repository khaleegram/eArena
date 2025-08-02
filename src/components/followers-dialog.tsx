

'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { UserProfile } from '@/lib/types';
import { getUsersByIds, unfollowUser } from '@/lib/actions';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { Loader2, UserMinus } from 'lucide-react';
import Link from 'next/link';
import { ReputationAvatar } from './reputation-avatar';

interface FollowersDialogProps {
    userProfile: UserProfile;
    type: 'followers' | 'following';
    children: React.ReactNode;
}

export function FollowersDialog({ userProfile, type, children }: FollowersDialogProps) {
    const [open, setOpen] = useState(false);
    const [userList, setUserList] = useState<UserProfile[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const { user: currentUser } = useAuth();
    const { toast } = useToast();

    useEffect(() => {
        if (!open) return;

        const fetchUsers = async () => {
            setIsLoading(true);
            const ids = type === 'followers' ? userProfile.followers : userProfile.following;
            if (ids && ids.length > 0) {
                try {
                    const users = await getUsersByIds(ids);
                    setUserList(users);
                } catch (error) {
                    toast({ variant: 'destructive', title: 'Error', description: 'Could not load user list.' });
                }
            } else {
                setUserList([]);
            }
            setIsLoading(false);
        };

        fetchUsers();
    }, [open, userProfile, type, toast]);

    const handleUnfollow = async (targetUserId: string) => {
        if (!currentUser) return;
        try {
            await unfollowUser(currentUser.uid, targetUserId);
            setUserList(prev => prev.filter(u => u.uid !== targetUserId));
            toast({ title: 'Unfollowed' });
        } catch (error: any) {
            toast({ variant: 'destructive', title: 'Error', description: error.message });
        }
    };

    const isMyProfile = currentUser?.uid === userProfile.uid;

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>{children}</DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle className="capitalize">{type}</DialogTitle>
                    <DialogDescription>A list of users {type === 'followers' ? 'following' : 'followed by'} {userProfile.username}.</DialogDescription>
                </DialogHeader>
                <ScrollArea className="max-h-[60vh]">
                    <div className="space-y-4 pr-6">
                        {isLoading ? (
                            <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin" /></div>
                        ) : userList.length === 0 ? (
                            <p className="text-center text-muted-foreground py-8">No users to show.</p>
                        ) : (
                            userList.map(profile => (
                                <div key={profile.uid} className="flex items-center gap-4">
                                    <Link href={`/profile/${profile.uid}`} onClick={() => setOpen(false)} className="flex items-center gap-4 flex-grow hover:underline">
                                        <ReputationAvatar profile={profile} />
                                        <span className="font-medium">{profile.username}</span>
                                    </Link>
                                    {isMyProfile && type === 'following' && (
                                        <Button variant="ghost" size="sm" onClick={() => handleUnfollow(profile.uid)}><UserMinus className="h-4 w-4 mr-2" />Unfollow</Button>
                                    )}
                                </div>
                            ))
                        )}
                    </div>
                </ScrollArea>
            </DialogContent>
        </Dialog>
    );
}
