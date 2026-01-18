'use server';

import { adminDb } from '../firebase-admin';

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
