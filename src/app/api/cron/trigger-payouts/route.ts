import { NextRequest, NextResponse } from 'next/server';
import { runTriggerPayoutsJob } from '@/lib/actions/cron';

/** Every 6 hours — initiate payouts for completed tournaments. */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await runTriggerPayoutsJob();
    return NextResponse.json(result);
  } catch (error) {
    console.error('Trigger payouts cron error:', error);
    return NextResponse.json({ message: 'Internal Server Error' }, { status: 500 });
  }
}
