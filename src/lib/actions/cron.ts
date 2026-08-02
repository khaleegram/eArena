'use server';

import { adminDb } from '@/lib/firebase-admin';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { startTournamentAndGenerateFixtures } from './tournament';
import { initiatePayouts } from './payouts';
import { toDate } from '@/lib/utils';
import type { Tournament, TournamentStatus, UnifiedTimestamp } from '@/lib/types';
import { addDays, endOfDay, startOfDay } from 'date-fns';
import { revalidatePath } from 'next/cache';

/** Robust date parse for Firestore Timestamp / ISO / seconds maps. */
function parseDate(timestamp: UnifiedTimestamp | { seconds?: number; _seconds?: number } | null | undefined): Date | null {
  if (!timestamp) return null;
  try {
    if (timestamp instanceof Date && !Number.isNaN(timestamp.getTime())) return timestamp;
    if (typeof timestamp === 'string' || typeof timestamp === 'number') {
      const d = new Date(timestamp);
      return Number.isNaN(d.getTime()) ? null : d;
    }
    if (typeof (timestamp as { toDate?: () => Date }).toDate === 'function') {
      const d = (timestamp as { toDate: () => Date }).toDate();
      return Number.isNaN(d.getTime()) ? null : d;
    }
    const seconds =
      typeof (timestamp as { seconds?: number }).seconds === 'number'
        ? (timestamp as { seconds: number }).seconds
        : typeof (timestamp as { _seconds?: number })._seconds === 'number'
          ? (timestamp as { _seconds: number })._seconds
          : null;
    if (seconds != null) {
      const d = new Date(seconds * 1000);
      return Number.isNaN(d.getTime()) ? null : d;
    }
  } catch {
    return null;
  }
  return null;
}

async function closeTournament(
  tournamentId: string,
  reason: 'expired_never_started' | 'insufficient_teams' | 'end_date_passed'
) {
  await adminDb.collection('tournaments').doc(tournamentId).update({
    status: 'completed',
    endedAt: FieldValue.serverTimestamp(),
    closeReason: reason,
  });
  revalidatePath(`/tournaments/${tournamentId}`);
  revalidatePath('/tournaments');
  revalidatePath('/dashboard');
}

/**
 * Hourly lifecycle:
 * 1) After registration ends → generate fixtures (or close if &lt; 4 teams)
 * 2) At/after start date → move ready → in_progress (generate fixtures if missing)
 * 3) Past tournament end date while still open/ready/in_progress → force complete
 */
export async function runStartTournamentsJob() {
  const now = new Date();

  let newlyReadyCount = 0;
  let startedCount = 0;
  let closedCount = 0;
  const readyErrors: { tournamentId: string; error: string }[] = [];
  const startErrors: { tournamentId: string; error: string }[] = [];
  const closed: { tournamentId: string; reason: string }[] = [];

  const activeStatuses: TournamentStatus[] = [
    'open_for_registration',
    'ready_to_start',
    'generating_fixtures',
    'in_progress',
  ];

  const snapshot = await adminDb
    .collection('tournaments')
    .where('status', 'in', activeStatuses)
    .get();

  for (const doc of snapshot.docs) {
    const tournament = { id: doc.id, ...doc.data() } as Tournament;
    const regEndRaw = parseDate(tournament.registrationEndDate);
    const startRaw = parseDate(tournament.tournamentStartDate);
    const endRaw = parseDate(tournament.tournamentEndDate);

    // Fallbacks: prefer real dates; never treat "now" as end date
    const regEnd = regEndRaw ? endOfDay(regEndRaw) : null;
    const startDate = startRaw;
    const endDate = endRaw ? endOfDay(endRaw) : null;

    // --- Force-close anything past its tournament end date ---
    if (endDate && endDate < now) {
      try {
        if (tournament.status === 'in_progress') {
          await closeTournament(doc.id, 'end_date_passed');
        } else {
          await closeTournament(doc.id, 'expired_never_started');
        }
        closedCount++;
        closed.push({
          tournamentId: doc.id,
          reason: tournament.status === 'in_progress' ? 'end_date_passed' : 'expired_never_started',
        });
      } catch (error: any) {
        startErrors.push({ tournamentId: doc.id, error: error.message });
      }
      continue;
    }

    // --- Stuck generating_fixtures: reset and retry this hour ---
    if (tournament.status === 'generating_fixtures') {
      try {
        await doc.ref.update({ status: 'open_for_registration' });
        tournament.status = 'open_for_registration';
      } catch (error: any) {
        startErrors.push({ tournamentId: doc.id, error: error.message });
        continue;
      }
    }

    // --- open_for_registration ---
    if (tournament.status === 'open_for_registration') {
      // Still accepting registrations
      if (!regEnd || regEnd >= now) {
        continue;
      }

      // Registration closed — count approved teams
      const teamsSnap = await doc.ref.collection('teams').where('isApproved', '==', true).get();
      const approvedCount = teamsSnap.size;

      if (approvedCount < 4) {
        // Can't run — close once start date has passed, or immediately if end already near
        if (!startDate || startDate <= now) {
          try {
            await closeTournament(doc.id, 'insufficient_teams');
            closedCount++;
            closed.push({ tournamentId: doc.id, reason: 'insufficient_teams' });
          } catch (error: any) {
            readyErrors.push({ tournamentId: doc.id, error: error.message });
          }
        }
        continue;
      }

      try {
        const result = await startTournamentAndGenerateFixtures(doc.id, tournament.organizerId, true);
        if (result && 'status' in result) {
          if (result.status === 'ready_to_start') newlyReadyCount++;
          if (result.status === 'in_progress') startedCount++;
        } else if (result && 'skipped' in result && result.reason === 'insufficient_teams') {
          if (!startDate || startDate <= now) {
            await closeTournament(doc.id, 'insufficient_teams');
            closedCount++;
            closed.push({ tournamentId: doc.id, reason: 'insufficient_teams' });
          }
        }
      } catch (error: any) {
        console.error(`Failed to auto-start open tournament ${doc.id}:`, error.message);
        startErrors.push({ tournamentId: doc.id, error: error.message });
      }
      continue;
    }

    // --- ready_to_start ---
    if (tournament.status === 'ready_to_start') {
      if (startDate && startDate > now) {
        continue; // wait for start date
      }

      try {
        const result = await startTournamentAndGenerateFixtures(doc.id, tournament.organizerId, true);
        if (result && 'status' in result && result.status === 'in_progress') {
          startedCount++;
        } else if (result && 'skipped' in result && result.reason === 'insufficient_teams') {
          await closeTournament(doc.id, 'insufficient_teams');
          closedCount++;
          closed.push({ tournamentId: doc.id, reason: 'insufficient_teams' });
        }
      } catch (error: any) {
        console.error(`Failed to go live for tournament ${doc.id}:`, error.message);
        startErrors.push({ tournamentId: doc.id, error: error.message });
      }
    }
  }

  return {
    message: 'Tournament lifecycle job finished.',
    transitionedToReady: newlyReadyCount,
    started: startedCount,
    closed: closedCount,
    closedDetails: closed,
    errors: { readyErrors, startErrors },
  };
}

export async function runTriggerPayoutsJob() {
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const tournamentsToProcessSnapshot = await adminDb
    .collection('tournaments')
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
    const endedAt = parseDate(tournament.endedAt) ?? (tournament.endedAt ? toDate(tournament.endedAt) : null);
    if (endedAt && endedAt <= twentyFourHoursAgo) {
      try {
        await initiatePayouts(doc.id);
        processedCount++;
      } catch (error: any) {
        console.error(`Failed to initiate payout for tournament ${doc.id}:`, error);
        errors.push(`Tournament ${doc.id}: ${error.message}`);
        await adminDb.collection('tournaments').doc(doc.id).update({
          payoutInitiated: true,
          payoutLog: [{ status: 'failed', errorMessage: 'Cron job failed to start payout.' }],
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
  const recurringTournamentsSnapshot = await adminDb
    .collection('tournaments')
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

    const endDate = parseDate(originalTournament.endedAt) ?? toDate(originalTournament.endedAt);
    const cloneDate = addDays(endDate, originalTournament.recurring.daysAfterEnd);

    if (startOfDay(now) >= startOfDay(cloneDate)) {
      if (
        originalTournament.recurring.lastCloneDate &&
        (parseDate(originalTournament.recurring.lastCloneDate) ??
          toDate(originalTournament.recurring.lastCloneDate)) >= startOfDay(now)
      ) {
        continue;
      }

      try {
        const originalStartDate =
          parseDate(originalTournament.tournamentStartDate) ?? toDate(originalTournament.tournamentStartDate);
        const originalEndDate =
          parseDate(originalTournament.tournamentEndDate) ?? toDate(originalTournament.tournamentEndDate);
        const duration = Math.max(
          1,
          Math.ceil((originalEndDate.getTime() - originalStartDate.getTime()) / (1000 * 60 * 60 * 24))
        );

        const newStartDate = addDays(now, 7);
        const newEndDate = addDays(newStartDate, duration);
        const newRegEndDate = addDays(newStartDate, -1);

        const newTournamentData: Omit<Tournament, 'id' | 'code'> = {
          ...originalTournament,
          name: `${originalTournament.name} (New Season)`,
          createdAt: FieldValue.serverTimestamp() as any,
          endedAt: undefined,
          closeReason: undefined,
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
            lastCloneDate: undefined,
          },
          rewardDetails: {
            ...originalTournament.rewardDetails,
            isPaidOut: false,
            paidAt: undefined,
            paymentStatus: originalTournament.rewardDetails.type === 'money' ? 'pending' : 'not-applicable',
            paymentReference: undefined,
          },
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
