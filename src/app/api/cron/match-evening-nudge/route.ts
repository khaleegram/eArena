import { NextRequest, NextResponse } from 'next/server';
import { processMatchEveningNudges } from '@/lib/push-notify';

/** Daily 17:00 UTC — nudge captains who still have scheduled matches today. */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await processMatchEveningNudges();
    return NextResponse.json({
      message: result.nudged === 0 && result.failed === 0
        ? 'No unfinished matches to nudge.'
        : 'Evening match nudge finished.',
      ...result,
    });
  } catch (error) {
    console.error('Evening nudge cron error:', error);
    return NextResponse.json({ message: 'Internal Server Error' }, { status: 500 });
  }
}
