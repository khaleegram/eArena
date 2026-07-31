import { NextRequest, NextResponse } from 'next/server';
import { processMatchDayReminders } from '@/lib/push-notify';

/**
 * Daily cron: notify captains whose scheduled matches are today.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await processMatchDayReminders();
    return NextResponse.json({
      message: result.reminded === 0 && result.failed === 0
        ? 'No scheduled matches today.'
        : 'Match reminder job finished.',
      ...result,
    });
  } catch (error) {
    console.error('Match reminders cron error:', error);
    return NextResponse.json({ message: 'Internal Server Error' }, { status: 500 });
  }
}
