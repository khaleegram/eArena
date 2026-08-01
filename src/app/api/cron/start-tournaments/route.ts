import { NextRequest, NextResponse } from 'next/server';
import { runStartTournamentsJob } from '@/lib/actions/cron';

/** Hourly — move open→ready and auto-start due tournaments. */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await runStartTournamentsJob();
    return NextResponse.json(result);
  } catch (error) {
    console.error('Start tournaments cron error:', error);
    return NextResponse.json({ message: 'Internal Server Error' }, { status: 500 });
  }
}
