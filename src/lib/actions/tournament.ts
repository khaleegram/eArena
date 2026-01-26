
'use server';

import { adminDb } from '@/lib/firebase-admin';
import { FieldValue, Timestamp, FieldPath } from 'firebase-admin/firestore';
import type { Tournament, Player, Match, Team, PrizeAllocation, Standing, MatchReport, PlayerStats } from '@/lib/types';
import { revalidatePath } from 'next/cache';
import { serializeData, toDate } from '@/lib/utils';
import { retryTournamentPayment } from './payouts';
import { customAlphabet } from 'nanoid';
import { getStorage } from 'firebase-admin/storage';
import { getUserProfileById } from './user';
import { sendNotification } from './notifications';
import { addDays, differenceInDays, format, isBefore, isAfter, isToday, isFuture, isPast, endOfDay } from 'date-fns';

import { generateRoundRobinFixtures } from '../round-robin';
import { createWorldCupGroups, generateGroupStageFixtures, computeAllGroupStandings, seedKnockoutFromGroups, isGroupRound } from '../group-stage';
import { generateSwissRoundFixtures, getMaxSwissRounds, isSwissRound, getSwissRoundNumber } from '../swiss';
import { getLatestRound, assertRoundCompleted, getWinnersForRound, getChampionIfFinalComplete, isKnockoutRound, getRoundName } from '../cup-progression';
import { generateCupRound } from '../cup-tournament';
import { verifyMatchScores } from '@/ai/flows/verify-match-scores';
import { getStandingsForTournament } from './standings';
import { getTeamsForTournament } from './team';
import { checkAndGrantAchievements } from './achievements';
import { fullTournamentDelete } from './helpers';

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;

export async function getTournamentById(id: string): Promise<Tournament | null> {
    const tournamentDoc = await adminDb.collection('tournaments').doc(id).get();
    if (!tournamentDoc.exists) {
        return null;
    }
    return serializeData({ id: tournamentDoc.id, ...tournamentDoc.data() }) as Tournament;
}

export async function getTournamentsByIds(ids: string[]): Promise<Tournament[]> {
    if (ids.length === 0) {
        return [];
    }

    const tournamentsRef = adminDb.collection('tournaments');
    const tournaments: Tournament[] = [];

    // Firestore 'in' query supports up to 30 elements in this SDK version
    const chunks: string[][] = [];
    for (let i = 0; i < ids.length; i += 30) {
        chunks.push(ids.slice(i, i + 30));
    }

    for (const chunk of chunks) {
        if (chunk.length > 0) {
            const snapshot = await tournamentsRef.where(FieldPath.documentId(), 'in', chunk).get();
            snapshot.forEach(doc => {
                tournaments.push(serializeData({ id: doc.id, ...doc.data() }) as Tournament);
            });
        }
    }

    return tournaments;
}


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

export async function updateTournamentFlyer(tournamentId: string, organizerId: string, formData: FormData) {
    const tournamentRef = adminDb.collection('tournaments').doc(tournamentId);
    const tournamentDoc = await tournamentRef.get();
    if (!tournamentDoc.exists) throw new Error("Tournament not found.");

    const tournament = tournamentDoc.data() as Tournament;
    if (tournament.organizerId !== organizerId) {
        throw new Error("You are not authorized to edit this tournament.");
    }
    
    const flyerFile = formData.get('flyer') as File | null;
    if (!flyerFile || flyerFile.size === 0) {
        throw new Error("No flyer image provided.");
    }

    const MAX_FLYER_SIZE = 5 * 1024 * 1024; // 5MB
    const ALLOWED_FLYER_TYPES = ["image/jpeg", "image/png", "image/webp"];

    if (flyerFile.size > MAX_FLYER_SIZE) {
        throw new Error("Flyer image must be less than 5MB.");
    }
    if (!ALLOWED_FLYER_TYPES.includes(flyerFile.type)) {
        throw new Error("Invalid file type. Only JPEG, PNG, and WebP are allowed.");
    }
    
    let flyerUrl = '';
    const bucket = getStorage().bucket(process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET);
    const fileName = `tournaments/flyers/${tournamentId}_${Date.now()}_${flyerFile.name}`;
    const file = bucket.file(fileName);
    
    const buffer = Buffer.from(await flyerFile.arrayBuffer());
    await file.save(buffer, {
        metadata: { contentType: flyerFile.type },
    });

    [flyerUrl] = await file.getSignedUrl({
        action: 'read',
        expires: '03-09-2491',
    });

    await tournamentRef.update({ flyerUrl });
    revalidatePath(`/tournaments/${tournamentId}`);

    return { flyerUrl };
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

        return { tournamentId };
    } else {
        throw new Error('Payment verification failed.');
    }
}

export async function extendRegistration(tournamentId: string, hours: number, organizerId: string) {
    const tournamentRef = adminDb.collection('tournaments').doc(tournamentId);
    const tournamentDoc = await tournamentRef.get();

    if (!tournamentDoc.exists) {
        throw new Error("Tournament not found.");
    }

    const tournament = tournamentDoc.data() as Tournament;

    if (tournament.organizerId !== organizerId) {
        throw new Error("You are not authorized to perform this action.");
    }

    if (tournament.status !== 'open_for_registration') {
        throw new Error("Registration can only be extended for tournaments that are open for registration.");
    }
    
    const currentEndDate = toDate(tournament.registrationEndDate);
    const newEndDate = new Date(currentEndDate.getTime() + hours * 60 * 60 * 1000);

    await tournamentRef.update({
        registrationEndDate: Timestamp.fromDate(newEndDate),
    });

    revalidatePath(`/tournaments/${tournamentId}`);
}
      

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

export async function rescheduleTournament(tournamentId: string, newStartDateISO: string, organizerId: string) {
    const tournamentRef = adminDb.collection('tournaments').doc(tournamentId);
    const tournamentDoc = await tournamentRef.get();
    if (!tournamentDoc.exists) throw new Error("Tournament not found.");

    const tournament = tournamentDoc.data() as Tournament;
    if (tournament.organizerId !== organizerId) throw new Error("You are not authorized to reschedule this tournament.");
    if (tournament.status === 'completed') throw new Error("Cannot reschedule a completed tournament.");
    
    const newStartDate = toDate(newStartDateISO);
    const oldStartDate = toDate(tournament.tournamentStartDate);

    const diffInDays = differenceInDays(newStartDate, oldStartDate);

    const oldRegEndDate = toDate(tournament.registrationEndDate);
    const newRegEndDate = addDays(oldRegEndDate, diffInDays);

    const oldTournamentEndDate = toDate(tournament.tournamentEndDate);
    const newTournamentEndDate = addDays(oldTournamentEndDate, diffInDays);

    const batch = adminDb.batch();

    batch.update(tournamentRef, {
        tournamentStartDate: Timestamp.fromDate(newStartDate),
        tournamentEndDate: Timestamp.fromDate(newTournamentEndDate),
        registrationEndDate: Timestamp.fromDate(newRegEndDate),
    });

    const matchesRef = tournamentRef.collection('matches');
    const matchesSnapshot = await matchesRef.get();
    if (!matchesSnapshot.empty) {
        matchesSnapshot.forEach(doc => {
            const match = doc.data() as Match;
            const oldMatchDay = toDate(match.matchDay);
            const newMatchDay = addDays(oldMatchDay, diffInDays);
            batch.update(doc.ref, { matchDay: Timestamp.fromDate(newMatchDay) });
        });
    }
    
    await batch.commit();

    const teamsSnapshot = await tournamentRef.collection('teams').get();
    if (!teamsSnapshot.empty) {
        const teamDocs = teamsSnapshot.docs;
        const notificationPromises: Promise<void>[] = [];

        for (const teamDoc of teamDocs) {
            const team = teamDoc.data() as Team;
            for (const playerId of team.playerIds) {
                // Send notifications concurrently
                notificationPromises.push(sendNotification(playerId, {
                    userId: playerId,
                    tournamentId,
                    title: 'Tournament Rescheduled',
                    body: `The schedule for "${tournament.name}" has been updated.`,
                    href: `/tournaments/${tournamentId}`
                }));
            }
        }
        await Promise.allSettled(notificationPromises);
    }
    
    revalidatePath(`/tournaments/${tournamentId}`);
}

async function generateFixturesForTournament(tournamentRef: FirebaseFirestore.DocumentReference<FirebaseFirestore.DocumentData>, tournament: Tournament) {
    const teamsSnapshot = await tournamentRef.collection('teams').get();
    const teamIds = teamsSnapshot.docs.map(doc => doc.id);

    if (teamIds.length < 4) {
        await tournamentRef.update({ status: 'open_for_registration' }); // Revert status
        throw new Error("Cannot generate fixtures, not enough teams.");
    }

    let fixtures: Omit<Match, 'id' | 'tournamentId' | 'matchDay' | 'status'>[] = [];
    const tournamentStartDate = toDate(tournament.tournamentStartDate);
    const tournamentEndDate = toDate(tournament.tournamentEndDate);
    const totalDays = Math.max(1, differenceInDays(tournamentEndDate, tournamentStartDate) + 1);

    switch (tournament.format) {
        case 'league':
            fixtures = generateRoundRobinFixtures(teamIds, tournament.homeAndAway);
            break;
        case 'cup':
            const groups = createWorldCupGroups(teamIds);
            fixtures = generateGroupStageFixtures(groups);
            break;
        case 'swiss':
             fixtures = generateSwissRoundFixtures({ teamIds, roundNumber: 1, standings: [], previousMatches: [] });
            break;
        default:
            throw new Error(`Fixture generation for format "${tournament.format}" is not implemented.`);
    }

    const scheduledFixtures = scheduleFixtures(fixtures, tournamentStartDate, totalDays);

    const batch = adminDb.batch();
    for (const fixture of scheduledFixtures) {
        const matchRef = tournamentRef.collection('matches').doc();
        batch.set(matchRef, { ...fixture, status: 'scheduled' });
    }
    
    await batch.commit();
}


export async function regenerateTournamentFixtures(tournamentId: string, organizerId: string) {
    const tournamentRef = adminDb.collection('tournaments').doc(tournamentId);
    const tournamentDoc = await tournamentRef.get();
    if (!tournamentDoc.exists) throw new Error("Tournament not found.");

    const tournament = { id: tournamentId, ...tournamentDoc.data() } as Tournament;
    if (tournament.organizerId !== organizerId) throw new Error("You are not authorized to perform this action.");

    const canRegenerate = ['in_progress', 'ready_to_start'].includes(tournament.status);
    if (!canRegenerate) {
        throw new Error("Fixtures can only be regenerated for tournaments that are ready to start or in progress.");
    }
    
    const matchesSnapshot = await tournamentRef.collection('matches').get();
    const hasPlayedMatches = matchesSnapshot.docs.some(doc => doc.data().status !== 'scheduled');
    if (hasPlayedMatches) {
        throw new Error("Cannot regenerate fixtures after matches have been played or reported.");
    }

    if (!matchesSnapshot.empty) {
        const deleteBatch = adminDb.batch();
        matchesSnapshot.forEach(doc => {
            deleteBatch.delete(doc.ref);
        });
        await deleteBatch.commit();
    }
    
    const standingsSnapshot = await adminDb.collection('standings').where('tournamentId', '==', tournamentId).get();
    if (!standingsSnapshot.empty) {
        const standingsBatch = adminDb.batch();
        standingsSnapshot.forEach(doc => {
            standingsBatch.delete(doc.ref);
        });
        await standingsBatch.commit();
    }
    
    await generateFixturesForTournament(tournamentRef, tournament);
    
    const teamsSnapshot = await tournamentRef.collection('teams').get();
    const teams = teamsSnapshot.docs.map(doc => doc.data() as Team);
    const notificationPromises: Promise<void>[] = [];
    for (const team of teams) {
        for (const playerId of team.playerIds) {
            notificationPromises.push(sendNotification(playerId, {
                userId: playerId,
                tournamentId,
                title: 'Fixtures Regenerated',
                body: `The match schedule for "${tournament.name}" has been updated.`,
                href: `/tournaments/${tournamentId}?tab=fixtures`
            }));
        }
    }
    await Promise.allSettled(notificationPromises);

    revalidatePath(`/tournaments/${tournamentId}`);
}

export async function progressTournamentStage(tournamentId: string, organizerId: string) {
    const tournamentRef = adminDb.collection('tournaments').doc(tournamentId);
    const tournamentDoc = await tournamentRef.get();
    if (!tournamentDoc.exists) throw new Error("Tournament not found.");
    const tournament = tournamentDoc.data() as Tournament;

    if (tournament.organizerId !== organizerId) throw new Error("You are not authorized.");
    if (tournament.status !== 'in_progress') throw new Error("Tournament is not in progress.");
    if (tournament.format !== 'cup' && tournament.format !== 'swiss') {
        throw new Error("Stage progression is only for Cup and Swiss formats.");
    }
    
    const matchesSnapshot = await tournamentRef.collection('matches').get();
    const allMatches = matchesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Match));

    const latestRound = getLatestRound(allMatches);
    
    assertRoundCompleted(latestRound, allMatches);
    
    let newFixtures: Omit<Match, 'id' | 'tournamentId' | 'matchDay' | 'status'>[] = [];
    const tournamentStartDate = toDate(tournament.tournamentStartDate);
    const tournamentEndDate = toDate(tournament.tournamentEndDate);
    const totalDays = Math.max(1, differenceInDays(tournamentEndDate, tournamentStartDate) + 1);

    if (isGroupRound(latestRound)) {
        const groupTables = computeAllGroupStandings(allMatches);
        const advancingFixtures = seedKnockoutFromGroups(groupTables);
        newFixtures = advancingFixtures;
    } else if (isKnockoutRound(latestRound)) {
        const winners = getWinnersForRound(allMatches, latestRound, tournament);
        if(winners.length < 2) {
            await tournamentRef.update({ status: 'completed', endedAt: FieldValue.serverTimestamp() });
            return { progressed: false, status: 'completed' };
        }
        const newRoundName = getRoundName(winners.length);
        newFixtures = generateCupRound(winners, newRoundName);
    } else if (isSwissRound(latestRound)) {
        const currentRoundNumber = getSwissRoundNumber(latestRound);
        
        if (currentRoundNumber === null || currentRoundNumber < getMaxSwissRounds(tournament.teamCount)) {
            // This is for progressing from one Swiss round to the next.
            const teamsSnapshot = await tournamentRef.collection('teams').get();
            const teamIds = teamsSnapshot.docs.map(doc => doc.id);
            const standings = await getStandingsForTournament(tournamentId);
            newFixtures = generateSwissRoundFixtures({
                teamIds,
                roundNumber: (currentRoundNumber || 0) + 1,
                standings,
                previousMatches: allMatches,
            });
        } else {
            // Last Swiss round is complete, now create knockout stage.
            const standings = await getStandingsForTournament(tournamentId);
            const top16Teams = standings.slice(0, 16).map(s => s.teamId);

            if (top16Teams.length < 16) {
                 throw new Error("Not enough teams to proceed to the Round of 16. At least 16 teams must complete the Swiss stage.");
            }

            // Seed the Round of 16: 1st vs 16th, 2nd vs 15th, etc.
            const roundOf16Fixtures: Omit<Match, 'id' | 'tournamentId' | 'matchDay' | 'status'>[] = [];
            for (let i = 0; i < 8; i++) {
                const homeTeamId = top16Teams[i]!;
                const awayTeamId = top16Teams[15 - i]!;
                roundOf16Fixtures.push({
                    homeTeamId: homeTeamId,
                    awayTeamId: awayTeamId,
                    round: 'Round of 16',
                    hostId: homeTeamId, // Higher seed is host
                    homeScore: null,
                    awayScore: null,
                    hostTransferRequested: false,
                });
            }
            
            newFixtures = roundOf16Fixtures;
        }
    }

    if (newFixtures.length === 0) {
        return { progressed: false, status: 'in_progress', reason: 'No new fixtures to generate.' };
    }

    const scheduledFixtures = scheduleFixtures(newFixtures, new Date(), totalDays);
    
    const batch = adminDb.batch();
    scheduledFixtures.forEach(fixture => {
        const matchRef = tournamentRef.collection('matches').doc();
        batch.set(matchRef, { ...fixture, status: 'scheduled' });
    });
    await batch.commit();

    return { progressed: true, status: 'in_progress' };
}

export async function findTournamentByCode(code: string): Promise<string | null> {
    const snapshot = await adminDb.collection('tournaments').where('code', '==', code).limit(1).get();
    if (snapshot.empty) return null;
    return snapshot.docs[0].id;
}

export async function savePrizeAllocation(tournamentId: string, allocation: PrizeAllocation) {
    const tournamentRef = adminDb.collection('tournaments').doc(tournamentId);
    await tournamentRef.update({ 'rewardDetails.prizeAllocation': allocation });
    revalidatePath(`/tournaments/${tournamentId}`);
}

export async function submitMatchResult(tournamentId: string, matchId: string, teamId: string, userId: string, formData: FormData) {
    // This is a placeholder for a more complex implementation
    // For now, it will just acknowledge the submission.
    console.log(`Result submitted for match ${matchId} by user ${userId}`);
    return { success: true };
}

export async function setOrganizerStreamUrl(tournamentId: string, matchId: string, url: string, organizerId: string) {
    // Placeholder
    console.log(`Stream URL set for match ${matchId} by organizer ${organizerId}`);
}

export async function forfeitMatch(tournamentId: string, matchId: string, userId: string) {
    // Placeholder
    console.log(`Match ${matchId} forfeited by user ${userId}`);
}

export async function requestPlayerReplay(tournamentId: string, matchId: string, userId: string, reason: string) {
    // Placeholder
    console.log(`Replay requested for match ${matchId} by user ${userId} for reason: ${reason}`);
}

export async function respondToPlayerReplay(tournamentId: string, matchId: string, userId: string, accepted: boolean) {
    // Placeholder
    console.log(`User ${userId} ${accepted ? 'accepted' : 'rejected'} replay for match ${matchId}`);
}

export async function cancelReplayRequest(tournamentId: string, matchId: string, userId: string) {
    // Placeholder
    console.log(`Replay request for match ${matchId} cancelled by user ${userId}`);
}

export async function setMatchRoomCode(tournamentId: string, matchId: string, code: string) {
    // Placeholder
    console.log(`Room code for match ${matchId} set to ${code}`);
}

export async function transferHost(tournamentId: string, matchId: string, userId: string) {
    // Placeholder
    console.log(`Host for match ${matchId} transferred by user ${userId}`);
}

export async function startTournamentAndGenerateFixtures(tournamentId: string, organizerId: string, fromCron: boolean = false) {
    // Placeholder
    console.log(`Tournament ${tournamentId} started by organizer ${organizerId}`);
}

export async function organizerResolveOverdueMatches(tournamentId: string, organizerId: string) {
    // Placeholder
    console.log(`Overdue matches for tournament ${tournamentId} resolved by organizer ${organizerId}`);
}

export async function recalculateStandings(tournamentId: string, userId: string) {
    // Placeholder
    console.log(`Standings for tournament ${tournamentId} recalculated by user ${userId}`);
}
