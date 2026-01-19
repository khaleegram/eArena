
'use server';

import { adminDb } from '@/lib/firebase-admin';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { startTournamentAndGenerateFixtures, initiatePayouts } from '@/lib/actions';
import { toDate } from '@/lib/utils';
import type { Tournament } from '@/lib/types';
import { addDays, startOfDay } from 'date-fns';
import { updateStandings } from './standings';

export async function runStartTournamentsJob() {
    const now = new Date();
    
    // --- Step 1: Transition tournaments from 'open' to 'ready' ---
    const openTournamentsSnapshot = await adminDb.collection('tournaments')
      .where('status', '==', 'open_for_registration')
      .get();
      
    let newlyReadyCount = 0;
    const readyErrors: { tournamentId: string; error: string }[] = [];
    for (const doc of openTournamentsSnapshot.docs) {
        const tournament = doc.data() as Tournament;
        if (toDate(tournament.registrationEndDate) < now) {
            try {
                await doc.ref.update({ status: 'ready_to_start' });
                newlyReadyCount++;
            } catch (error: any) {
                readyErrors.push({ tournamentId: doc.id, error: error.message });
            }
        }
    }

    // --- Step 2: Start tournaments that are 'ready' and whose start date has passed ---
    const readyTournamentsSnapshot = await adminDb.collection('tournaments')
      .where('status', '==', 'ready_to_start')
      .get();

    let startedCount = 0;
    const startErrors: { tournamentId: string; error: string }[] = [];
    for (const doc of readyTournamentsSnapshot.docs) {
        const tournament = { id: doc.id, ...doc.data() } as Tournament;
        if (toDate(tournament.tournamentStartDate) <= now) {
            try {
                console.log(`Tournament ${tournament.id} is due. Attempting to start...`);
                await startTournamentAndGenerateFixtures(tournament.id, tournament.organizerId);
                startedCount++;
            } catch (error: any) {
                console.error(`Failed to automatically start tournament ${doc.id}:`, error.message);
                startErrors.push({ tournamentId: doc.id, error: error.message });
            }
        }
    }

    return { 
        message: `Tournament start job finished.`,
        transitionedToReady: newlyReadyCount,
        started: startedCount,
        errors: { readyErrors, startErrors },
    };
}


export async function runTriggerPayoutsJob() {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const tournamentsToProcessSnapshot = await adminDb.collection('tournaments')
      .where('status', '==', 'completed')
      .where('payoutInitiated', '==', false)
      .get();
      
    if (tournamentsToProcessSnapshot.empty) {
      return { message: 'No tournaments due for payout.' };
    }

    let processedCount = 0;
    const errors: string[] = [];

    for (const doc of tournamentsToProcessSnapshot.docs) {
      const tournament = doc.data();
      if (tournament.endedAt && toDate(tournament.endedAt) <= twentyFourHoursAgo) {
        try {
          await initiatePayouts(doc.id);
          processedCount++;
        } catch (error: any) {
          console.error(`Failed to initiate payout for tournament ${doc.id}:`, error);
          errors.push(`Tournament ${doc.id}: ${error.message}`);
          await adminDb.collection('tournaments').doc(doc.id).update({
              payoutInitiated: true, 
              payoutLog: [{ status: 'failed', errorMessage: 'Cron job failed to start payout.' }]
          });
        }
      }
    }

    if (processedCount === 0 && errors.length === 0) {
      return { message: 'No tournaments older than 24 hours found for payout.' };
    }

    return { 
        message: `Payout processing job finished.`,
        processed: processedCount,
        failed: errors.length,
        errors: errors,
    };
}


export async function runCloneTournamentsJob() {
    const now = new Date();
    const recurringTournamentsSnapshot = await adminDb.collection('tournaments')
      .where('recurring.enabled', '==', true)
      .where('status', '==', 'completed')
      .get();
      
    if (recurringTournamentsSnapshot.empty) {
      return { message: 'No recurring tournaments are due for cloning.' };
    }

    let clonedCount = 0;
    const errors: string[] = [];
    const batch = adminDb.batch();

    for (const doc of recurringTournamentsSnapshot.docs) {
      const originalTournament = doc.data() as Tournament;
      
      if (!originalTournament.endedAt || !originalTournament.recurring) {
        continue;
      }

      const endDate = toDate(originalTournament.endedAt);
      const cloneDate = addDays(endDate, originalTournament.recurring.daysAfterEnd);
      
      if (startOfDay(now) >= startOfDay(cloneDate)) {
        if (originalTournament.recurring.lastCloneDate && toDate(originalTournament.recurring.lastCloneDate) >= startOfDay(now)) {
            continue;
        }

        try {
            const originalStartDate = toDate(originalTournament.tournamentStartDate);
            const originalEndDate = toDate(originalTournament.tournamentEndDate);
            const duration = Math.max(1, Math.ceil((originalEndDate.getTime() - originalStartDate.getTime()) / (1000 * 60 * 60 * 24)));

            const newStartDate = addDays(now, 7);
            const newEndDate = addDays(newStartDate, duration);
            const newRegEndDate = addDays(newStartDate, -1);

            const newTournamentData: Omit<Tournament, 'id' | 'code'> = {
                ...originalTournament,
                name: `${originalTournament.name} (New Season)`,
                createdAt: FieldValue.serverTimestamp(),
                endedAt: undefined,
                status: 'open_for_registration',
                teamCount: 0,
                registrationStartDate: Timestamp.fromDate(now),
                registrationEndDate: Timestamp.fromDate(newRegEndDate),
                tournamentStartDate: Timestamp.fromDate(newStartDate),
                tournamentEndDate: Timestamp.fromDate(newEndDate),
                lastAutoResolvedAt: undefined,
                payoutInitiated: false,
                payoutCompletedAt: undefined,
                payoutLog: [],
                recurring: {
                    ...originalTournament.recurring,
                    lastCloneDate: undefined
                },
                rewardDetails: {
                    ...originalTournament.rewardDetails,
                    isPaidOut: false,
                    paidAt: undefined,
                    paymentStatus: originalTournament.rewardDetails.type === 'money' ? 'pending' : 'not-applicable',
                    paymentReference: undefined,
                }
            };

            const newTournamentRef = adminDb.collection('tournaments').doc();
            batch.set(newTournamentRef, newTournamentData);
            
            batch.update(doc.ref, { 'recurring.lastCloneDate': FieldValue.serverTimestamp() });

            clonedCount++;
        } catch (error: any) {
          console.error(`Failed to clone tournament ${doc.id}:`, error);
          errors.push(`Tournament ${doc.id}: ${error.message}`);
        }
      }
    }

    if (clonedCount > 0) {
      await batch.commit();
    }

    return { 
        message: `Recurring tournament job finished.`,
        cloned: clonedCount,
        errors,
    };
}
