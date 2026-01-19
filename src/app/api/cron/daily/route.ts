
import { NextRequest, NextResponse } from 'next/server';
import { 
    runStartTournamentsJob, 
    runTriggerPayoutsJob,
    runCloneTournamentsJob
} from '@/lib/actions/cron';

export async function POST(request: NextRequest) {
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    try {
        console.log("Executing all daily cron jobs...");
        const [startResult, payoutResult, cloneResult] = await Promise.all([
            runStartTournamentsJob().catch(e => ({ error: e.message })),
            runTriggerPayoutsJob().catch(e => ({ error: e.message })),
            runCloneTournamentsJob().catch(e => ({ error: e.message })),
        ]);
        console.log("Daily cron jobs finished.");

        return NextResponse.json({ 
            message: "All daily cron jobs executed.",
            results: {
                startTournaments: startResult,
                payouts: payoutResult,
                cloning: cloneResult,
            }
        });
    } catch (error: any) {
        console.error('Master cron job runner error:', error);
        return NextResponse.json({ message: 'Internal Server Error', error: error.message }, { status: 500 });
    }
}
