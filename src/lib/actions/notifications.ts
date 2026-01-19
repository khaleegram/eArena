
'use server';

import { adminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import type { Notification } from '@/lib/types';
import webPush from 'web-push';

// Configure web-push with VAPID keys from environment variables
if (process.env.VAPID_PRIVATE_KEY && process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) {
    webPush.setVapidDetails(
        `mailto:${process.env.SMTP_USERNAME || 'support@example.com'}`, // Using SMTP user as contact email
        process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
        process.env.VAPID_PRIVATE_KEY
    );
} else {
    console.warn('[web-push] VAPID keys are not configured. Push notifications will not be sent.');
}


export async function sendNotification(userId: string, notification: Omit<Notification, 'id' | 'createdAt' | 'isRead'>) {
    const notificationRef = adminDb.collection('users').doc(userId).collection('notifications').doc();
    
    // 1. Save the notification to Firestore
    await notificationRef.set({
        ...notification,
        isRead: false,
        createdAt: FieldValue.serverTimestamp()
    });

    // 2. Send push notification if configured
    if (!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
        return;
    }
    
    const subscriptionsSnapshot = await adminDb.collection('users').doc(userId).collection('pushSubscriptions').get();
    if (subscriptionsSnapshot.empty) {
        return;
    }

    const payload = JSON.stringify({
        title: notification.title,
        body: notification.body,
        icon: '/icons/android/android-launchericon-192-192.png',
        data: {
            href: notification.href
        }
    });

    const pushPromises = subscriptionsSnapshot.docs.map(doc => {
        const sub = doc.data();
        return webPush.sendNotification(sub as any, payload).catch(error => {
            if (error.statusCode === 410 || error.statusCode === 404) {
                // Subscription is no longer valid, remove it.
                console.log(`Subscription ${sub.endpoint} is no longer valid. Deleting.`);
                return doc.ref.delete();
            } else {
                console.error('Failed to send push notification:', error);
            }
        });
    });

    await Promise.all(pushPromises);
}

export async function markNotificationsAsRead(userId: string) {
    const notificationsRef = adminDb.collection('users').doc(userId).collection('notifications');
    const unreadSnapshot = await notificationsRef.where('isRead', '==', false).get();

    if (unreadSnapshot.empty) {
        return;
    }

    const batch = adminDb.batch();
    unreadSnapshot.docs.forEach(doc => {
        batch.update(doc.ref, { isRead: true });
    });

    await batch.commit();
}

export async function savePushSubscription(userId: string, subscription: any) {
    const subscriptionRef = adminDb.collection('users').doc(userId).collection('pushSubscriptions').doc(subscription.endpoint.slice(-100)); // Use part of endpoint as ID
    await subscriptionRef.set(subscription);
}

export async function deletePushSubscription(userId: string, endpoint: string) {
    const subscriptionRef = adminDb.collection('users').doc(userId).collection('pushSubscriptions').doc(endpoint.slice(-100));
    await subscriptionRef.delete();
}
