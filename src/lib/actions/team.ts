
'use server';

import { adminDb } from '@/lib/firebase-admin';
import type { Team, Player } from '@/lib/types';
import { FieldValue } from 'firebase-admin/firestore';
import { revalidatePath } from 'next/cache';
import { serializeData } from '@/lib/utils';

export async function getTeamsForTournament(tournamentId: string): Promise<Team[]> {
    const teamsSnapshot = await adminDb.collection('tournaments').doc(tournamentId).collection('teams').get();
    return teamsSnapshot.docs.map(doc => serializeData({ id: doc.id, ...doc.data() }) as Team);
}
