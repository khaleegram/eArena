
'use server';

import { adminDb } from '../firebase-admin';
import type { UserProfile } from '../types';
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
    
    // Firestore does not support case-insensitive prefix searches directly.
    // The common workaround is to store a lowercase version of the searchable field.
    // Assuming 'username' is already stored in a consistent case (e.g., lowercase),
    // or we accept case-sensitive search. For now, we'll proceed as if the client will handle casing.
    const snapshot = await usersRef
        .orderBy('username')
        .startAt(searchTerm)
        .endAt(searchTerm + '\uf8ff')
        .limit(10)
        .get();

    if (snapshot.empty) {
        return [];
    }
    
    return snapshot.docs.map(doc => serializeData(doc.data() as UserProfile));
}
