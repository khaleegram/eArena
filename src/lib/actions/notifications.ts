
'use server';

import { adminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import type { Notification, PushSubscription as ClientPushSubscription } from '@/lib/types';
import webPush from 'web-push';
import { createHash } from 'crypto';

// Configure web-push with VAPID keys from environment variables
if (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    webPush.setVapidDetails(
        process.env.VAPID_SUBJECT || `mailto:${process.env.SMTP_USERNAME || 'earena.noreply@gmail.com'}`,
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
        const sub = doc.data() as ClientPushSubscription;
        // Validate the subscription object before sending
        if (sub && typeof sub.endpoint === 'string' && sub.keys && typeof sub.keys.p256dh === 'string' && typeof sub.keys.auth === 'string') {
            return webPush.sendNotification(sub, payload, { TTL: 60 * 15 }).catch(error => {
                if (error.statusCode === 410 || error.statusCode === 404) {
                    // Subscription is no longer valid, remove it.
                    console.log(`Subscription ${sub.endpoint} is no longer valid. Deleting.`);
                    return doc.ref.delete();
                } else {
                    console.error('Failed to send push notification:', error);
                }
            });
        } else {
             console.warn(`Invalid subscription format found for user ${userId}. Deleting.`, sub);
             return doc.ref.delete();
        }
    });

    await Promise.allSettled(pushPromises);
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
    // Use a hash of the endpoint as the document ID to prevent collisions and illegal characters.
    const docId = createHash('sha256').update(subscription.endpoint).digest('hex');
    const subscriptionRef = adminDb.collection('users').doc(userId).collection('pushSubscriptions').doc(docId);
    await subscriptionRef.set(subscription);
}

export async function deletePushSubscription(userId: string, endpoint: string) {
    const docId = createHash('sha256').update(endpoint).digest('hex');
    const subscriptionRef = adminDb.collection('users').doc(userId).collection('pushSubscriptions').doc(docId);
    await subscriptionRef.delete();
}
