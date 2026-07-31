'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { BellRing, Download, Loader2, Share, Smartphone } from 'lucide-react';
import {
  getExistingPushSubscription,
  isIosDevice,
  isPushSupported,
  isStandalonePwa,
  subscribeToPush,
} from '@/lib/push-client';

const DISMISS_KEY = 'earena-install-dismissed';
const DISMISS_MS = 7 * 24 * 60 * 60 * 1000;

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

function wasDismissedRecently(): boolean {
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    if (!raw) return false;
    const ts = Number(raw);
    if (!Number.isFinite(ts)) return false;
    return Date.now() - ts < DISMISS_MS;
  } catch {
    return false;
  }
}

function markDismissed() {
  try {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
  } catch {
    // ignore
  }
}

export function InstallPrompt() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'android' | 'ios' | 'notifications'>('android');
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const refreshSubscription = useCallback(async () => {
    if (!isPushSupported()) {
      setIsSubscribed(false);
      return;
    }
    const sub = await getExistingPushSubscription().catch(() => null);
    setIsSubscribed(!!sub);
  }, []);

  useEffect(() => {
    if (!user) return;

    const standalone = isStandalonePwa();
    const dismissed = wasDismissedRecently();
    let timeoutId: number | undefined;

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstall);

    void (async () => {
      await refreshSubscription();
      const sub = await getExistingPushSubscription().catch(() => null);

      if (standalone) {
        if (!sub && isPushSupported() && !dismissed) {
          setMode('notifications');
          setOpen(true);
        }
        return;
      }

      if (dismissed) return;

      timeoutId = window.setTimeout(() => {
        if (isIosDevice()) {
          setMode('ios');
          setOpen(true);
        }
        // Android waits for beforeinstallprompt (second effect)
      }, 1500);
    })();

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      if (timeoutId) window.clearTimeout(timeoutId);
    };
  }, [user, refreshSubscription]);

  // When Android deferred prompt arrives after mount, open the sheet
  useEffect(() => {
    if (!user || isStandalonePwa() || wasDismissedRecently()) return;
    if (!deferredPrompt) return;
    if (isIosDevice()) return;
    setMode('android');
    setOpen(true);
  }, [deferredPrompt, user]);

  const handleDismiss = () => {
    markDismissed();
    setOpen(false);
  };

  const handleAndroidInstall = async () => {
    if (!deferredPrompt) return;
    setIsLoading(true);
    try {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      setDeferredPrompt(null);
      if (choice.outcome === 'accepted') {
        toast({ title: 'Installed!', description: 'Open eArena from your home screen for the best experience.' });
        const sub = await getExistingPushSubscription().catch(() => null);
        if (sub || !isPushSupported()) {
          markDismissed();
          setOpen(false);
        } else {
          setMode('notifications');
        }
      } else {
        handleDismiss();
      }
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Install failed', description: e?.message || 'Could not open install prompt.' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleEnableNotifications = async () => {
    if (!user) return;
    setIsLoading(true);
    try {
      await subscribeToPush(user.uid);
      setIsSubscribed(true);
      toast({ title: 'Notifications on', description: 'You will get match reminders and tournament updates.' });
      markDismissed();
      setOpen(false);
    } catch (e: any) {
      toast({
        variant: 'destructive',
        title: 'Could not enable notifications',
        description: e?.message || 'Check browser permission settings.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (!user) return null;

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) handleDismiss();
        else setOpen(true);
      }}
    >
      <SheetContent side="bottom" className="rounded-t-2xl max-w-lg mx-auto">
        {mode === 'android' && (
          <>
            <SheetHeader className="text-left">
              <SheetTitle className="font-headline flex items-center gap-2">
                <Download className="h-5 w-5 text-primary" />
                Add eArena to Home Screen
              </SheetTitle>
              <SheetDescription>
                Install the app for faster access and match reminders — even when the browser is closed.
              </SheetDescription>
            </SheetHeader>
            <div className="mt-6 flex flex-col gap-3">
              <Button onClick={handleAndroidInstall} disabled={isLoading || !deferredPrompt}>
                {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Smartphone className="mr-2 h-4 w-4" />}
                Add to Home Screen
              </Button>
              <Button variant="ghost" onClick={handleDismiss}>
                Not now
              </Button>
            </div>
          </>
        )}

        {mode === 'ios' && (
          <>
            <SheetHeader className="text-left">
              <SheetTitle className="font-headline flex items-center gap-2">
                <Smartphone className="h-5 w-5 text-primary" />
                Add eArena to your iPhone
              </SheetTitle>
              <SheetDescription>
                iPhone requires a short manual step. After installing, open eArena from your Home Screen to enable push notifications.
              </SheetDescription>
            </SheetHeader>
            <ol className="mt-6 space-y-4 text-sm">
              <li className="flex gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/15 font-semibold text-primary">1</span>
                <span>
                  Tap the <Share className="inline h-4 w-4 align-text-bottom" /> <strong>Share</strong> button in Safari (bottom center).
                </span>
              </li>
              <li className="flex gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/15 font-semibold text-primary">2</span>
                <span>
                  Scroll and tap <strong>Add to Home Screen</strong>.
                </span>
              </li>
              <li className="flex gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/15 font-semibold text-primary">3</span>
                <span>
                  Tap <strong>Add</strong>, then open eArena from the new icon and enable notifications.
                </span>
              </li>
            </ol>
            <div className="mt-6 flex flex-col gap-3">
              <Button variant="secondary" onClick={handleDismiss}>
                Got it
              </Button>
            </div>
          </>
        )}

        {mode === 'notifications' && !isSubscribed && (
          <>
            <SheetHeader className="text-left">
              <SheetTitle className="font-headline flex items-center gap-2">
                <BellRing className="h-5 w-5 text-primary" />
                Enable match reminders
              </SheetTitle>
              <SheetDescription>
                Get notified when your match is today, when a tournament starts, and when results need your attention.
              </SheetDescription>
            </SheetHeader>
            <div className="mt-6 flex flex-col gap-3">
              <Button onClick={handleEnableNotifications} disabled={isLoading}>
                {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <BellRing className="mr-2 h-4 w-4" />}
                Enable Notifications
              </Button>
              <Button variant="ghost" onClick={handleDismiss}>
                Not now
              </Button>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
