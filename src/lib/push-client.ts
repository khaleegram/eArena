'use client';

import { savePushSubscription, deletePushSubscription } from '@/lib/actions';

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

export async function getExistingPushSubscription(): Promise<PushSubscription | null> {
  if (!isPushSupported()) return null;
  const swReg = await navigator.serviceWorker.ready;
  return swReg.pushManager.getSubscription();
}

export async function subscribeToPush(userId: string): Promise<PushSubscription> {
  if (!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) {
    throw new Error('Push notifications are not configured.');
  }
  if (!isPushSupported()) {
    throw new Error('Push notifications are not supported on this device.');
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error('Notification permission was denied.');
  }

  const swReg = await navigator.serviceWorker.ready;
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
  const swReg = await navigator.serviceWorker.ready;
  const existing = await swReg.pushManager.getSubscription();
  if (!existing) return;
  await existing.unsubscribe();
  await deletePushSubscription(userId, existing.endpoint);
}
