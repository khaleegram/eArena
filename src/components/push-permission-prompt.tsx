'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { Button } from './ui/button';
import { BellRing, X, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { isPushSupported, subscribeToPush, warmServiceWorkerInBackground } from '@/lib/push-client';

export function PushPermissionPrompt() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isVisible, setIsVisible] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!user) return;

    warmServiceWorkerInBackground();

    const timer = setTimeout(() => {
      if (!isPushSupported()) return;
      if (Notification.permission === 'default' && !localStorage.getItem('pushPromptDismissed')) {
        setIsVisible(true);
      }
    }, 5000);

    return () => clearTimeout(timer);
  }, [user]);

  const handleDismiss = () => {
    localStorage.setItem('pushPromptDismissed', 'true');
    setIsVisible(false);
  };

  const handleSubscribe = async () => {
    if (!user) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Sign in to enable notifications.',
      });
      return;
    }

    setIsLoading(true);
    try {
      // Permission dialog shows first; SW work happens after Allow.
      await subscribeToPush(user.uid);
      toast({ title: 'Subscribed!', description: 'You will now receive notifications.' });
      setIsVisible(false);
    } catch (error: unknown) {
      console.error('Failed to subscribe to push notifications:', error);
      const err = error as { name?: string; message?: string };

      if (err.name === 'NotAllowedError' || Notification.permission === 'denied') {
        toast({
          variant: 'destructive',
          title: 'Permission Denied',
          description: 'You have blocked notifications. Enable them in browser settings.',
        });
        handleDismiss();
      } else {
        toast({
          variant: 'destructive',
          title: 'Subscription Failed',
          description: err.message || 'Could not subscribe. Please try again.',
        });
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
    <div
      className={cn(
        'fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom,0px))] md:bottom-4 right-4 left-4 md:left-auto z-50 w-auto max-w-sm rounded-lg bg-card shadow-lg border p-4 transition-all animate-in slide-in-from-bottom-10 fade-in-50'
      )}
    >
      <div className="flex items-start gap-4">
        <div className="flex-shrink-0 pt-0.5">
          <BellRing className="h-6 w-6 text-primary" />
        </div>
        <div className="flex-grow">
          <h3 className="font-semibold">Get Notified</h3>
          <p className="text-sm text-muted-foreground">
            Enable push notifications for match updates, announcements, and more.
          </p>
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
