

'use client';

import { useState, useEffect, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { getConversationsForUser, getUsersByIds, startConversation, findUsersByUsername } from '@/lib/actions/user';
import type { Conversation, UserProfile, UnifiedTimestamp } from '@/lib/types';
import { Loader2, User, MessageSquare, Search } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ReputationAvatar } from '@/components/reputation-avatar';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';

// toDate helper function
const toDate = (timestamp: UnifiedTimestamp): Date => {
    if (!timestamp) return new Date(); // Fallback for safety
    if (typeof timestamp === 'string') {
        return new Date(timestamp);
    }
    if (timestamp && typeof (timestamp as any).toDate === 'function') {
        return (timestamp as any).toDate();
    }
    return timestamp as Date;
};

// UserSearch Component
const UserSearch = () => {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<UserProfile[]>([]);
    const [isSearching, startSearchTransition] = useTransition();
    const { user: currentUser } = useAuth();
    const router = useRouter();
    const { toast } = useToast();
    
    useEffect(() => {
        const handler = setTimeout(() => {
            if (query.trim().length > 2) {
                startSearchTransition(async () => {
                    const foundUsers = await findUsersByUsername(query);
                    setResults(foundUsers.filter(u => u.uid !== currentUser?.uid));
                });
            } else {
                setResults([]);
            }
        }, 300); // Debounce search

        return () => {
            clearTimeout(handler);
        };
    }, [query, currentUser]);

    const handleStartChat = async (targetUserId: string) => {
        if (!currentUser) return;
        try {
            const conversationId = await startConversation(currentUser.uid, targetUserId);
            router.push(`/messages/${conversationId}`);
        } catch (error: any) {
            toast({ variant: 'destructive', title: 'Error', description: `Could not start chat. ${error.message}` });
        }
    };

    return (
        <div className="space-y-4">
            <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                    placeholder="Search for players to message..."
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    className="pl-8"
                />
            </div>
            {isSearching && <div className="flex justify-center p-4"><Loader2 className="h-6 w-6 animate-spin"/></div>}
            {results.length > 0 && (
                <div className="space-y-2">
                    {results.map(profile => (
                        <div key={profile.uid} className="flex items-center gap-4 p-2 rounded-md hover:bg-accent">
                            <Link href={`/profile/${profile.uid}`} className="flex items-center gap-4 flex-grow hover:underline">
                                <ReputationAvatar profile={profile} />
                                <span className="font-medium">{profile.username}</span>
                            </Link>
                            <Button size="sm" variant="outline" onClick={() => handleStartChat(profile.uid)}>
                                <MessageSquare className="h-4 w-4" />
                            </Button>
                        </div>
                    ))}
                </div>
            )}
            {query.length > 2 && !isSearching && results.length === 0 && (
                 <p className="text-center text-sm text-muted-foreground py-4">No players found matching "{query}".</p>
            )}
        </div>
    );
};


const ConversationList = () => {
    const { user } = useAuth();
    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!user) {
            setLoading(false);
            return;
        }
        const fetchConversations = async () => {
            setLoading(true);
            try {
                const userConvos = await getConversationsForUser(user.uid);
                setConversations(userConvos);
            } catch (error) {
                console.error("Failed to fetch conversations", error);
            } finally {
                setLoading(false);
            }
        }
        fetchConversations();
    }, [user]);

    if (loading) {
        return <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin" /></div>;
    }

    if (!conversations.length) {
        return <p className="text-center text-muted-foreground py-16">You have no active conversations.</p>;
    }

    return (
        <div className="space-y-2">
            {conversations.map(convo => {
                const otherParticipant = convo.participants.find(p => p.uid !== user?.uid);
                if (!otherParticipant) return null;

                return (
                    <Link href={`/messages/${convo.id}`} key={convo.id}>
                        <div className="flex items-center gap-4 p-3 rounded-lg hover:bg-accent transition-colors">
                            <ReputationAvatar profile={otherParticipant} />
                            <div className="flex-grow overflow-hidden">
                                <div className="flex justify-between items-center">
                                    <p className="font-semibold truncate">{otherParticipant.username}</p>
                                    {convo.lastMessage?.timestamp && (
                                        <p className="text-xs text-muted-foreground flex-shrink-0 ml-2">
                                            {formatDistanceToNow(toDate(convo.lastMessage.timestamp), { addSuffix: true })}
                                        </p>
                                    )}
                                </div>
                                <p className="text-sm text-muted-foreground truncate">{convo.lastMessage?.message || 'No messages yet'}</p>
                            </div>
                        </div>
                    </Link>
                )
            })}
        </div>
    )
}

const FollowersList = () => {
    const { user, userProfile } = useAuth();
    const router = useRouter();
    const { toast } = useToast();
    const [followers, setFollowers] = useState<UserProfile[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isStartingChat, setIsStartingChat] = useState<string | null>(null);

    useEffect(() => {
        if (userProfile?.followers && userProfile.followers.length > 0) {
            const fetchFollowers = async () => {
                setIsLoading(true);
                try {
                    const profiles = await getUsersByIds(userProfile.followers!);
                    setFollowers(profiles);
                } catch (error) {
                    toast({ variant: 'destructive', title: 'Error', description: 'Could not load followers.' });
                } finally {
                    setIsLoading(false);
                }
            };
            fetchFollowers();
        } else {
            setFollowers([]);
            setIsLoading(false);
        }
    }, [userProfile, toast]);

    const handleStartChat = async (followerId: string) => {
        if (!user) return;
        setIsStartingChat(followerId);
        try {
            const conversationId = await startConversation(user.uid, followerId);
            router.push(`/messages/${conversationId}`);
        } catch (error: any) {
            toast({ variant: 'destructive', title: 'Error', description: `Could not start chat. ${error.message}` });
            setIsStartingChat(null);
        }
    };

    if (isLoading) {
        return <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin" /></div>;
    }

    if (followers.length === 0) {
        return <p className="text-center text-muted-foreground py-16">You don't have any followers yet.</p>;
    }

    return (
        <div className="space-y-2">
            {followers.map(follower => (
                <div key={follower.uid} className="flex items-center gap-4 p-2 rounded-md hover:bg-accent">
                    <div className="flex-grow flex items-center gap-4">
                        <ReputationAvatar profile={follower} />
                        <span className="font-medium">{follower.username}</span>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => handleStartChat(follower.uid)} disabled={isStartingChat === follower.uid}>
                        {isStartingChat === follower.uid ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageSquare className="h-4 w-4" />}
                    </Button>
                </div>
            ))}
        </div>
    );
};


export default function MessagesPage() {
    return (
        <div className="container py-10">
            <Card>
                <CardHeader>
                    <CardTitle className="font-headline">Inbox</CardTitle>
                    <CardDescription>Search for players or view your existing conversations and followers.</CardDescription>
                </CardHeader>
                <CardContent>
                    <UserSearch />
                    <Separator className="my-6" />
                    <Tabs defaultValue="chats">
                        <TabsList className="grid w-full grid-cols-2">
                            <TabsTrigger value="chats">Chats</TabsTrigger>
                            <TabsTrigger value="followers">Followers</TabsTrigger>
                        </TabsList>
                        <TabsContent value="chats" className="mt-4">
                            <ConversationList />
                        </TabsContent>
                        <TabsContent value="followers" className="mt-4">
                            <FollowersList />
                        </TabsContent>
                    </Tabs>
                </CardContent>
            </Card>
        </div>
    );
}
