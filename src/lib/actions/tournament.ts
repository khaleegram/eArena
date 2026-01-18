
'use server';

import { adminDb } from '@/lib/firebase-admin';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import type { Tournament, Player, Match, Team, PrizeAllocation } from '@/lib/types';
import { revalidatePath } from 'next/cache';
import { serializeData } from '@/lib/utils';
import { getTournamentAwards } from './payouts';
import { updateStandings } from './standings';
import { customAlphabet } from 'nanoid';
import { getStorage } from 'firebase-admin/storage';
import { getUserProfileById } from './user';
import { sendNotification } from './notifications';
import { addDays, differenceInDays, isBefore, isPast } from 'date-fns';

import { generateRoundRobinFixtures } from '../round-robin';
import { createWorldCupGroups, generateGroupStageFixtures } from '../group-stage';
import { generateSwissRoundFixtures, getMaxSwissRounds, isSwissRound } from '../swiss';
import { getCurrentCupRound, assertRoundCompleted, getWinnersForRound, getChampionIfFinalComplete } from '../cup-progression';
import { predictMatchWinner as predictMatchWinnerFlow, PredictWinnerInput } from '@/ai/flows/predict-match-winner';


const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;

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

      const stream = file.createWriteStream({
          metadata: {
              contentType: flyerFile.type,
          },
      });

      const buffer = Buffer.from(await flyerFile.arrayBuffer());

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


export async function getPublicTournaments(): Promise<Tournament[]> {
    const snapshot = await adminDb.collection('tournaments')
                                 .where('isPublic', '==', true)
                                 .orderBy('createdAt', 'desc')
                                 .limit(50)
                                 .get();

    return snapshot.docs.map(doc => serializeData({ id: doc.id, ...doc.data() }) as Tournament);
}

export async function getTournamentById(id: string): Promise<Tournament | null> {
    const doc = await adminDb.collection('tournaments').doc(id).get();
    if (!doc.exists) {
        return null;
    }
    return serializeData({ id: doc.id, ...doc.data() }) as Tournament;
}

export async function getTournamentsByIds(ids: string[]): Promise<Tournament[]> {
    if (!ids || ids.length === 0) {
        return [];
    }
    const tournaments: Tournament[] = [];
    const chunks: string[][] = [];
    for (let i = 0; i < ids.length; i += 30) {
        chunks.push(ids.slice(i, i + 30));
    }
    for (const chunk of chunks) {
        if (chunk.length > 0) {
            const snapshot = await adminDb.collection('tournaments').where('__name__', 'in', chunk).get();
            snapshot.forEach(doc => {
                tournaments.push(serializeData({ id: doc.id, ...doc.data() }) as Tournament);
            });
        }
    }
    return tournaments;
}

export async function getMatchPrediction(matchId: string, tournamentId: string) {
    const [matchDoc, homeStatsDoc, awayStatsDoc] = await Promise.all([
        adminDb.collection('tournaments').doc(tournamentId).collection('matches').doc(matchId).get(),
        adminDb.collection('playerStats').doc(matchId.split('-')[0]).get(),
        adminDb.collection('playerStats').doc(matchId.split('-')[1]).get()
    ]);

    if (!matchDoc.exists) throw new Error("Match not found");
    
    const match = matchDoc.data() as Match;

    const input: PredictWinnerInput = {
        homeTeam: {
            teamName: match.homeTeamName || "Home",
            winPercentage: homeStatsDoc.exists() ? (homeStatsDoc.data()?.totalWins || 0) / (homeStatsDoc.data()?.totalMatches || 1) * 100 : 50,
            avgGoalsFor: homeStatsDoc.exists() ? (homeStatsDoc.data()?.totalGoals || 0) / (homeStatsDoc.data()?.totalMatches || 1) : 1,
            avgGoalsAgainst: homeStatsDoc.exists() ? (homeStatsDoc.data()?.totalConceded || 0) / (homeStatsDoc.data()?.totalMatches || 1) : 1,
        },
        awayTeam: {
            teamName: match.awayTeamName || "Away",
            winPercentage: awayStatsDoc.exists() ? (awayStatsDoc.data()?.totalWins || 0) / (awayStatsDoc.data()?.totalMatches || 1) * 100 : 50,
            avgGoalsFor: awayStatsDoc.exists() ? (awayStatsDoc.data()?.totalGoals || 0) / (awayStatsDoc.data()?.totalMatches || 1) : 1,
            avgGoalsAgainst: awayStatsDoc.exists() ? (awayStatsDoc.data()?.totalConceded || 0) / (awayStatsDoc.data()?.totalMatches || 1) : 1,
        }
    };
    
    return await predictMatchWinnerFlow(input);
}


export async function startTournamentAndGenerateFixtures(tournamentId: string, organizerId: string) {
    const tournamentRef = adminDb.collection('tournaments').doc(tournamentId);
    const tournamentDoc = await tournamentRef.get();
    if (!tournamentDoc.exists || tournamentDoc.data()?.organizerId !== organizerId) {
      throw new Error("Unauthorized or tournament not found.");
    }
    const tournament = tournamentDoc.data() as Tournament;
    if (tournament.status !== 'open_for_registration' && tournament.status !== 'ready_to_start') {
      throw new Error("Tournament is not ready to start.");
    }
    if (tournament.teamCount < 4) {
      throw new Error("At least 4 teams are required to start the tournament.");
    }
  
    await tournamentRef.update({ status: 'generating_fixtures' });
  
    try {
      const teamsSnapshot = await tournamentRef.collection('teams').where('isApproved', '==', true).get();
      const teams = teamsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Team));
      const teamIds = teams.map(t => t.id);
  
      let fixtures: Omit<Match, 'id' | 'tournamentId' | 'matchDay' | 'status'>[] = [];
  
      switch (tournament.format) {
        case 'league':
          fixtures = generateRoundRobinFixtures(teamIds, tournament.homeAndAway);
          break;
        case 'cup':
          const groups = createWorldCupGroups(teamIds);
          fixtures = generateGroupStageFixtures(groups);
          break;
        case 'swiss':
          fixtures = generateSwissRoundFixtures({
              teamIds,
              roundNumber: 1,
              standings: [],
              previousMatches: [],
          });
          break;
        default:
          throw new Error('Unsupported tournament format for fixture generation.');
      }
      
      const { tournamentStartDate, tournamentEndDate } = tournament;
      const startDate = new Date(tournamentStartDate.toMillis());
      const endDate = new Date(tournamentEndDate.toMillis());
      const totalDays = Math.max(1, differenceInDays(endDate, startDate) + 1);
      
      const matchesPerDay = Math.ceil(fixtures.length / totalDays);
      const timeSlots = [19, 20, 21, 22]; 
  
      fixtures.forEach((fixture, index) => {
          const dayIndex = Math.floor(index / matchesPerDay);
          const timeIndex = index % timeSlots.length;
          const matchDay = addDays(startDate, dayIndex);
          matchDay.setHours(timeSlots[timeIndex]!);
          matchDay.setMinutes(0);
          
          (fixture as any).matchDay = Timestamp.fromDate(matchDay);
      });
  
      const batch = adminDb.batch();
      for (const fixture of fixtures) {
        const matchRef = tournamentRef.collection('matches').doc();
        batch.set(matchRef, fixture);
      }
      
      await batch.commit();
  
      await tournamentRef.update({ status: 'in_progress' });
      
      for (const team of teams) {
        await sendNotification(team.captainId, {
            userId: team.captainId,
            title: 'Tournament Started!',
            body: `The fixtures for "${tournament.name}" are live. Check your schedule!`,
            href: `/tournaments/${tournamentId}?tab=my-matches`
        });
      }
  
      revalidatePath(`/tournaments/${tournamentId}`);
    } catch (error: any) {
      await tournamentRef.update({ status: 'open_for_registration' });
      throw error;
    }
}

// OTHER MISSING TOURNAMENT ACTIONS
export async function extendRegistration(tournamentId: string, hours: number, organizerId: string) {
    const tournamentRef = adminDb.collection('tournaments').doc(tournamentId);
    // Auth and validation logic...
    const doc = await tournamentRef.get();
    const currentEndDate = (doc.data()?.registrationEndDate as Timestamp).toDate();
    const newEndDate = new Date(currentEndDate.getTime() + hours * 60 * 60 * 1000);
    await tournamentRef.update({ registrationEndDate: Timestamp.fromDate(newEndDate) });
    revalidatePath(`/tournaments/${tournamentId}`);
}

export async function progressTournamentStage(tournamentId: string, organizerId: string) {
    // This is a complex function. A simplified version:
    const tournamentRef = adminDb.collection('tournaments').doc(tournamentId);
    const tournamentDoc = await tournamentRef.get();
    const tournament = tournamentDoc.data() as Tournament;
    const matchesSnapshot = await tournamentRef.collection('matches').get();
    const allMatches = matchesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }) as Match);
    
    // ... complex logic to determine winners and generate next stage...
    
    revalidatePath(`/tournaments/${tournamentId}`);
}

export async function rescheduleTournamentAndStart(tournamentId: string, organizerId: string, startDate: string) {
    // Logic to update tournament dates and start it
    revalidatePath(`/tournaments/${tournamentId}`);
}

export async function regenerateTournamentFixtures(tournamentId: string, organizerId: string) {
    // Logic to delete old fixtures and generate new ones
    revalidatePath(`/tournaments/${tournamentId}`);
}

export async function organizerResolveOverdueMatches(tournamentId: string, organizerId: string) {
    // Logic to check for overdue matches and assign forfeits
    revalidatePath(`/tournaments/${tournamentId}`);
}

export async function setOrganizerStreamUrl(tournamentId: string, matchId: string, url: string, organizerId: string) {
    // Logic to set stream URL
    revalidatePath(`/tournaments/${tournamentId}/matches/${matchId}`);
}

export async function requestPlayerReplay(tournamentId: string, matchId: string, userId: string, reason: string) {
    // Logic to handle replay requests
    revalidatePath(`/tournaments/${tournamentId}/matches/${matchId}`);
}

export async function respondToPlayerReplay(tournamentId: string, matchId: string, userId: string, accepted: boolean) {
    // Logic to respond to replay requests
    revalidatePath(`/tournaments/${tournamentId}/matches/${matchId}`);
}

export async function forfeitMatch(tournamentId: string, matchId: string, userId: string) {
    // Logic to forfeit a match
    revalidatePath(`/tournaments/${tournamentId}/matches/${matchId}`);
}

export async function submitMatchResult(tournamentId: string, matchId: string, teamId: string, userId: string, formData: FormData) {
    // Logic to submit match results
    revalidatePath(`/tournaments/${tournamentId}/matches/${matchId}`);
}

export async function transferHost(tournamentId: string, matchId: string, userId: string) {
    // Logic to transfer host
    revalidatePath(`/tournaments/${tournamentId}/matches/${matchId}`);
}

export async function setMatchRoomCode(tournamentId: string, matchId: string, code: string) {
    // Logic to set room code
    revalidatePath(`/tournaments/${tournamentId}/matches/${matchId}`);
}

export async function retryTournamentPayment(tournamentId: string, organizerId: string) {
    // Logic to retry payment
    return { paymentUrl: '' };
}

export async function savePrizeAllocation(tournamentId: string, allocation: PrizeAllocation) {
    const tournamentRef = adminDb.collection('tournaments').doc(tournamentId);
    await tournamentRef.update({ 'rewardDetails.prizeAllocation': allocation });
    revalidatePath(`/tournaments/${tournamentId}`);
}
