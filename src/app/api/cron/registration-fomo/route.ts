import { NextRequest, NextResponse } from 'next/server';
import { processRegistrationFomo } from '@/lib/push-notify';

/** Hourly — almost-full and closing-tomorrow FOMO. */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await processRegistrationFomo();
    return NextResponse.json({
      message: 'Registration FOMO job finished.',
      ...result,
    });
  } catch (error) {
    console.error('Registration FOMO cron error:', error);
    return NextResponse.json({ message: 'Internal Server Error' }, { status: 500 });
  }
}
