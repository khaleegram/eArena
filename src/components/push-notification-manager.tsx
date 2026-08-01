'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { Button } from './ui/button';
import { BellRing, BellOff, Info, Loader2 } from 'lucide-react';
import { Alert, AlertDescription } from './ui/alert';
import {
  getExistingPushSubscription,
  isIosDevice,
  isPushSupported,
  subscribeToPush,
  unsubscribeFromPush,
  warmServiceWorkerInBackground,
} from '@/lib/push-client';

export function PushNotificationManager() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const [isChecking, setIsChecking] = useState(true);
  const [isIos, setIsIos] = useState(false);

  useEffect(() => {
    setIsIos(isIosDevice());

    if (!isPushSupported()) {
      setIsSupported(false);
      setIsChecking(false);
      return;
    }

    setIsSupported(true);
    warmServiceWorkerInBackground();

    const checkSubscription = async () => {
      try {
        const sub = await getExistingPushSubscription();
        setIsSubscribed(!!sub);
      } catch (error) {
        console.error('Error checking push subscription:', error);
        setIsSubscribed(false);
      } finally {
        setIsChecking(false);
      }
    };

    void checkSubscription();
  }, []);

  const handleSubscription = async () => {
    if (!user || isLoading || !isSupported) return;

    setIsLoading(true);
    try {
      if (isSubscribed) {
        await unsubscribeFromPush(user.uid);
        setIsSubscribed(false);
        toast({ title: 'Unsubscribed', description: 'You will no longer receive push notifications.' });
      } else {
        // Permission dialog first, then SW/subscribe.
        await subscribeToPush(user.uid);
        setIsSubscribed(true);
        toast({ title: 'Subscribed!', description: 'You will now receive notifications.' });
      }
    } catch (error: unknown) {
      console.error('Failed to update subscription: ', error);
      const err = error as { name?: string; message?: string };
      if (err.name === 'NotAllowedError' || Notification.permission === 'denied') {
        toast({
          variant: 'destructive',
          title: 'Permission Denied',
          description: 'Please enable notifications in your browser settings.',
        });
      } else {
        toast({
          variant: 'destructive',
          title: 'Subscription Failed',
          description: err.message || 'Could not update your notification settings.',
        });
      }
      const sub = await getExistingPushSubscription();
      setIsSubscribed(!!sub);
    } finally {
      setIsLoading(false);
    }
  };

  if (isChecking) {
    return (
      <Button disabled>
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Checking Status...
      </Button>
    );
  }

  if (!isSupported) {
    if (isIos) {
      return (
        <Alert variant="default" className="border-primary/20">
          <Info className="h-4 w-4" />
          <AlertDescription>
            To enable notifications on your iPhone/iPad, add eArena to your Home Screen from the Safari share
            menu, then subscribe from the installed app.
          </AlertDescription>
        </Alert>
      );
    }
    return (
      <p className="text-sm text-muted-foreground">
        Push notifications are not supported on this browser or device.
      </p>
    );
  }

  if (!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) {
    return (
      <p className="text-sm text-destructive">
        Push notifications are not configured by the site administrator.
      </p>
    );
  }

  return (
    <div className="flex items-center gap-4">
      <p className="text-sm text-muted-foreground">Manage push notifications for this device.</p>
      <Button onClick={handleSubscription} disabled={isLoading}>
        {isLoading ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : isSubscribed ? (
          <BellOff className="mr-2 h-4 w-4" />
        ) : (
          <BellRing className="mr-2 h-4 w-4" />
        )}
        {isSubscribed ? 'Disable Notifications' : 'Enable Notifications'}
      </Button>
    </div>
  );
}
