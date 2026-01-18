
import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { updateStandings } from '@/lib/actions/standings';

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  try {
    const snapshot = await adminDb.collection('tournaments')
      .where('needsStandingsUpdate', '==', true)
      .get();
      
    if (snapshot.empty) {
      return NextResponse.json({ message: 'No tournaments need standings updates.' });
    }

    const updates = snapshot.docs.map(async (doc) => {
      const tournamentId = doc.id;
      try {
        await updateStandings(tournamentId);
        await doc.ref.update({ needsStandingsUpdate: false });
        return { id: tournamentId, status: 'success' };
      } catch (error: any) {
        console.error(`Failed to update standings for ${tournamentId}:`, error);
        // Optionally clear the flag even on error to prevent constant retries
        // await doc.ref.update({ needsStandingsUpdate: false }); 
        return { id: tournamentId, status: 'error', reason: error.message };
      }
    });

    const results = await Promise.all(updates);

    return NextResponse.json({ 
        message: `Standings update job finished.`,
        results,
    });
  } catch (error) {
    console.error('Cron job error:', error);
    return NextResponse.json({ message: 'Internal Server Error' }, { status: 500 });
  }
}
