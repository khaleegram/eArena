
'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { Button } from './ui/button';
import { BellRing, BellOff, Info } from 'lucide-react';
import { savePushSubscription, deletePushSubscription } from '@/lib/actions/notifications';
import { Loader2 } from 'lucide-react';
import { Alert, AlertDescription } from './ui/alert';

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
    const [isLoading, setIsLoading] = useState(false);
    const [isSupported, setIsSupported] = useState(false);
    const [isChecking, setIsChecking] = useState(true);
    const [isIos, setIsIos] = useState(false);

    useEffect(() => {
        if (typeof window !== 'undefined') {
            setIsIos(/iPad|iPhone|iPod/.test(navigator.userAgent));

            if ('serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window) {
                setIsSupported(true);
                const checkSubscription = async () => {
                    try {
                        const readyPromise = navigator.serviceWorker.ready;
                        // This timeout is a safeguard. If the service worker is broken,
                        // we won't hang the UI forever.
                        const timeoutPromise = new Promise((_, reject) => 
                            setTimeout(() => reject(new Error("Service worker took too long to become ready.")), 15000)
                        );
                        const swReg = await Promise.race([readyPromise, timeoutPromise]) as ServiceWorkerRegistration;
                        const sub = await swReg.pushManager.getSubscription();
                        setIsSubscribed(!!sub);
                    } catch (error: any) {
                        console.error("Error checking push subscription:", error);
                        // Don't toast here as it can be annoying if the SW is just slow on startup
                        setIsSubscribed(false);
                    } finally {
                        setIsChecking(false);
                    }
                };
                checkSubscription();
            } else {
                setIsSupported(false);
                setIsChecking(false);
            }
        }
    }, []);

    const handleSubscription = async () => {
        if (!user || isLoading || !isSupported) return;
        
        if (!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) {
             toast({ variant: 'destructive', title: 'Configuration Error', description: 'Push notifications are not configured on the server.' });
             return;
        }

        setIsLoading(true);

        const permission = await Notification.requestPermission();
        if (permission === 'denied') {
            toast({ variant: 'destructive', title: 'Permission Denied', description: 'Please enable notifications in your browser settings.' });
            setIsLoading(false);
            return;
        }

        try {
            const swReg = await navigator.serviceWorker.ready;
            const existingSubscription = await swReg.pushManager.getSubscription();

            if (existingSubscription) {
                await existingSubscription.unsubscribe();
                await deletePushSubscription(user.uid, existingSubscription.endpoint);
                setIsSubscribed(false);
                toast({ title: 'Unsubscribed', description: 'You will no longer receive push notifications.' });
            } else {
                const newSubscription = await swReg.pushManager.subscribe({
                    userVisibleOnly: true,
                    applicationServerKey: urlBase64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY),
                });
                await savePushSubscription(user.uid, newSubscription.toJSON());
                setIsSubscribed(true);
                toast({ title: 'Subscribed!', description: 'You will now receive notifications.' });
            }
        } catch (error: any) {
            console.error('Failed to update subscription: ', error);
            if (error.name === 'NotAllowedError') {
                toast({ variant: 'destructive', title: 'Permission Denied', description: 'You need to allow notifications to subscribe.' });
            } else {
                toast({ variant: 'destructive', title: 'Subscription Failed', description: 'Could not update your notification settings.' });
            }
            // Re-check state in case of failure
            const sub = await navigator.serviceWorker.ready.then(reg => reg.pushManager.getSubscription());
            setIsSubscribed(!!sub);
        } finally {
            setIsLoading(false);
        }
    };
    
    if (isChecking) {
        return <Button disabled><Loader2 className="mr-2 h-4 w-4 animate-spin"/>Checking Status...</Button>;
    }
    
    if (!isSupported) {
        if (isIos) {
            return (
                <Alert variant="default" className="border-primary/20">
                  <Info className="h-4 w-4" />
                  <AlertDescription>
                    To enable notifications on your iPhone/iPad, add eArena to your Home Screen from the Safari share menu, then subscribe from the installed app.
                  </AlertDescription>
                </Alert>
            );
        }
        return <p className="text-sm text-muted-foreground">Push notifications are not supported on this browser or device.</p>;
    }

    if (!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) {
        return <p className="text-sm text-destructive">Push notifications are not configured by the site administrator.</p>;
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
