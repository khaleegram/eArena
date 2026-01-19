
'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { Button } from './ui/button';
import { BellRing, X, Loader2 } from 'lucide-react';
import { savePushSubscription } from '@/lib/actions/notifications';
import { cn } from '@/lib/utils';

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

export function PushPermissionPrompt() {
    const { user } = useAuth();
    const { toast } = useToast();
    const [isVisible, setIsVisible] = useState(false);
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        const timer = setTimeout(() => {
            if (typeof window !== 'undefined' && 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window) {
                if (Notification.permission === 'default' && !localStorage.getItem('pushPromptDismissed')) {
                    setIsVisible(true);
                }
            }
        }, 7000); // Show prompt after 7 seconds

        return () => clearTimeout(timer);
    }, []);

    const handleDismiss = () => {
        localStorage.setItem('pushPromptDismissed', 'true');
        setIsVisible(false);
    };

    const handleSubscribe = async () => {
        if (!user || !process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) {
            toast({ variant: 'destructive', title: 'Error', description: 'Cannot subscribe to notifications right now.' });
            return;
        }

        setIsLoading(true);

        try {
            const swReg = await navigator.serviceWorker.register('/sw.js');
            
            const subscription = await swReg.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY),
            });
            await savePushSubscription(user.uid, subscription.toJSON());
            toast({ title: 'Subscribed!', description: 'You will now receive notifications.' });
            setIsVisible(false);
        } catch (error: any) {
            console.error('Failed to subscribe to push notifications:', error);
            
            if (error.name === 'NotAllowedError') {
                toast({ variant: 'destructive', title: 'Permission Denied', description: 'You have blocked notifications. Please enable them in your browser settings.' });
            } else {
                toast({ variant: 'destructive', title: 'Subscription Failed', description: error.message || 'Could not subscribe to notifications. Please try again later.' });
            }

            // If permission is now denied, don't ask again.
            if (Notification.permission === 'denied') {
                handleDismiss();
            } else {
                // If they just closed the prompt, hide it but allow it to show again later.
                setIsVisible(false);
            }
        } finally {
            setIsLoading(false);
        }
    };
    
    if (!isVisible || !user) {
        return null;
    }

    return (
        <div className={cn(
            "fixed bottom-4 right-4 z-50 w-full max-w-sm rounded-lg bg-card shadow-lg border p-4 transition-all animate-in slide-in-from-bottom-10 fade-in-50"
        )}>
            <div className="flex items-start gap-4">
                <div className="flex-shrink-0 pt-0.5">
                    <BellRing className="h-6 w-6 text-primary" />
                </div>
                <div className="flex-grow">
                    <h3 className="font-semibold">Get Notified</h3>
                    <p className="text-sm text-muted-foreground">Enable push notifications for match updates, announcements, and more.</p>
                </div>
                 <button onClick={handleDismiss} className="absolute top-2 right-2 p-1 rounded-full hover:bg-muted">
                    <X className="h-4 w-4" />
                    <span className="sr-only">Dismiss</span>
                </button>
            </div>
            <div className="mt-4 flex gap-2">
                <Button onClick={handleSubscribe} disabled={isLoading} className="flex-1">
                    {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Enable
                </Button>
                <Button onClick={handleDismiss} variant="outline" className="flex-1">
                    Not Now
                </Button>
            </div>
        </div>
    );
}
