
'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { Button } from './ui/button';
import { BellRing, BellOff } from 'lucide-react';
import { savePushSubscription, deletePushSubscription } from '@/lib/actions/user';
import { Loader2 } from 'lucide-react';

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
    const [isLoading, setIsLoading] = useState(false); // Changed initial state to false
    const [isChecking, setIsChecking] = useState(true); // New state to handle initial check

    useEffect(() => {
        if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) {
            setIsChecking(false);
            return;
        }

        const checkSubscription = async () => {
            try {
                const swReg = await navigator.serviceWorker.ready;
                const sub = await swReg.pushManager.getSubscription();
                setPermission(Notification.permission);
                if (sub) {
                    setIsSubscribed(true);
                    setSubscription(sub);
                } else {
                    setIsSubscribed(false);
                    setSubscription(null);
                }
            } catch (error) {
                console.error("Error checking push subscription:", error);
            } finally {
                setIsChecking(false);
            }
        };

        checkSubscription();
    }, []);

    const handleSubscription = async () => {
        if (!user || isChecking) return;

        if (Notification.permission === 'denied') {
            toast({ variant: 'destructive', title: 'Permission Denied', description: 'Please enable notifications in your browser settings.' });
            return;
        }
        
        setIsLoading(true);

        if (isSubscribed) {
            // Unsubscribe logic
            try {
                if(subscription) {
                    await subscription.unsubscribe();
                    await deletePushSubscription(user.uid, subscription.endpoint);
                }
                setIsSubscribed(false);
                setSubscription(null);
                toast({ title: 'Unsubscribed', description: 'You will no longer receive push notifications.' });
            } catch (error) {
                console.error("Failed to unsubscribe:", error);
                toast({ variant: 'destructive', title: 'Error', description: 'Could not unsubscribe from notifications.' });
            } finally {
                setIsLoading(false);
            }
        } else {
            // Subscribe logic
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
            } catch (error: any) {
                console.error('Failed to subscribe the user: ', error);
                if (error.name === 'NotAllowedError') {
                    toast({ variant: 'destructive', title: 'Permission Denied', description: 'You need to allow notifications to subscribe.' });
                } else {
                    toast({ variant: 'destructive', title: 'Subscription Failed', description: 'Could not subscribe to notifications.' });
                }
            } finally {
                setIsLoading(false);
            }
        }
    };

    if (!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) {
        return (
            <p className="text-sm text-destructive">
                VAPID public key not configured. Push notifications are disabled.
            </p>
        );
    }
    
    if (isChecking) {
        return (
             <Button disabled>
                <Loader2 className="mr-2 h-4 w-4 animate-spin"/>
                Checking Status...
            </Button>
        );
    }

    if (permission === 'denied') {
        return (
             <p className="text-sm text-destructive">
                Notification permissions are blocked in your browser settings.
            </p>
        );
    }

    return (
        <div className="flex items-center gap-4">
            <p className="text-sm text-muted-foreground">Manage push notifications for this device.</p>
            <Button onClick={handleSubscription} disabled={isLoading}>
                {isLoading ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin"/>
                ) : isSubscribed ? (
                    <BellOff className="mr-2 h-4 w-4"/>
                ) : (
                    <BellRing className="mr-2 h-4 w-4"/>
                )}
                {isSubscribed ? 'Disable Notifications' : 'Enable Notifications'}
            </Button>
        </div>
    );
}
