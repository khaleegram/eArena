import { NextRequest, NextResponse } from 'next/server';
import { runCloneTournamentsJob } from '@/lib/actions/cron';

/** Daily — clone completed recurring tournaments when due. */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await runCloneTournamentsJob();
    return NextResponse.json(result);
  } catch (error) {
    console.error('Clone tournaments cron error:', error);
    return NextResponse.json({ message: 'Internal Server Error' }, { status: 500 });
  }
}
