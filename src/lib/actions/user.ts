
'use server';

import { adminDb } from '../firebase-admin';
import type { UserProfile, PushSubscription } from '../types';
import { Timestamp } from 'firebase-admin/firestore';

// Local helper to avoid modifying the large actions.ts file for now.
function serializeData(data: any): any {
  if (data === null || data === undefined || typeof data !== 'object') {
    return data;
  }
  if (data instanceof Timestamp) {
    return data.toDate().toISOString();
  }
  if (data instanceof Date) {
      return data.toISOString();
  }
  if (Array.isArray(data)) {
    return data.map(serializeData);
  }
  const serializedObject: { [key: string]: any } = {};
  for (const key in data) {
    if (Object.prototype.hasOwnProperty.call(data, key)) {
      serializedObject[key] = serializeData(data[key]);
    }
  }
  return serializedObject;
}


export async function findUsersByUsername(username: string): Promise<UserProfile[]> {
    if (!username || !username.trim()) {
        return [];
    }
    const usersRef = adminDb.collection('users');
    const searchTerm = username.trim().toLowerCase();
    
    const snapshot = await usersRef
        .orderBy('username')
        .startAt(searchTerm)
        .endAt(searchTerm + '\uf8ff')
        .limit(10)
        .get();

    if (snapshot.empty) {
        return [];
    }
    
    return snapshot.docs.map(doc => serializeData({uid: doc.id, ...doc.data()} as UserProfile));
}

export async function savePushSubscription(userId: string, subscription: PushSubscription) {
    if (!userId || !subscription) {
        throw new Error('User ID and subscription are required.');
    }
    const subscriptionRef = adminDb.collection('users').doc(userId).collection('pushSubscriptions').doc(subscription.endpoint.substring(subscription.endpoint.lastIndexOf('/') + 1));
    await subscriptionRef.set(subscription);
}

export async function deletePushSubscription(userId: string, endpoint: string) {
    if (!userId || !endpoint) {
        throw new Error('User ID and endpoint are required.');
    }
    const subscriptionId = endpoint.substring(endpoint.lastIndexOf('/') + 1);
    const subscriptionRef = adminDb.collection('users').doc(userId).collection('pushSubscriptions').doc(subscriptionId);
    await subscriptionRef.delete();
}
