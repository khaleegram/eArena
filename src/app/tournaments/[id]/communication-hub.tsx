

"use client";

import { useState, useEffect, useRef } from "react";
import { db } from "@/lib/firebase";
import { collection, onSnapshot, query, orderBy, Timestamp, getDocs, where } from "firebase/firestore";
import type { Tournament, Team, ChatMessage, Announcement, UserProfile } from "@/lib/types";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { postTournamentMessage, postTeamMessage, postAnnouncement, deleteTournamentMessage } from "@/lib/actions";
import { Loader2, Send, Megaphone, MessageSquare, Users, Rss, Trash2 } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { ReputationAvatar } from "@/components/reputation-avatar";
import Link from 'next/link';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

// ChatMessageDisplay Component
const ChatMessageDisplay = ({ messages, participantProfiles, isOrganizer, tournamentId }: { messages: ChatMessage[]; participantProfiles: Record<string, UserProfile>, isOrganizer: boolean, tournamentId: string }) => {
    const scrollAreaRef = useRef<HTMLDivElement>(null);
    const { user } = useAuth();
    const { toast } = useToast();
    const [isDeleting, setIsDeleting] = useState<string | null>(null);
  
    useEffect(() => {
        if (scrollAreaRef.current) {
            scrollAreaRef.current.scrollTo({ top: scrollAreaRef.current.scrollHeight });
        }
    }, [messages]);
    
    const handleDelete = async (messageId: string) => {
        if (!user) return;
        setIsDeleting(messageId);
        try {
            await deleteTournamentMessage(tournamentId, messageId, user.uid);
            toast({ title: "Message Deleted" });
        } catch (error: any) {
            toast({ variant: 'destructive', title: "Error", description: error.message });
        } finally {
            setIsDeleting(null);
        }
    };

    if (!messages.length) {
        return <p className="text-center text-muted-foreground py-8">No messages yet. Start the conversation!</p>;
    }

    return (
        <ScrollArea className="h-96 w-full pr-4" ref={scrollAreaRef as any}>
            <div className="space-y-4">
                {messages.map(msg => {
                    const isCurrentUser = msg.userId === user?.uid;
                    const profile = participantProfiles[msg.userId];
                    return (
                        <div key={msg.id} className={cn("flex items-start gap-3 group", isCurrentUser ? "flex-row-reverse" : "")}>
                             <Link href={`/profile/${msg.userId}`}>
                                <ReputationAvatar profile={profile} className="h-8 w-8" />
                             </Link>
                            <div className={cn("rounded-lg p-3 max-w-xs md:max-w-md", isCurrentUser ? "bg-primary text-primary-foreground" : "bg-muted")}>
                                {!isCurrentUser && <p className="text-xs font-bold pb-1">{msg.username}</p>}
                                <p className="text-sm whitespace-pre-wrap">{msg.message}</p>
                                <p className="text-xs opacity-70 pt-1 text-right">
                                    {msg.timestamp ? formatDistanceToNow(new Date((msg.timestamp as any).seconds * 1000), { addSuffix: true }) : 'sending...'}
                                </p>
                            </div>
                             {isOrganizer && !isCurrentUser && (
                                <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                        <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity" disabled={isDeleting === msg.id}>
                                            {isDeleting === msg.id ? <Loader2 className="h-4 w-4 animate-spin"/> : <Trash2 className="h-4 w-4 text-destructive"/>}
                                        </Button>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent>
                                        <AlertDialogHeader><AlertDialogTitle>Delete Message?</AlertDialogTitle><AlertDialogDescription>This will permanently delete the message from the chat. This cannot be undone.</AlertDialogDescription></AlertDialogHeader>
                                        <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => handleDelete(msg.id)} className="bg-destructive hover:bg-destructive/90">Delete</AlertDialogAction></AlertDialogFooter>
                                    </AlertDialogContent>
                                </AlertDialog>
                            )}
                        </div>
                    );
                })}
            </div>
        </ScrollArea>
    );
};

// ChatInput Component
const ChatInput = ({ onSendMessage }: { onSendMessage: (message: string) => Promise<void> }) => {
    const [message, setMessage] = useState("");
    const [isSending, setIsSending] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!message.trim()) return;
        
        setIsSending(true);
        try {
            await onSendMessage(message);
            setMessage("");
        } finally {
            setIsSending(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="flex gap-2 pt-4 border-t">
            <Input 
                value={message} 
                onChange={e => setMessage(e.target.value)}
                placeholder="Type your message..."
                disabled={isSending}
            />
            <Button type="submit" disabled={isSending || !message.trim()}>
                {isSending ? <Loader2 className="h-4 w-4 animate-spin"/> : <Send className="h-4 w-4" />}
            </Button>
        </form>
    );
};


// General Chat Component
const GeneralChat = ({ tournamentId, participantProfiles, isOrganizer }: { tournamentId: string; participantProfiles: Record<string, UserProfile>, isOrganizer: boolean }) => {
    const { user, userProfile } = useAuth();
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const { toast } = useToast();

    useEffect(() => {
        const q = query(collection(db, `tournaments/${tournamentId}/messages`), orderBy("timestamp", "asc"));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const msgs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ChatMessage));
            setMessages(msgs);
        });
        return () => unsubscribe();
    }, [tournamentId]);

    const handleSendMessage = async (message: string) => {
        if (!user || !userProfile) {
            toast({ variant: "destructive", title: "Error", description: "You must be logged in to chat." });
            return;
        }
        await postTournamentMessage(tournamentId, user.uid, userProfile.username || user.email!, userProfile.photoURL || '', message);
    };

    return (
        <div className="flex flex-col h-full">
            <ChatMessageDisplay messages={messages} participantProfiles={participantProfiles} isOrganizer={isOrganizer} tournamentId={tournamentId} />
            <ChatInput onSendMessage={handleSendMessage} />
        </div>
    );
};

// Team Chat Component
const TeamChat = ({ tournamentId, team, participantProfiles, isOrganizer }: { tournamentId: string; team: Team | null; participantProfiles: Record<string, UserProfile>, isOrganizer: boolean }) => {
    const { user, userProfile } = useAuth();
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const { toast } = useToast();

    useEffect(() => {
        if (!team) return;
        const q = query(collection(db, `tournaments/${tournamentId}/teams/${team.id}/messages`), orderBy("timestamp", "asc"));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const msgs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ChatMessage));
            setMessages(msgs);
        });
        return () => unsubscribe();
    }, [tournamentId, team]);

    const handleSendMessage = async (message: string) => {
        if (!user || !team || !userProfile) {
            toast({ variant: "destructive", title: "Error", description: "You must be part of a team to use team chat." });
            return;
        }
        await postTeamMessage(tournamentId, team.id, user.uid, userProfile.username || user.email!, userProfile.photoURL || '', message);
    };

    if (!team) {
        return <p className="text-center text-muted-foreground py-8">You are not part of a team in this tournament.</p>;
    }

    return (
        <div className="flex flex-col h-full">
            <ChatMessageDisplay messages={messages} participantProfiles={participantProfiles} isOrganizer={isOrganizer} tournamentId={tournamentId} />
            <ChatInput onSendMessage={handleSendMessage} />
        </div>
    );
};

// Announcements Component
const Announcements = ({ tournamentId, isOrganizer }: { tournamentId: string, isOrganizer: boolean }) => {
    const { user } = useAuth();
    const [announcements, setAnnouncements] = useState<Announcement[]>([]);
    const [openDialog, setOpenDialog] = useState(false);
    const [newTitle, setNewTitle] = useState("");
    const [newContent, setNewContent] = useState("");
    const [isPosting, setIsPosting] = useState(false);
    const { toast } = useToast();

    useEffect(() => {
        const q = query(collection(db, `tournaments/${tournamentId}/announcements`), orderBy("timestamp", "desc"));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Announcement));
            setAnnouncements(data);
        });
        return () => unsubscribe();
    }, [tournamentId]);

    const handlePostAnnouncement = async () => {
        if (!user) {
            toast({ variant: "destructive", title: "Error", description: "Authentication error." });
            return;
        }
        setIsPosting(true);
        try {
            await postAnnouncement(tournamentId, user.uid, newTitle, newContent);
            toast({ title: "Success", description: "Announcement posted." });
            setNewTitle("");
            setNewContent("");
            setOpenDialog(false);
        } catch(error: any) {
            toast({ variant: "destructive", title: "Error", description: error.message });
        } finally {
            setIsPosting(false);
        }
    };
    
    return (
        <div>
            {isOrganizer && (
                 <Dialog open={openDialog} onOpenChange={setOpenDialog}>
                    <DialogTrigger asChild>
                        <Button className="mb-4"><Megaphone className="mr-2"/>New Announcement</Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Create Announcement</DialogTitle>
                            <DialogDescription>Post an update for all tournament participants.</DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4 py-4">
                            <div className="space-y-2"><Label htmlFor="title">Title</Label><Input id="title" value={newTitle} onChange={e => setNewTitle(e.target.value)} /></div>
                            <div className="space-y-2"><Label htmlFor="content">Content</Label><Textarea id="content" value={newContent} onChange={e => setNewContent(e.target.value)} rows={5} /></div>
                        </div>
                        <DialogFooter><Button onClick={handlePostAnnouncement} disabled={isPosting}>{isPosting && <Loader2 className="mr-2 animate-spin"/>}Post</Button></DialogFooter>
                    </DialogContent>
                </Dialog>
            )}
            <ScrollArea className="h-96 w-full pr-4">
                <div className="space-y-6">
                {announcements.length > 0 ? announcements.map(ann => (
                    <Card key={ann.id} className="bg-card/50">
                        <CardHeader>
                            <CardTitle className="text-lg">{ann.title}</CardTitle>
                            <CardDescription>
                                Posted on {ann.timestamp ? format(new Date((ann.timestamp as any).seconds * 1000), 'PPP') : ''}
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <p className="text-sm whitespace-pre-wrap">{ann.content}</p>
                        </CardContent>
                    </Card>
                )) : (
                    <p className="text-center text-muted-foreground py-8">No announcements have been posted yet.</p>
                )}
                </div>
            </ScrollArea>
        </div>
    );
};

// Main CommunicationHub Component
export function CommunicationHub({ tournament, isOrganizer, userTeam }: { tournament: Tournament; isOrganizer: boolean; userTeam: Team | null }) {
    const [participantProfiles, setParticipantProfiles] = useState<Record<string, UserProfile>>({});
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchProfiles = async () => {
            const teamsRef = collection(db, `tournaments/${tournament.id}/teams`);
            const teamsSnapshot = await getDocs(teamsRef);
            const playerIds = new Set<string>();
            teamsSnapshot.forEach(doc => {
                const team = doc.data() as Team;
                (team.playerIds || []).forEach(id => playerIds.add(id));
            });

            if (playerIds.size === 0) {
                setLoading(false);
                return;
            }

            const profiles: Record<string, UserProfile> = {};
            const playerIdsArray = Array.from(playerIds);
            const userProfilesRef = collection(db, 'users');
            
            // Chunk the requests to stay within Firestore's limits
            for (let i = 0; i < playerIdsArray.length; i += 30) {
                const chunk = playerIdsArray.slice(i, i + 30);
                if (chunk.length > 0) {
                    const usersSnapshot = await getDocs(query(userProfilesRef, where('uid', 'in', chunk)));
                    usersSnapshot.forEach(doc => {
                        profiles[doc.id] = { uid: doc.id, ...doc.data() } as UserProfile;
                    });
                }
            }

            setParticipantProfiles(profiles);
            setLoading(false);
        };
        fetchProfiles();
    }, [tournament.id]);

    if (loading) {
        return (
            <Card>
                <CardHeader><CardTitle className="font-headline">Communication Hub</CardTitle></CardHeader>
                <CardContent className="flex justify-center items-center h-96">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </CardContent>
            </Card>
        );
    }
    
    return (
        <Card>
            <CardHeader>
                <CardTitle className="font-headline flex items-center gap-2">
                    <Rss className="w-5 h-5"/> Communication Hub
                </CardTitle>
                <CardDescription>Engage with organizers and other players.</CardDescription>
            </CardHeader>
            <CardContent>
                 <Tabs defaultValue="general">
                    <TabsList className="grid w-full grid-cols-3">
                        <TabsTrigger value="general"><MessageSquare className="mr-2 h-4 w-4"/>General</TabsTrigger>
                        <TabsTrigger value="team" disabled={!userTeam}><Users className="mr-2 h-4 w-4"/>Team</TabsTrigger>
                        <TabsTrigger value="announcements"><Megaphone className="mr-2 h-4 w-4"/>Announcements</TabsTrigger>
                    </TabsList>
                    <TabsContent value="general" className="mt-4"><GeneralChat tournamentId={tournament.id} participantProfiles={participantProfiles} isOrganizer={isOrganizer} /></TabsContent>
                    <TabsContent value="team" className="mt-4"><TeamChat tournamentId={tournament.id} team={userTeam} participantProfiles={participantProfiles} isOrganizer={isOrganizer} /></TabsContent>
                    <TabsContent value="announcements" className="mt-4"><Announcements tournamentId={tournament.id} isOrganizer={isOrganizer}/></TabsContent>
                </Tabs>
            </CardContent>
        </Card>
    );
}
