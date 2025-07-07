
import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { initiatePayouts } from '@/lib/actions';
import { toDate } from '@/lib/utils'; // Assuming you have a toDate utility

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  try {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const tournamentsToProcessSnapshot = await adminDb.collection('tournaments')
      .where('status', '==', 'completed')
      .where('payoutInitiated', '==', false)
      .get();
      
    if (tournamentsToProcessSnapshot.empty) {
      return NextResponse.json({ message: 'No tournaments due for payout.' });
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
              payoutInitiated: true, // Mark as initiated to prevent retries
              payoutLog: [{ status: 'failed', errorMessage: 'Cron job failed to start payout.' }]
          });
        }
      }
    }

    if (processedCount === 0 && errors.length === 0) {
      return NextResponse.json({ message: 'No tournaments older than 24 hours found for payout.' });
    }

    return NextResponse.json({ 
        message: `Payout processing job finished.`,
        processed: processedCount,
        failed: errors.length,
        errors: errors,
    });
  } catch (error) {
    console.error('Cron job error:', error);
    return NextResponse.json({ message: 'Internal Server Error' }, { status: 500 });
  }
}
