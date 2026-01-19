
'use server';

import { adminDb } from '@/lib/firebase-admin';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import type { Tournament, Player, Match, Team, PrizeAllocation, Standing, MatchReport, PlayerStats } from '@/lib/types';
import { revalidatePath } from 'next/cache';
import { serializeData, toDate } from '@/lib/utils';
import { getTournamentAwards } from './payouts';
import { customAlphabet } from 'nanoid';
import { getStorage } from 'firebase-admin/storage';
import { getUserProfileById } from './user';
import { sendNotification } from './notifications';
import { addDays, differenceInDays, format, isBefore, isAfter, isToday, isFuture, isPast, endOfDay } from 'date-fns';

import { generateRoundRobinFixtures } from '../round-robin';
import { createWorldCupGroups, generateGroupStageFixtures, computeAllGroupStandings, seedKnockoutFromGroups, isGroupRound } from '../group-stage';
import { generateSwissRoundFixtures, getMaxSwissRounds, isSwissRound, getSwissRoundNumber } from '../swiss';
import { getLatestRound, assertRoundCompleted, getWinnersForRound, getChampionIfFinalComplete, isKnockoutRound } from '../cup-progression';
import { generateCupRound, getRoundName } from '../cup-tournament';
import { verifyMatchScores } from '@/ai/flows/verify-match-scores';
import { sendEmail } from '../email';
import { getStandingsForTournament } from './standings';
import { getTeamsForTournament } from './team';
import { checkAndGrantAchievements } from './achievements';

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;

function scheduleFixtures(
    fixtures: Omit<Match, 'id' | 'tournamentId' | 'matchDay' | 'status'>[],
    startDate: Date,
    totalDays: number
): Omit<Match, 'id' | 'tournamentId' | 'status'>[] {
    const schedule: { [day: string]: { [timeSlot: string]: { [teamId: string]: boolean } } } = {};
    const timeSlots = [20, 21, 22, 23]; // 8 PM, 9 PM, 10 PM, 11 PM UTC
    const scheduledFixtures: Omit<Match, 'id' | 'tournamentId' | 'status'>[] = [];

    for (const fixture of fixtures) {
        let scheduled = false;
        // Loop over days with a buffer to find a slot
        for (let dayIndex = 0; dayIndex < totalDays * 2; dayIndex++) {
            const currentDay = addDays(startDate, dayIndex);
            const dayKey = format(currentDay, 'yyyy-MM-dd');
            if (!schedule[dayKey]) schedule[dayKey] = {};

            for (const hour of timeSlots) {
                const timeKey = `${hour}:00`;
                if (!schedule[dayKey]![timeKey]) schedule[dayKey]![timeKey] = {};

                const homeTeamBusy = schedule[dayKey]![timeKey]![fixture.homeTeamId];
                const awayTeamBusy = schedule[dayKey]![timeKey]![fixture.awayTeamId];

                if (!homeTeamBusy && !awayTeamBusy) {
                    const matchDay = new Date(currentDay);
                    // Use UTC hours to avoid timezone issues on the server
                    matchDay.setUTCHours(hour, 0, 0, 0);

                    (fixture as any).matchDay = Timestamp.fromDate(matchDay);
                    
                    // Mark teams as busy for this time slot
                    schedule[dayKey]![timeKey]![fixture.homeTeamId] = true;
                    schedule[dayKey]![timeKey]![fixture.awayTeamId] = true;
                    
                    scheduledFixtures.push(fixture as any);
                    scheduled = true;
                    break; 
                }
            }
            if (scheduled) break;
        }
        if (!scheduled) {
            // Fallback if a slot isn't found (should be rare), place it at the end.
            console.warn("Could not schedule a match without conflict, placing it on the last day.");
            const lastDay = addDays(startDate, totalDays -1);
            lastDay.setUTCHours(timeSlots[timeSlots.length - 1]!, 0, 0, 0);
            (fixture as any).matchDay = Timestamp.fromDate(lastDay);
            scheduledFixtures.push(fixture as any);
        }
    }
    return scheduledFixtures;
}

export async function createTournament(formData: FormData) {
  const organizerId = formData.get('organizerId') as string;
  if (!organizerId) {
    throw new Error('Organizer ID is missing.');
  }

  const organizerProfile = await getUserProfileById(organizerId);
  if (!organizerProfile) {
    throw new Error('Organizer profile not found.');
  }

  const rawData: { [key: string]: any } = {};
  formData.forEach((value, key) => {
    if (key.includes('.')) {
      const [mainKey, subKey] = key.split('.');
      if (!rawData[mainKey]) rawData[mainKey] = {};
      rawData[mainKey][subKey] = value;
    } else {
      rawData[key] = value;
    }
  });
  
  const flyerFile = formData.get('flyer') as File | null;
  let flyerUrl = '';
  if (flyerFile && flyerFile.size > 0) {
      const bucket = getStorage().bucket(process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET);
      const fileName = `tournaments/flyers/${Date.now()}_${flyerFile.name}`;
      const file = bucket.file(fileName);
      
      const buffer = Buffer.from(await flyerFile.arrayBuffer());
      const stream = file.createWriteStream({
          metadata: {
              contentType: flyerFile.type,
          },
      });

      await new Promise((resolve, reject) => {
          stream.on('error', reject);
          stream.on('finish', resolve);
          stream.end(buffer);
      });

      flyerUrl = await file.getSignedUrl({
          action: 'read',
          expires: '03-09-2491', // A very long time
      }).then(urls => urls[0]);
  }
  
  const nanoid = customAlphabet('1234567890ABCDEFGHJKLMNPQRSTUVWXYZ', 6);
  const tournamentCode = nanoid();

  const registrationStartDate = new Date(rawData.registrationDates.from);
  const registrationEndDate = new Date(rawData.registrationDates.to);
  const tournamentStartDate = new Date(rawData.tournamentDates.from);
  const tournamentEndDate = new Date(rawData.tournamentDates.to);

  const newTournamentData: Omit<Tournament, 'id'> = {
    name: rawData.name,
    description: rawData.description,
    flyerUrl,
    format: rawData.format,
    game: 'eFootball', // Hardcoded for now
    platform: 'Cross-Platform', // Hardcoded for now
    registrationStartDate: Timestamp.fromDate(registrationStartDate),
    registrationEndDate: Timestamp.fromDate(registrationEndDate),
    tournamentStartDate: Timestamp.fromDate(tournamentStartDate),
    tournamentEndDate: Timestamp.fromDate(tournamentEndDate),
    maxTeams: Number(rawData.maxTeams),
    rules: rawData.rules || '',
    organizerId,
    organizerUsername: organizerProfile.username,
    createdAt: FieldValue.serverTimestamp(),
    status: 'open_for_registration',
    teamCount: 0,
    code: tournamentCode,
    isPublic: rawData.isPublic === 'true',
    matchLength: Number(rawData.matchLength),
    substitutions: Number(rawData.substitutions),
    extraTime: rawData.extraTime === 'true',
    penalties: rawData.penalties === 'true',
    squadRestrictions: rawData.squadRestrictions || '',
    injuries: false, // Default value
    homeAndAway: rawData.homeAndAway === 'true',
    rewardType: rawData.rewardType,
    rewardDetails: {
      type: rawData.rewardType,
      prizePool: Number(rawData.prizePool) || 0,
      currency: 'NGN',
      isPaidOut: false,
      paymentStatus: rawData.rewardType === 'money' ? 'pending' : 'not-applicable',
    },
    recurring: {
        enabled: rawData.recurringEnabled === 'true',
        daysAfterEnd: Number(rawData.recurringDays) || 7,
    }
  };
  
  if (newTournamentData.rewardType === 'money' && newTournamentData.rewardDetails.prizePool > 0) {
      newTournamentData.status = 'pending';
  }

  const tournamentRef = adminDb.collection('tournaments').doc();
  await tournamentRef.set(newTournamentData);

  if (newTournamentData.status === 'pending') {
      if (!PAYSTACK_SECRET_KEY) {
          await tournamentRef.delete();
          throw new Error('Paystack secret key is not configured for paid tournaments.');
      }
      const response = await fetch('https://api.paystack.co/transaction/initialize', {
          method: 'POST',
          headers: {
              Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
              'Content-Type': 'application/json',
          },
          body: JSON.stringify({
              email: organizerProfile.email,
              amount: newTournamentData.rewardDetails.prizePool * 100, // in kobo
              reference: tournamentRef.id, // Use tournament ID as reference
              callback_url: `${process.env.NEXT_PUBLIC_BASE_URL}/api/paystack/verify`,
              metadata: {
                  tournamentId: tournamentRef.id,
                  organizerId: organizerId,
              }
          }),
      });

      const data = await response.json();
      if (!data.status) {
          await tournamentRef.delete(); // Rollback tournament creation
          throw new Error(`Paystack initialization failed: ${data.message}`);
      }
      return { tournamentId: tournamentRef.id, paymentUrl: data.data.authorization_url };
  } else if (organizerProfile.email) {
    // This is a free tournament, send email right away.
    await sendEmail({
        to: organizerProfile.email,
        subject: `Your Tournament "${newTournamentData.name}" is Live!`,
        body: `Hello ${organizerProfile.username},\n\nYour tournament, "${newTournamentData.name}", has been successfully created and is now open for registration.\n\nYou can view and manage your tournament here: ${process.env.NEXT_PUBLIC_BASE_URL}/tournaments/${tournamentRef.id}`
    });
  }
  
  // Notify followers
  if (organizerProfile.followers && organizerProfile.followers.length > 0) {
      const followers = organizerProfile.followers;
      for (const followerId of followers) {
          await sendNotification(followerId, {
              userId: followerId,
              title: "New Tournament!",
              body: `${organizerProfile.username} has just created a new tournament: ${newTournamentData.name}`,
              href: `/tournaments/${tournamentRef.id}`,
          });
      }
  }

  revalidatePath('/tournaments');
  revalidatePath('/dashboard');
  return { tournamentId: tournamentRef.id };
}

export async function verifyAndActivateTournament(reference: string) {
    const response = await fetch(`https://api.paystack.co/transaction/verify/${reference}`, {
        headers: {
            Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
        },
    });
    const data = await response.json();

    if (data.status && data.data.status === 'success') {
        const tournamentId = data.data.metadata.tournamentId;
        const tournamentRef = adminDb.collection('tournaments').doc(tournamentId);
        await tournamentRef.update({ 
            status: 'open_for_registration',
            'rewardDetails.paymentStatus': 'paid',
            'rewardDetails.paymentReference': reference
        });
        revalidatePath(`/tournaments/${tournamentId}`);
        
        // Send email on successful activation
        const tournamentDoc = await tournamentRef.get();
        if (tournamentDoc.exists()) {
            const tournament = tournamentDoc.data() as Tournament;
            const organizerProfile = await getUserProfileById(tournament.organizerId);
            if (organizerProfile?.email) {
                await sendEmail({
                    to: organizerProfile.email,
                    subject: `Your Tournament "${tournament.name}" is Live!`,
                    body:  `Hello ${organizerProfile.username},\n\nYour payment has been confirmed and your tournament, "${tournament.name}", is now live and open for registration.\n\nYou can view and manage your tournament here: ${process.env.NEXT_PUBLIC_BASE_URL}/tournaments/${tournamentId}`
                });
            }
        }

        return { tournamentId };
    } else {
        throw new Error('Payment verification failed.');
    }
}
// ... (rest of the file remains the same)
      

export async function getPublicTournaments(): Promise<Tournament[]> {
    const tournamentsRef = adminDb.collection('tournaments');
    const snapshot = await tournamentsRef
        .where('isPublic', '==', true)
        .orderBy('createdAt', 'desc')
        .get();
        
    const tournaments = snapshot.docs.map(doc => serializeData({ id: doc.id, ...doc.data() }) as Tournament);
    // Filter out pending tournaments server-side after fetching
    return tournaments.filter(t => t.status !== 'pending');
}
