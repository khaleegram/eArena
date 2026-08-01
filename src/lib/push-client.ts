'use client';

import { savePushSubscription, deletePushSubscription } from '@/lib/actions/notifications';

export function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function isPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

export function isStandalonePwa(): boolean {
  if (typeof window === 'undefined') return false;
  const mq = window.matchMedia('(display-mode: standalone)').matches;
  const iosStandalone = (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
  return mq || iosStandalone;
}

export function isIosDevice(): boolean {
  if (typeof window === 'undefined') return false;
  const ua = window.navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

/**
 * Prefer an already-active SW (next-pwa usually registered it).
 * Only register if missing, and never hang forever on ready.
 */
export async function ensureServiceWorker(timeoutMs = 10000): Promise<ServiceWorkerRegistration> {
  if (!('serviceWorker' in navigator)) {
    throw new Error('Service workers are not supported on this device.');
  }

  const existing = await navigator.serviceWorker.getRegistration('/');
  if (existing?.active) {
    return existing;
  }

  const readyOrTimeout = Promise.race([
    (async () => {
      if (!existing) {
        await navigator.serviceWorker.register('/sw.js');
      }
      return navigator.serviceWorker.ready;
    })(),
    new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Service worker took too long to start. Try again in a moment.')), timeoutMs);
    }),
  ]);

  return readyOrTimeout;
}

/** Warm the SW in the background so Enable Notifications is fast later. */
export function warmServiceWorkerInBackground() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

  const run = () => {
    void ensureServiceWorker().catch(() => {
      // Ignore warm failures; subscribe path will surface errors.
    });
  };

  if ('requestIdleCallback' in window) {
    (window as Window & { requestIdleCallback: (cb: () => void, opts?: { timeout: number }) => number }).requestIdleCallback(
      run,
      { timeout: 4000 }
    );
  } else {
    setTimeout(run, 2500);
  }
}

export async function getExistingPushSubscription(): Promise<PushSubscription | null> {
  if (!isPushSupported()) return null;
  try {
    const swReg = await ensureServiceWorker(5000);
    return swReg.pushManager.getSubscription();
  } catch {
    return null;
  }
}

/**
 * Ask for notification permission FIRST (shows Allow/Block immediately),
 * then finish SW/subscribe work after the user responds.
 */
export async function subscribeToPush(userId: string): Promise<PushSubscription> {
  if (!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) {
    throw new Error('Push notifications are not configured.');
  }
  if (!isPushSupported()) {
    throw new Error('Push notifications are not supported on this device.');
  }

  // Critical: show the system dialog before waiting on SW install.
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error('Notification permission was denied.');
  }

  const swReg = await ensureServiceWorker();
  const existing = await swReg.pushManager.getSubscription();
  if (existing) {
    await savePushSubscription(userId, existing.toJSON() as any);
    return existing;
  }

  const subscription = await swReg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY),
  });
  await savePushSubscription(userId, subscription.toJSON() as any);
  return subscription;
}

export async function unsubscribeFromPush(userId: string): Promise<void> {
  if (!isPushSupported()) return;
  const swReg = await ensureServiceWorker();
  const existing = await swReg.pushManager.getSubscription();
  if (!existing) return;
  await existing.unsubscribe();
  await deletePushSubscription(userId, existing.endpoint);
}
