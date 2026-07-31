import { NextRequest, NextResponse } from 'next/server';
import { processOpenTournamentsDigest } from '@/lib/push-notify';

/** Saturday 10:00 UTC — soft re-engagement for idle users. */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await processOpenTournamentsDigest();
    return NextResponse.json({
      message: 'Open tournaments digest finished.',
      ...result,
    });
  } catch (error) {
    console.error('Open tournaments digest cron error:', error);
    return NextResponse.json({ message: 'Internal Server Error' }, { status: 500 });
  }
}
