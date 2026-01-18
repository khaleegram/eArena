
import { Timestamp } from 'firebase-admin/firestore';
import { adminDb } from '../firebase-admin';

// Helper function to convert Firestore Timestamps to ISO strings recursively
export function serializeData(data: any): any {
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

  // This handles plain objects
  const serializedObject: { [key: string]: any } = {};
  for (const key in data) {
    if (Object.prototype.hasOwnProperty.call(data, key)) {
      serializedObject[key] = serializeData(data[key]);
    }
  }
  return serializedObject;
}


async function deleteCollection(collectionPath: string, batchSize: number) {
  const collectionRef = adminDb.collection(collectionPath);
  const q = collectionRef.orderBy('__name__').limit(batchSize);

  return new Promise((resolve, reject) => {
    deleteQueryBatch(q, resolve).catch(reject);
  });
}

async function deleteQueryBatch(q: FirebaseFirestore.Query, resolve: (value?: unknown) => void) {
  const snapshot = await q.get();

  const batchSize = snapshot.size;
  if (batchSize === 0) {
    resolve();
    return;
  }

  const batch = adminDb.batch();
  snapshot.docs.forEach((doc: any) => {
    batch.delete(doc.ref);
  });
  await batch.commit();

  process.nextTick(() => {
    deleteQueryBatch(q, resolve);
  });
}

export async function fullTournamentDelete(tournamentId: string) {
    const tournamentRef = adminDb.collection('tournaments').doc(tournamentId);

    // Subcollections
    await deleteCollection(`tournaments/${tournamentId}/teams`, 100);
    await deleteCollection(`tournaments/${tournamentId}/matches`, 100);
    await deleteCollection(`tournaments/${tournamentId}/announcements`, 100);
    
    // Associated collections
    const standingsSnapshot = await adminDb.collection('standings').where('tournamentId', '==', tournamentId).get();
    const batch = adminDb.batch();
    standingsSnapshot.forEach(doc => batch.delete(doc.ref));
    await batch.commit();

    // The tournament doc itself
    await tournamentRef.delete();
}
