
"use client";

import { useState, useEffect } from "react";
import Link from 'next/link';
import { useAuth } from "@/hooks/use-auth";
import { db } from "@/lib/firebase";
import { collection, onSnapshot, query, orderBy, limit } from "firebase/firestore";
import type { Notification } from "@/lib/types";
import { markNotificationsAsRead } from "@/lib/actions";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Bell, Circle } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Separator } from "./ui/separator";
import { cn } from "@/lib/utils";


const useNotifications = (userId: string | null) => {
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [unreadCount, setUnreadCount] = useState(0);

    useEffect(() => {
        if (!userId) {
            setNotifications([]);
            setUnreadCount(0);
            return;
        }

        const q = query(
            collection(db, `users/${userId}/notifications`),
            orderBy("createdAt", "desc"),
            limit(10)
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const notifs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Notification));
            const unread = notifs.filter(n => !n.isRead).length;
            
            setNotifications(notifs);
            setUnreadCount(unread);
        });

        return () => unsubscribe();
    }, [userId]);

    return { notifications, unreadCount };
}


export function NotificationBell() {
    const { user } = useAuth();
    const { notifications, unreadCount } = useNotifications(user?.uid || null);
    const [isOpen, setIsOpen] = useState(false);

    useEffect(() => {
        if (isOpen && unreadCount > 0 && user) {
            markNotificationsAsRead(user.uid);
        }
    }, [isOpen, unreadCount, user]);

    if (!user) return null;

    return (
        <Popover open={isOpen} onOpenChange={setIsOpen}>
            <PopoverTrigger asChild>
                <Button variant="ghost" size="icon" className="relative h-8 w-8 rounded-full">
                    <Bell className="h-5 w-5" />
                    {unreadCount > 0 && (
                        <span className="absolute top-0 right-0 flex h-3 w-3">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-3 w-3 bg-primary"></span>
                        </span>
                    )}
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 p-0" align="end">
                <div className="p-4">
                    <h4 className="font-medium text-sm">Notifications</h4>
                </div>
                <Separator />
                <div className="p-2 max-h-96 overflow-y-auto">
                    {notifications.length > 0 ? (
                        notifications.map(notif => (
                            <Link key={notif.id} href={notif.href} passHref>
                                <div onClick={() => setIsOpen(false)} className="block w-full text-left rounded-md p-3 hover:bg-accent transition-colors cursor-pointer">
                                    <div className="flex justify-between items-start">
                                        <p className="font-semibold text-sm leading-snug">{notif.title}</p>
                                        {!notif.isRead && (
                                             <Circle className="h-2 w-2 fill-primary text-primary mt-1" />
                                        )}
                                    </div>
                                    <p className="text-sm text-muted-foreground pt-1">{notif.body}</p>
                                    <p className="text-xs text-muted-foreground/70 pt-2">
                                        {notif.createdAt ? formatDistanceToNow(new Date((notif.createdAt as any).seconds * 1000), { addSuffix: true }) : ''}
                                    </p>
                                </div>
                            </Link>
                        ))
                    ) : (
                        <p className="text-center text-sm text-muted-foreground p-8">No new notifications.</p>
                    )}
                </div>
            </PopoverContent>
        </Popover>
    );
}

