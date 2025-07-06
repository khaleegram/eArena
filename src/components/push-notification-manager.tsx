
'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { Button } from './ui/button';
import { BellRing } from 'lucide-react';
import { savePushSubscription, deletePushSubscription } from '@/lib/actions/user';

function urlBase64ToUint8Array(base64String: string) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
        .replace(/\-/g, '+')
        .replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}

export function PushNotificationManager() {
    const { user } = useAuth();
    const { toast } = useToast();
    const [isSubscribed, setIsSubscribed] = useState(false);
    const [subscription, setSubscription] = useState<PushSubscription | null>(null);
    const [permission, setPermission] = useState<NotificationPermission>('default');

    useEffect(() => {
        if (typeof window !== 'undefined' && 'Notification' in window) {
            setPermission(Notification.permission);
        }
    }, []);

    useEffect(() => {
        if ('serviceWorker' in navigator && user) {
            navigator.serviceWorker.register('/sw.js').then(swReg => {
                console.log('Service Worker is registered', swReg);
                swReg.pushManager.getSubscription().then(sub => {
                    if (sub) {
                        setIsSubscribed(true);
                        setSubscription(sub);
                    }
                });
            }).catch(error => {
                console.error('Service Worker Error', error);
            });
        }
    }, [user]);

    const handleSubscription = async () => {
        if (!user) return;

        if (permission === 'denied') {
            toast({ variant: 'destructive', title: 'Permission Denied', description: 'Please enable notifications in your browser settings.' });
            return;
        }

        if (isSubscribed) {
            // Unsubscribe
            subscription?.unsubscribe().then(() => {
                deletePushSubscription(user.uid, subscription.endpoint);
                setIsSubscribed(false);
                setSubscription(null);
                toast({ title: 'Unsubscribed', description: 'You will no longer receive push notifications.' });
            });
        } else {
            // Subscribe
            try {
                const reg = await navigator.serviceWorker.ready;
                const sub = await reg.pushManager.subscribe({
                    userVisibleOnly: true,
                    applicationServerKey: urlBase64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!),
                });
                
                await savePushSubscription(user.uid, sub.toJSON());

                setIsSubscribed(true);
                setSubscription(sub);
                toast({ title: 'Subscribed!', description: 'You will now receive notifications.' });
            } catch (error) {
                console.error('Failed to subscribe the user: ', error);
                toast({ variant: 'destructive', title: 'Subscription Failed', description: 'Could not subscribe to notifications.' });
            }
        }
    };

    if (!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) {
        return null;
    }

    if (permission === 'default') {
        return (
            <div className="p-4 bg-muted border-t">
                <div className="container flex items-center justify-between">
                    <p className="text-sm">Enable notifications to get updates?</p>
                    <Button size="sm" onClick={handleSubscription}><BellRing className="mr-2 h-4 w-4"/>Enable</Button>
                </div>
            </div>
        )
    }

    return null; // Don't show anything if permission is granted or denied, handled elsewhere.
}
