
import { NextRequest, NextResponse } from 'next/server';
import { verifyAndActivateTournament } from '@/lib/actions/tournament';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const reference = searchParams.get('reference');
  
  if (!reference) {
    return NextResponse.redirect(new URL('/tournaments?payment=failed', request.url));
  }

  try {
    const { tournamentId } = await verifyAndActivateTournament(reference);
    if(tournamentId) {
        return NextResponse.redirect(new URL(`/tournaments/${tournamentId}?payment=success`, request.url));
    } else {
        throw new Error("Tournament ID not found after verification.");
    }
  } catch (error) {
    console.error('Paystack verification error:', error);
    return NextResponse.redirect(new URL('/tournaments?payment=failed', request.url));
  }
}
