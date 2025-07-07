
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { adminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import type { Transaction } from '@/lib/types';

export const dynamic = 'force-dynamic';

async function handler(request: NextRequest) {
  const paystackSecret = process.env.PAYSTACK_SECRET_KEY;
  if (!paystackSecret) {
    return NextResponse.json({ message: 'Paystack secret key not configured' }, { status: 500 });
  }

  const signature = request.headers.get('x-paystack-signature');
  const body = await request.text();

  const hash = crypto
    .createHmac('sha512', paystackSecret)
    .update(body)
    .digest('hex');

  if (hash !== signature) {
    return NextResponse.json({ message: 'Invalid signature' }, { status: 401 });
  }

  const event = JSON.parse(body);

  if (event.event === 'transfer.success' || event.event === 'transfer.failed' || event.event === 'transfer.reversed') {
    const { reference, status, reason } = event.data;

    const transactionRef = adminDb.collection('transactions').doc(reference);
    const transactionDoc = await transactionRef.get();

    if (!transactionDoc.exists) {
      console.warn(`Webhook received for non-existent transaction reference: ${reference}`);
      return NextResponse.json({ message: 'Transaction not found' });
    }
    
    const transaction = transactionDoc.data() as Transaction;
    const tournamentRef = adminDb.collection('tournaments').doc(transaction.tournamentId);

    const updateData: Partial<Transaction> = {
      status: status,
      updatedAt: FieldValue.serverTimestamp(),
    };
    if (status === 'failed' || status === 'reversed') {
        updateData.errorMessage = reason || 'Payout failed or was reversed by Paystack.';
    }

    await transactionRef.update(updateData);
    
    // Update the log in the tournament document
    const tournamentDoc = await tournamentRef.get();
    if(tournamentDoc.exists) {
        const tournamentData = tournamentDoc.data();
        const payoutLog = tournamentData?.payoutLog || [];
        const logIndex = payoutLog.findIndex((log: any) => log.transactionId === reference);
        
        if (logIndex > -1) {
            payoutLog[logIndex].status = status;
            if(updateData.errorMessage) {
                 payoutLog[logIndex].errorMessage = updateData.errorMessage;
            }
            await tournamentRef.update({ payoutLog });
        }
    }
  }

  return NextResponse.json({ message: 'Webhook received' });
}

export { handler as POST };
