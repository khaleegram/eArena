
import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { startTournamentAndGenerateFixtures } from '@/lib/actions';
import { toDate } from '@/lib/utils';
import type { Tournament } from '@/lib/types';

// This is the entry point for the cron job.
// It finds tournaments whose registration has ended and starts them.
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  try {
    const now = new Date();
    // Find all tournaments that are still open for registration.
    const tournamentsToProcessSnapshot = await adminDb.collection('tournaments')
      .where('status', '==', 'open_for_registration')
      .get();
      
    if (tournamentsToProcessSnapshot.empty) {
      return NextResponse.json({ message: 'No tournaments are currently open for registration.' });
    }

    let processedCount = 0;
    const errors: { tournamentId: string; error: string }[] = [];

    // Iterate through each open tournament to see if its registration has ended.
    for (const doc of tournamentsToProcessSnapshot.docs) {
      const tournament = { id: doc.id, ...doc.data() } as Tournament;
      
      // Check if the registration end date is in the past.
      if (toDate(tournament.registrationEndDate) < now) {
        try {
          console.log(`Registration ended for tournament ${tournament.id}. Attempting to start...`);
          // The startTournamentAndGenerateFixtures action already contains all the necessary logic
          // to validate the team count, generate fixtures, and update the status.
          await startTournamentAndGenerateFixtures(tournament.id, tournament.organizerId);
          processedCount++;
        } catch (error: any) {
          console.error(`Failed to automatically start tournament ${doc.id}:`, error.message);
          errors.push({ tournamentId: doc.id, error: error.message });
          // Optionally, update the tournament status to something like 'failed_to_start'
          // For now, we'll just log the error and let it be retried on the next run.
        }
      }
    }

    if (processedCount === 0 && errors.length === 0) {
      return NextResponse.json({ message: 'No tournaments were due to be started.' });
    }

    return NextResponse.json({ 
        message: `Tournament start job finished.`,
        processed: processedCount,
        failed: errors.length,
        errors: errors,
    });
  } catch (error) {
    console.error('Cron job error:', error);
    return NextResponse.json({ message: 'Internal Server Error' }, { status: 500 });
  }
}
