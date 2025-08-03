import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { toDate } from '@/lib/utils';
import type { Tournament } from '@/lib/types';
import { addDays, startOfDay } from 'date-fns';

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  try {
    const now = new Date();
    const recurringTournamentsSnapshot = await adminDb.collection('tournaments')
      .where('recurring.enabled', '==', true)
      .where('status', '==', 'completed')
      .get();
      
    if (recurringTournamentsSnapshot.empty) {
      return NextResponse.json({ message: 'No recurring tournaments are due for cloning.' });
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
      
      // Check if it's time to clone this tournament
      if (startOfDay(now) >= startOfDay(cloneDate)) {
        // Prevent re-cloning if it has already been done
        if (originalTournament.recurring.lastCloneDate && toDate(originalTournament.recurring.lastCloneDate) >= startOfDay(now)) {
            continue;
        }

        try {
            const originalStartDate = toDate(originalTournament.tournamentStartDate);
            const originalEndDate = toDate(originalTournament.tournamentEndDate);
            const duration = Math.max(1, Math.ceil((originalEndDate.getTime() - originalStartDate.getTime()) / (1000 * 60 * 60 * 24)));

            const newStartDate = addDays(now, 7); // New season starts in 1 week
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

            const newTournamentRef = adminDb.collection('tournaments').doc(); // Create a new doc with a new ID
            batch.set(newTournamentRef, newTournamentData);
            
            // Mark the original tournament as cloned to prevent re-cloning
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

    return NextResponse.json({ 
        message: `Recurring tournament job finished.`,
        cloned: clonedCount,
        errors,
    });
  } catch (error) {
    console.error('Cron job error:', error);
    return NextResponse.json({ message: 'Internal Server Error' }, { status: 500 });
  }
}
