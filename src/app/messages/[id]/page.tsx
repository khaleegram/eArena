

'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { getConversationById, postDirectMessage } from '@/lib/actions/user';
import type { Conversation, UserProfile, ChatMessage, UnifiedTimestamp } from '@/lib/types';
import { Loader2, ArrowLeft, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import { ReputationAvatar } from '@/components/reputation-avatar';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase';

const toDate = (timestamp: UnifiedTimestamp): Date => {
    if (!timestamp) return new Date();
    if (typeof timestamp === 'string') return new Date(timestamp);
    if ((timestamp as any).toDate) return (timestamp as any).toDate();
    return timestamp as Date;
};

export default function ConversationPage() {
    const { id: conversationId } = useParams() as { id: string };
    const router = useRouter();
    const { user, userProfile } = useAuth();
    const [conversation, setConversation] = useState<(Omit<Conversation, 'messages'> & { messages?: ChatMessage[] }) | null>(null);
    const [loading, setLoading] = useState(true);
    const [message, setMessage] = useState('');
    const [isSending, setIsSending] = useState(false);
    const scrollAreaRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!user || !conversationId) return;

        let unsubscribe: (() => void) | undefined;

        setLoading(true);
        getConversationById(conversationId, user.uid).then(convoDetails => {
            if (!convoDetails) {
                router.replace('/messages');
                return;
            }
            setConversation(convoDetails);

            // Once we have details and know we are authorized, set up the listener
            const messagesQuery = query(
                collection(db, 'conversations', conversationId, 'messages'),
                orderBy('timestamp', 'asc')
            );

            unsubscribe = onSnapshot(messagesQuery, (snapshot) => {
                const messages = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ChatMessage));
                setConversation(prev => prev ? { ...prev, messages } : null);
                setLoading(false);
            }, (error) => {
                console.error("Error listening to messages:", error);
                setLoading(false);
            });

        }).catch(error => {
            console.error("Error fetching conversation details", error);
            router.replace('/messages');
            setLoading(false);
        });

        return () => {
            if (unsubscribe) {
                unsubscribe();
            }
        };
    }, [conversationId, user, router]);

    useEffect(() => {
        if (scrollAreaRef.current) {
            scrollAreaRef.current.scrollTo({ top: scrollAreaRef.current.scrollHeight, behavior: 'smooth' });
        }
    }, [conversation?.messages]);

    const handleSendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!message.trim() || !user || !userProfile || !conversation) return;
        
        setIsSending(true);
        const tempId = Date.now().toString();
        const newMessageText = message;
        setMessage('');

        try {
            const newMessage: ChatMessage = {
                id: tempId,
                conversationId: conversationId,
                message: newMessageText,
                userId: user.uid,
                username: userProfile.username || 'User',
                photoURL: userProfile.photoURL,
                timestamp: new Date().toISOString(),
            };
            
            // Optimistically update UI
            setConversation(prev => prev ? ({ ...prev, messages: [...(prev.messages || []), newMessage] }) : null);

            await postDirectMessage(conversationId, newMessageText, user.uid);

        } catch (error) {
            console.error(error);
            // Revert optimistic update on error
            setConversation(prev => prev ? ({ ...prev, messages: prev.messages?.filter(m => m.id !== tempId) || [] }) : null);
            setMessage(newMessageText);
        } finally {
            setIsSending(false);
        }
    };

    if (loading || !conversation) {
        return <div className="flex h-[calc(100vh-3.5rem)] w-full items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>;
    }

    const otherParticipant = conversation.participants.find(p => p.uid !== user?.uid);
    if (!otherParticipant) {
        router.push('/messages');
        return null;
    }
    
    return (
        <div className="container h-[calc(100vh-3.5rem)] flex flex-col py-4">
            <header className="flex items-center gap-4 p-4 border-b">
                <Button variant="ghost" size="icon" onClick={() => router.push('/messages')}>
                    <ArrowLeft className="h-5 w-5" />
                </Button>
                <ReputationAvatar profile={otherParticipant} />
                <h2 className="text-lg font-semibold">{otherParticipant.username}</h2>
            </header>
            <ScrollArea className="flex-grow p-4" ref={scrollAreaRef as any}>
                <div className="space-y-4">
                    {conversation.messages?.map(msg => {
                         const isCurrentUser = msg.userId === user?.uid;
                         const profileToShow = isCurrentUser ? userProfile : otherParticipant;
                         return (
                            <div key={msg.id} className={cn("flex items-start gap-3", isCurrentUser ? "flex-row-reverse" : "")}>
                                <ReputationAvatar profile={profileToShow} className="h-8 w-8" />
                                <div className={cn("rounded-lg p-3 max-w-xs md:max-w-md", isCurrentUser ? "bg-primary text-primary-foreground" : "bg-muted")}>
                                    <p className="text-sm whitespace-pre-wrap">{msg.message}</p>
                                    <p className="text-xs opacity-70 pt-1 text-right">
                                        {formatDistanceToNow(toDate(msg.timestamp), { addSuffix: true })}
                                    </p>
                                </div>
                            </div>
                         )
                    })}
                </div>
            </ScrollArea>
            <form onSubmit={handleSendMessage} className="flex gap-2 p-4 border-t bg-background">
                <Input value={message} onChange={e => setMessage(e.target.value)} placeholder="Type a message..." disabled={isSending} />
                <Button type="submit" disabled={isSending || !message.trim()}>
                    <Send className="h-4 w-4" />
                </Button>
            </form>
        </div>
    );
}
