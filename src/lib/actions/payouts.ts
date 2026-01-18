
'use server';

import { adminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import type { Tournament, PrizeDistributionItem, TournamentAward, UserProfile, Transaction, Standing } from '@/lib/types';
import { getStandingsForTournament } from './standings';
import { getTeamsForTournament } from './team';
import { sendNotification } from './notifications';
import { serializeData } from '@/lib/utils';
import { getUserProfileById } from './user';

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;

async function createPaystackRecipient(userProfile: UserProfile): Promise<string> {
    if (!userProfile.bankDetails?.accountNumber || !userProfile.bankDetails?.bankCode) {
        throw new Error(`User ${userProfile.username} is missing bank details.`);
    }

    const response = await fetch('https://api.paystack.co/transferrecipient', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            type: 'nuban',
            name: userProfile.username,
            account_number: userProfile.bankDetails.accountNumber,
            bank_code: userProfile.bankDetails.bankCode,
            currency: 'NGN',
        }),
    });
    const data = await response.json();
    if (!data.status || !data.data.recipient_code) {
        throw new Error(`Paystack recipient creation failed: ${data.message}`);
    }
    return data.data.recipient_code;
}

export async function retryPayout(transactionId: string) {
    if (!PAYSTACK_SECRET_KEY) throw new Error('Paystack secret key not configured.');
    const transactionRef = adminDb.collection('transactions').doc(transactionId);
    const transactionDoc = await transactionRef.get();
    if (!transactionDoc.exists) throw new Error('Transaction not found.');
    const transaction = transactionDoc.data() as Transaction;
    if (transaction.status === 'success' || transaction.status === 'pending') {
        throw new Error('Cannot retry a successful or pending transaction.');
    }
    if (!transaction.paystackTransferCode) {
         throw new Error('This transaction cannot be retried automatically.');
    }
     const response = await fetch('https://api.paystack.co/transfer/resend_otp', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            transfer_code: transaction.paystackTransferCode,
            reason: "retry"
        }),
    });
    const data = await response.json();
    if (!data.status) {
        throw new Error(`Paystack retry failed: ${data.message}`);
    }
     // Note: we don't update the status here. The webhook will handle the final status update.
    return { message: 'Retry initiated. Awaiting webhook confirmation.' };
}

export async function getPrizeDistribution(tournamentId: string): Promise<PrizeDistributionItem[]> {
    const tournamentRef = adminDb.collection('tournaments').doc(tournamentId);
    const tournamentDoc = await tournamentRef.get();
    const tournament = tournamentDoc.data() as Tournament;

    if (!tournament || tournament.rewardDetails.type !== 'money' || !tournament.rewardDetails.prizeAllocation) {
        return [];
    }

    const { prizePool, prizeAllocation } = tournament.rewardDetails;
    const awards = tournament.status === 'completed' ? await getTournamentAwards(tournamentId) : {};

    const distribution: PrizeDistributionItem[] = [
        { category: '1st Place', percentage: prizeAllocation.first_place, amount: 0, winner: awards.firstPlace },
        { category: '2nd Place', percentage: prizeAllocation.second_place, amount: 0, winner: awards.secondPlace },
        { category: '3rd Place', percentage: prizeAllocation.third_place, amount: 0, winner: awards.thirdPlace },
        { category: 'Best Overall Team', percentage: prizeAllocation.best_overall, amount: 0, winner: awards.bestOverall },
        { category: 'Highest Scoring Team', percentage: prizeAllocation.highest_scoring, amount: 0, winner: awards.highestScoring },
        { category: 'Best Defensive Team', percentage: prizeAllocation.best_defensive, amount: 0, winner: awards.bestDefensive },
        { category: 'Best Attacking Team', percentage: prizeAllocation.best_attacking, amount: 0, winner: awards.bestAttacking },
    ];
    
    distribution.forEach(item => {
        item.amount = (prizePool * item.percentage) / 100;
    });

    return serializeData(distribution);
}


export async function getTournamentAwards(tournamentId: string): Promise<Record<string, TournamentAward>> {
    const standings = await getStandingsForTournament(tournamentId);
    const teams = await getTeamsForTournament(tournamentId);

    if (standings.length === 0) return {};

    const getAward = (standing: Standing | undefined): TournamentAward | undefined => {
        if (!standing || !standing.teamId) return undefined;
        const team = teams.find(t => t.id === standing.teamId);
        if (!team) return undefined;
        return {
            awardTitle: '', // This will be set by the caller
            team: team,
            reason: '' // This will be set by the caller
        };
    };

    const firstPlace = getAward(standings.find(s => s.ranking === 1));
    const secondPlace = getAward(standings.find(s => s.ranking === 2));
    const thirdPlace = getAward(standings.find(s => s.ranking === 3));

    const bestOverallStanding = standings.reduce((prev, curr) => (prev.points > curr.points) ? prev : curr, standings[0] || {} as Standing);
    const highestScoringStanding = standings.reduce((prev, curr) => (prev.goalsFor > curr.goalsFor) ? prev : curr, standings[0] || {} as Standing);
    const bestDefensiveStanding = standings.reduce((prev, curr) => (prev.cleanSheets > curr.cleanSheets) ? prev : curr, standings[0] || {} as Standing);
    
    const getBestAttackingStanding = () => {
        let bestAttackingTeamStanding = standings[0];
        if (!bestAttackingTeamStanding) return null;
        let maxGoalsPerMatch = 0;
        for (const s of standings) {
            const gpm = s.matchesPlayed > 0 ? s.goalsFor / s.matchesPlayed : 0;
            if (gpm > maxGoalsPerMatch) {
                maxGoalsPerMatch = gpm;
                bestAttackingTeamStanding = s;
            }
        }
        return bestAttackingTeamStanding;
    }
    const bestAttackingStanding = getBestAttackingStanding();
    
    const awards: Record<string, TournamentAward> = {};
    if (firstPlace) awards.firstPlace = { ...firstPlace, awardTitle: '1st Place', reason: 'Top of the league' };
    if (secondPlace) awards.secondPlace = { ...secondPlace, awardTitle: '2nd Place', reason: 'Valiant runner-up' };
    if (thirdPlace) awards.thirdPlace = { ...thirdPlace, awardTitle: '3rd Place', reason: 'On the podium' };

    const bestOverallAward = getAward(bestOverallStanding);
    if (bestOverallAward) {
        awards.bestOverall = { ...bestOverallAward, awardTitle: 'Best Overall', reason: `${bestOverallStanding.points} points` };
    }

    const highestScoringAward = getAward(highestScoringStanding);
    if (highestScoringAward) {
        awards.highestScoring = { ...highestScoringAward, awardTitle: 'Highest Scoring', reason: `${highestScoringStanding.goalsFor} goals scored` };
    }

    const bestDefensiveAward = getAward(bestDefensiveStanding);
    if (bestDefensiveAward) {
        awards.bestDefensive = { ...bestDefensiveAward, awardTitle: 'Best Defense', reason: `${bestDefensiveStanding.cleanSheets} clean sheets` };
    }
    
    const bestAttackingAward = getAward(bestAttackingStanding);
    if (bestAttackingAward) {
        awards.bestAttacking = { ...bestAttackingAward, awardTitle: 'Best Attacking', reason: 'Highest goals per match' };
    }

    return serializeData(awards);
}

export async function initiatePayouts(tournamentId: string) {
    if (!PAYSTACK_SECRET_KEY) throw new Error('Paystack secret key not configured.');

    const tournamentRef = adminDb.collection('tournaments').doc(tournamentId);
    const tournamentDoc = await tournamentRef.get();
    if (!tournamentDoc.exists) throw new Error('Tournament not found.');
    const tournament = tournamentDoc.data() as Tournament;
    
    if (tournament.status !== 'completed') throw new Error('Tournament is not completed.');
    if (tournament.rewardDetails.type !== 'money') throw new Error('This is not a cash prize tournament.');

    await tournamentRef.update({ payoutInitiated: true });

    const distribution = await getPrizeDistribution(tournamentId);
    const payoutLog: any[] = tournament.payoutLog || [];
    const processedUids = new Set(payoutLog.map(p => p.uid));
    
    for (const item of distribution) {
        if (!item.winner?.captainId || item.amount <= 0 || processedUids.has(item.winner.captainId)) {
            continue;
        }

        const userProfile = await getUserProfileById(item.winner.captainId);
        if (!userProfile?.bankDetails?.confirmedForPayout) {
            console.warn(`Payout for ${userProfile?.username} skipped: bank details not confirmed.`);
            payoutLog.push({ status: 'skipped', reason: 'Bank details not confirmed' });
            continue;
        }
        
        try {
            let recipientCode = userProfile.bankDetails.recipientCode;
            if (!recipientCode) {
                recipientCode = await createPaystackRecipient(userProfile);
                await adminDb.collection('users').doc(userProfile.uid).update({ 'bankDetails.recipientCode': recipientCode });
            }
            
            const transactionRef = adminDb.collection('transactions').doc();
            const transactionData: Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'> = {
                uid: userProfile.uid,
                tournamentId,
                category: item.category,
                amount: item.amount,
                status: 'pending',
                recipientName: userProfile.username || '',
                recipientBank: userProfile.bankDetails.bankName,
                recipientAccountNumber: userProfile.bankDetails.accountNumber.slice(-4),
            };

            const response = await fetch('https://api.paystack.co/transfer', {
                method: 'POST',
                headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    source: 'balance',
                    amount: item.amount * 100, // in kobo
                    recipient: recipientCode,
                    reason: `${tournament.name} - ${item.category}`,
                    reference: transactionRef.id,
                }),
            });
            const data = await response.json();
            
            if (!data.status || data.data.status === 'failed') {
                throw new Error(data.message);
            }
            
            await transactionRef.set({ ...transactionData, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(), paystackTransferCode: data.data.transfer_code });
            payoutLog.push({ uid: userProfile.uid, status: 'pending', transactionId: transactionRef.id });

        } catch (error: any) {
            console.error(`Error processing payout for ${userProfile.username}:`, error.message);
            payoutLog.push({ uid: userProfile.uid, status: 'failed', errorMessage: error.message });
        }
    }

    await tournamentRef.update({ payoutLog });
    revalidatePath(`/admin/tournaments`);
    return { message: "Payout process has been initiated." };
}
