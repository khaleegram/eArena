
'use server';

import { adminDb } from '@/lib/firebase-admin';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import type { Tournament, Player, Match, Team, PrizeAllocation, Standing } from '@/lib/types';
import { revalidatePath } from 'next/cache';
import { serializeData, toDate } from '@/lib/utils';
import { getTournamentAwards } from './payouts';
import { getStandingsForTournament, updateStandings } from './standings';
import { customAlphabet } from 'nanoid';
import { getStorage } from 'firebase-admin/storage';
import { getUserProfileById } from './user';
import { sendNotification } from './notifications';
import { addDays, differenceInDays, format, isBefore, isPast, endOfDay } from 'date-fns';

import { generateRoundRobinFixtures } from '../round-robin';
import { createWorldCupGroups, generateGroupStageFixtures, computeAllGroupStandings, seedKnockoutFromGroups, isGroupRound } from '../group-stage';
import { generateSwissRoundFixtures, getMaxSwissRounds, isSwissRound, getSwissRoundNumber } from '../swiss';
import { getLatestRound, assertRoundCompleted, getWinnersForRound, getChampionIfFinalComplete, isKnockoutRound } from '../cup-progression';
import { generateCupRound, getRoundName } from '../cup-tournament';
import { verifyMatchScores } from '@/ai/flows/verify-match-scores';

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

export async function startTournamentAndGenerateFixtures(tournamentId: string, organizerId: string, startImmediately: boolean = false) {
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

        const effectiveStartDate = startImmediately ? new Date() : toDate(tournament.tournamentStartDate);
        const originalDuration = differenceInDays(toDate(tournament.tournamentEndDate), toDate(tournament.tournamentStartDate));
        const effectiveEndDate = addDays(effectiveStartDate, originalDuration);

        const scheduledFixtures = scheduleFixtures(fixtures, effectiveStartDate, Math.max(1, originalDuration + 1));
        
        const batch = adminDb.batch();
        for (const fixture of scheduledFixtures) {
            const matchRef = tournamentRef.collection('matches').doc();
            batch.set(matchRef, {
                ...fixture,
                tournamentId: tournamentId,
                status: 'scheduled',
            });
        }
        await batch.commit();

        const updateData: any = { status: 'in_progress' };
        if (startImmediately) {
            updateData.tournamentStartDate = Timestamp.fromDate(effectiveStartDate);
            updateData.tournamentEndDate = Timestamp.fromDate(effectiveEndDate);
        }
        await tournamentRef.update(updateData);
      
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

export async function progressTournamentStage(tournamentId: string, organizerId: string) {
    const tournamentRef = adminDb.collection('tournaments').doc(tournamentId);
    const tournamentDoc = await tournamentRef.get();
    if (!tournamentDoc.exists || tournamentDoc.data()?.organizerId !== organizerId) {
        throw new Error("Unauthorized or tournament not found.");
    }
    const tournament = tournamentDoc.data() as Tournament;

    const matchesSnapshot = await tournamentRef.collection('matches').get();
    const allMatches = matchesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Match));
    
    let newFixtures: Omit<Match, 'id' | 'tournamentId' | 'matchDay' | 'status'>[] = [];
    let progressed = false;

    // Helper to handle knockout stage progression for both Cup and Swiss formats
    const handleKnockoutProgression = async (currentRound: string) => {
        assertRoundCompleted(currentRound, allMatches);
        
        const championId = getChampionIfFinalComplete(allMatches, tournament);
        if (championId) {
            await tournamentRef.update({ status: 'completed', endedAt: FieldValue.serverTimestamp() });
            await updateStandings(tournamentId); // Final standings update
            return { status: 'completed', progressed: true };
        }

        const winners = getWinnersForRound(allMatches, currentRound, tournament);
        if (winners.length >= 2) {
            newFixtures = generateCupRound(winners, getRoundName(winners.length));
            progressed = true;
        }
    };
    
    const currentRound = getLatestRound(allMatches);

    if (tournament.format === 'cup') {
        // Cup logic: Progress through group stage then knockouts
        if (isGroupRound(currentRound)) {
            const groupMatches = allMatches.filter(m => isGroupRound(m.round));
            const groupStandings = computeAllGroupStandings(groupMatches);
            
            // Check if all groups are done
            const teamIdsInGroups = Object.values(groupStandings).flatMap(table => table.map(row => row.teamId));
            const totalTeamsInGroups = new Set(teamIdsInGroups).size;
            const teamsInTournament = (await tournamentRef.collection('teams').get()).size;

            if (totalTeamsInGroups !== teamsInTournament) {
                throw new Error("Standings are not yet calculated for all teams.");
            }
            
            const allGroupMatchesPlayed = Object.values(groupStandings).every(table => 
                table.every(row => row.matchesPlayed === (table.length - 1) * (tournament.homeAndAway ? 2 : 1))
            );

            if (allGroupMatchesPlayed) {
                newFixtures = seedKnockoutFromGroups(groupStandings);
                progressed = true;
            } else {
                throw new Error("All group stage matches must be completed and approved to proceed.");
            }
        } else if (isKnockoutRound(currentRound)) {
             await handleKnockoutProgression(currentRound);
        }
    } else if (tournament.format === 'swiss') {
        if (isKnockoutRound(currentRound)) {
             await handleKnockoutProgression(currentRound);
        } else if (isSwissRound(currentRound)) {
            const currentRoundNumber = getSwissRoundNumber(currentRound)!;
            assertRoundCompleted(currentRound, allMatches);

            if (currentRoundNumber >= getMaxSwissRounds(tournament.teamCount)) {
                // Transition to knockout stage
                const standings = await getStandingsForTournament(tournamentId);
                const top16 = standings.slice(0, 16).map(s => s.teamId);
                if (top16.length < 2) {
                     await tournamentRef.update({ status: 'completed', endedAt: FieldValue.serverTimestamp() });
                     return { status: 'completed', progressed: true };
                }
                newFixtures = generateCupRound(top16, 'Round of 16');
                progressed = true;
            } else {
                // Progress to next swiss round
                const standings = await getStandingsForTournament(tournamentId);
                const teamIds = (await tournamentRef.collection('teams').get()).docs.map(d => d.id);
                
                newFixtures = generateSwissRoundFixtures({
                    teamIds,
                    roundNumber: currentRoundNumber + 1,
                    standings,
                    previousMatches: allMatches,
                });
                progressed = true;
            }
        }
    }
    
    if (progressed && newFixtures.length > 0) {
        const scheduledFixtures = scheduleFixtures(newFixtures, new Date(), 7); // Schedule over the next 7 days

        const batch = adminDb.batch();
        for (const fixture of scheduledFixtures) {
            const matchRef = tournamentRef.collection('matches').doc();
            batch.set(matchRef, {
                ...fixture,
                tournamentId: tournamentId,
                status: 'scheduled',
            });
        }
        await batch.commit();
        revalidatePath(`/tournaments/${tournamentId}`);
    }

    return { status: tournament.status, progressed };
}

export async function extendRegistration(tournamentId: string, hours: number, organizerId: string) {
    const tournamentRef = adminDb.collection('tournaments').doc(tournamentId);
    const doc = await tournamentRef.get();
    if (!doc.exists || doc.data()?.organizerId !== organizerId) {
        throw new Error("Unauthorized or tournament not found.");
    }
    const tournament = doc.data() as Tournament;
    
    const timeExtensionMs = hours * 60 * 60 * 1000;

    const newRegEndDate = new Date(toDate(tournament.registrationEndDate).getTime() + timeExtensionMs);
    const newStartDate = new Date(toDate(tournament.tournamentStartDate).getTime() + timeExtensionMs);
    const newEndDate = new Date(toDate(tournament.tournamentEndDate).getTime() + timeExtensionMs);

    const batch = adminDb.batch();
    batch.update(tournamentRef, {
        registrationEndDate: Timestamp.fromDate(newRegEndDate),
        tournamentStartDate: Timestamp.fromDate(newStartDate),
        tournamentEndDate: Timestamp.fromDate(newEndDate),
    });

    const matchesSnapshot = await tournamentRef.collection('matches').get();
    if (!matchesSnapshot.empty) {
        matchesSnapshot.forEach(matchDoc => {
            const match = matchDoc.data() as Match;
            const oldMatchDay = toDate(match.matchDay);
            const newMatchDay = new Date(oldMatchDay.getTime() + timeExtensionMs);
            batch.update(matchDoc.ref, { matchDay: Timestamp.fromDate(newMatchDay) });
        });
    }
    
    await batch.commit();
    revalidatePath(`/tournaments/${tournamentId}`);
}

export async function rescheduleTournament(tournamentId: string, newStartDateString: string, organizerId: string) {
    const tournamentRef = adminDb.collection('tournaments').doc(tournamentId);
    const tournamentDoc = await tournamentRef.get();
    if (!tournamentDoc.exists || tournamentDoc.data()?.organizerId !== organizerId) {
        throw new Error("Unauthorized or tournament not found.");
    }
    const tournament = tournamentDoc.data() as Tournament;

    const oldStartDate = toDate(tournament.tournamentStartDate);
    const newStartDate = new Date(newStartDateString);
    const timeDifference = newStartDate.getTime() - oldStartDate.getTime();
    
    const newEndDate = new Date(toDate(tournament.tournamentEndDate).getTime() + timeDifference);

    const matchesSnapshot = await tournamentRef.collection('matches').get();
    const batch = adminDb.batch();

    matchesSnapshot.forEach(doc => {
        const match = doc.data() as Match;
        const oldMatchDay = toDate(match.matchDay);
        const newMatchDay = new Date(oldMatchDay.getTime() + timeDifference);
        batch.update(doc.ref, { matchDay: Timestamp.fromDate(newMatchDay) });
    });

    batch.update(tournamentRef, {
        tournamentStartDate: Timestamp.fromDate(newStartDate),
        tournamentEndDate: Timestamp.fromDate(newEndDate),
    });

    await batch.commit();
    revalidatePath(`/tournaments/${tournamentId}`);
}

export async function regenerateTournamentFixtures(tournamentId: string, organizerId: string) {
    const tournamentRef = adminDb.collection('tournaments').doc(tournamentId);
    const tournamentDoc = await tournamentRef.get();
    if (!tournamentDoc.exists || tournamentDoc.data()?.organizerId !== organizerId) {
        throw new Error("Unauthorized or tournament not found.");
    }
    const tournament = {id: tournamentDoc.id, ...tournamentDoc.data()} as Tournament;

    // 1. Delete all existing matches
    const matchesSnapshot = await tournamentRef.collection('matches').get();
    if (!matchesSnapshot.empty) {
        const deleteBatch = adminDb.batch();
        matchesSnapshot.docs.forEach(doc => {
            deleteBatch.delete(doc.ref);
        });
        await deleteBatch.commit();
    }
    
    // 2. Re-run fixture generation logic
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

    const startDate = toDate(tournament.tournamentStartDate);
    const duration = differenceInDays(toDate(tournament.tournamentEndDate), startDate);
    const scheduledFixtures = scheduleFixtures(fixtures, startDate, Math.max(1, duration + 1));

    const addBatch = adminDb.batch();
    for (const fixture of scheduledFixtures) {
        const matchRef = tournamentRef.collection('matches').doc();
        addBatch.set(matchRef, {
            ...fixture,
            tournamentId: tournamentId,
            status: 'scheduled',
        });
    }
    await addBatch.commit();

    revalidatePath(`/tournaments/${tournamentId}`);
}

export async function organizerResolveOverdueMatches(tournamentId: string, organizerId: string) {
    // Logic to check for overdue matches and assign forfeits
    revalidatePath(`/tournaments/${tournamentId}`);
}

export async function setOrganizerStreamUrl(tournamentId: string, matchId: string, url: string, organizerId: string) {
    const tournamentRef = adminDb.collection('tournaments').doc(tournamentId);
    const tournamentDoc = await tournamentRef.get();
    if(tournamentDoc.data()?.organizerId !== organizerId) {
        throw new Error("You are not authorized to set a stream URL.");
    }
    
    const matchRef = tournamentRef.collection('matches').doc(matchId);
    await matchRef.update({
        'streamLinks.organizer': {
            username: 'Official Stream',
            url: url,
        }
    });

    revalidatePath(`/tournaments/${tournamentId}/matches/${matchId}`);
}

export async function requestPlayerReplay(tournamentId: string, matchId: string, userId: string, reason: string) {
    const matchRef = adminDb.collection('tournaments').doc(tournamentId).collection('matches').doc(matchId);
    const matchDoc = await matchRef.get();
    if (!matchDoc.exists) throw new Error('Match not found');

    const matchData = matchDoc.data() as Match;

    const request: ReplayRequest = {
        requestedBy: userId,
        reason: reason,
        status: 'pending',
    };

    const teamSnapshot = await adminDb.collection('tournaments').doc(tournamentId).collection('teams').where('playerIds', 'array-contains', userId).limit(1).get();
    if (teamSnapshot.empty) throw new Error('You are not in this tournament.');
    
    const userTeamId = teamSnapshot.docs[0]!.id;
    const opponentTeamId = matchData.homeTeamId === userTeamId ? matchData.awayTeamId : matchData.homeTeamId;
    const opponentTeamDoc = await adminDb.collection('tournaments').doc(tournamentId).collection('teams').doc(opponentTeamId).get();
    const opponentCaptainId = opponentTeamDoc.data()?.captainId;

    if (opponentCaptainId) {
        await sendNotification(opponentCaptainId, {
            userId: opponentCaptainId,
            title: "Replay Requested",
            body: `Your opponent has requested a replay for your upcoming match. Reason: ${reason}`,
            href: `/tournaments/${tournamentId}/matches/${matchId}`
        });
    }

    await matchRef.update({ replayRequest: request });

    revalidatePath(`/tournaments/${tournamentId}/matches/${matchId}`);
}

export async function respondToPlayerReplay(tournamentId: string, matchId: string, userId: string, accepted: boolean) {
    const matchRef = adminDb.collection('tournaments').doc(tournamentId).collection('matches').doc(matchId);
    const matchDoc = await matchRef.get();
    if (!matchDoc.exists) throw new Error("Match not found.");
    const matchData = matchDoc.data() as Match;

    if (!matchData.replayRequest || matchData.replayRequest.status !== 'pending') {
        throw new Error("There is no active replay request to respond to.");
    }

    await matchRef.update({
        'replayRequest.status': accepted ? 'accepted' : 'rejected',
        'replayRequest.respondedBy': userId,
    });
    
    revalidatePath(`/tournaments/${tournamentId}/matches/${matchId}`);
}

export async function forfeitMatch(tournamentId: string, matchId: string, userId: string) {
    const tournamentRef = adminDb.collection('tournaments').doc(tournamentId);
    const matchRef = tournamentRef.collection('matches').doc(matchId);

    const [tournamentDoc, matchDoc] = await Promise.all([tournamentRef.get(), matchRef.get()]);
    if (!tournamentDoc.exists) throw new Error("Tournament not found.");
    if (!matchDoc.exists) throw new Error("Match not found.");

    const match = matchDoc.data() as Match;
    
    if (match.status !== 'scheduled') {
        throw new Error("Only scheduled matches can be forfeited.");
    }
    
    const teamSnapshot = await tournamentRef.collection('teams').where('playerIds', 'array-contains', userId).limit(1).get();
    if(teamSnapshot.empty) {
        throw new Error("You are not part of a team in this match.");
    }
    const userTeam = teamSnapshot.docs[0].data() as Team;

    const isHome = userTeam.id === match.homeTeamId;
    const isAway = userTeam.id === match.awayTeamId;

    if (!isHome && !isAway) {
        throw new Error("You are not a participant in this match.");
    }

    const homeScore = isHome ? 0 : 3;
    const awayScore = isAway ? 0 : 3;

    await matchRef.update({
        status: 'approved',
        homeScore,
        awayScore,
        wasAutoForfeited: true,
        resolutionNotes: `Match forfeited by ${userTeam.name}.`
    });

    await tournamentRef.update({ needsStandingsUpdate: true });

    revalidatePath(`/tournaments/${tournamentId}/matches/${matchId}`);
    revalidatePath(`/tournaments/${tournamentId}`);
}

export async function submitMatchResult(tournamentId: string, matchId: string, teamId: string, userId: string, formData: FormData) {
    revalidatePath(`/tournaments/${tournamentId}/matches/${matchId}`);
}

export async function transferHost(tournamentId: string, matchId: string, userId: string) {
    const matchRef = adminDb.collection('tournaments').doc(tournamentId).collection('matches').doc(matchId);
    const matchDoc = await matchRef.get();
    if (!matchDoc.exists) throw new Error("Match not found.");
    const match = matchDoc.data() as Match;
    if (match.hostId !== userId) throw new Error("Only the current host can transfer duties.");
    
    const newHostId = match.homeTeamId === userId ? match.awayTeamId : match.homeTeamId;
    await matchRef.update({
        hostId: newHostId,
        hostTransferRequested: true,
    });
    revalidatePath(`/tournaments/${tournamentId}/matches/${matchId}`);
}

export async function setMatchRoomCode(tournamentId: string, matchId: string, code: string) {
    const matchRef = adminDb.collection('tournaments').doc(tournamentId).collection('matches').doc(matchId);
    await matchRef.update({
        roomCode: code,
        roomCodeSetAt: FieldValue.serverTimestamp(),
    });
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
    
// DEV-ONLY FUNCTIONS

async function autoApproveMatches(matches: Match[], tournamentRef: FirebaseFirestore.DocumentReference<FirebaseFirestore.DocumentData>) {
    const batch = adminDb.batch();
    let approvedCount = 0;
    for (const match of matches) {
        if (match.status === 'scheduled') {
            let homeScore: number;
            let awayScore: number;
            const isKnockout = isKnockoutRound(match.round);

            do {
                homeScore = Math.floor(Math.random() * 4);
                awayScore = Math.floor(Math.random() * 4);
            } while (isKnockout && homeScore === awayScore);
            
            const matchRef = tournamentRef.collection('matches').doc(match.id);
            const homeTeamStats = { possession: Math.floor(40 + Math.random() * 20), shots: Math.floor(5 + Math.random() * 10), shotsOnTarget: Math.floor(1 + Math.random() * 5), fouls: Math.floor(Math.random() * 5), offsides: Math.floor(Math.random() * 3), cornerKicks: Math.floor(Math.random() * 8), freeKicks: Math.floor(Math.random() * 5), passes: Math.floor(150 + Math.random() * 100), successfulPasses: Math.floor(120 + Math.random() * 80), crosses: Math.floor(Math.random() * 10), interceptions: Math.floor(5 + Math.random() * 10), tackles: Math.floor(5 + Math.random() * 15), saves: Math.floor(Math.random() * 6)};
            const awayTeamStats = { possession: 100 - homeTeamStats.possession, shots: Math.floor(5 + Math.random() * 10), shotsOnTarget: Math.floor(1 + Math.random() * 5), fouls: Math.floor(Math.random() * 5), offsides: Math.floor(Math.random() * 3), cornerKicks: Math.floor(Math.random() * 8), freeKicks: Math.floor(Math.random() * 5), passes: Math.floor(150 + Math.random() * 100), successfulPasses: Math.floor(120 + Math.random() * 80), crosses: Math.floor(Math.random() * 10), interceptions: Math.floor(5 + Math.random() * 10), tackles: Math.floor(5 + Math.random() * 15), saves: Math.floor(Math.random() * 6)};
            
            batch.update(matchRef, {
                status: 'approved',
                homeScore,
                awayScore,
                homeTeamStats,
                awayTeamStats,
            });
            approvedCount++;
        }
    }
    if (approvedCount > 0) {
        await batch.commit();
        await tournamentRef.update({ needsStandingsUpdate: true });
    }
    return approvedCount;
}

export async function devAutoApproveCurrentStageMatches(tournamentId: string, organizerId: string) {
    const tournamentRef = adminDb.collection('tournaments').doc(tournamentId);
    const tournamentDoc = await tournamentRef.get();
    if (!tournamentDoc.exists || tournamentDoc.data()?.organizerId !== organizerId) {
        throw new Error("Unauthorized or tournament not found.");
    }
    
    const matchesSnapshot = await tournamentRef.collection('matches').get();
    const allMatches = matchesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Match));
    
    // Find the earliest round with scheduled matches
    const scheduledMatches = allMatches.filter(m => m.status === 'scheduled');
    if (scheduledMatches.length === 0) {
      return { approved: 0 };
    }
    
    // This is a simpler, more robust way to find the "current" stage to approve.
    const roundsWithScheduledMatches = [...new Set(scheduledMatches.map(m => m.round))];
    roundsWithScheduledMatches.sort((a,b) => getLatestRound([ {round: a}, {round: b} ] as any) === a ? 1 : -1);
    const earliestRound = roundsWithScheduledMatches[0];
    
    const matchesToApprove = scheduledMatches.filter(m => m.round === earliestRound);

    const approved = await autoApproveMatches(matchesToApprove, tournamentRef);

    await updateStandings(tournamentId);

    return { approved };
}


export async function devSeedDummyTeams(tournamentId: string, organizerId: string, count: number): Promise<void> {
    const tournamentRef = adminDb.collection('tournaments').doc(tournamentId);
    const tournamentDoc = await tournamentRef.get();
    if (!tournamentDoc.exists || tournamentDoc.data()?.organizerId !== organizerId) {
        throw new Error("Unauthorized or tournament not found.");
    }
    const tournament = tournamentDoc.data() as Tournament;

    const existingTeams = (await tournamentRef.collection('teams').get()).size;
    const teamsToAdd = Math.min(count, tournament.maxTeams - existingTeams);

    if (teamsToAdd <= 0) {
        throw new Error("No more teams can be added or count is zero.");
    }

    const batch = adminDb.batch();
    for (let i = 0; i < teamsToAdd; i++) {
        const teamId = `dummy_${Date.now()}_${i}`;
        const teamRef = tournamentRef.collection('teams').doc(teamId);
        const captainId = `dummy_captain_${teamId}`;
        const teamData: Team = {
            id: teamId,
            tournamentId,
            name: `Dummy Team ${existingTeams + i + 1}`,
            captainId: captainId,
            players: [{ uid: captainId, role: 'captain', username: `Captain ${i + 1}` }],
            playerIds: [captainId],
            isApproved: true,
        };
        batch.set(teamRef, teamData);
    }
    batch.update(tournamentRef, { teamCount: FieldValue.increment(teamsToAdd) });
    await batch.commit();
}

export async function devAutoApproveAndProgress(tournamentId: string, organizerId: string) {
    const { approved } = await devAutoApproveCurrentStageMatches(tournamentId, organizerId);
    const { status, progressed } = await progressTournamentStage(tournamentId, organizerId);
    return { approved, status, progressed };
}

export async function devAutoRunCupToCompletion(tournamentId: string, organizerId: string) {
    let steps = 0;
    let tournamentStatus = '';
    const MAX_STEPS = 10; // Safety break

    while(tournamentStatus !== 'completed' && steps < MAX_STEPS) {
        const tournamentDoc = await adminDb.collection('tournaments').doc(tournamentId).get();
        tournamentStatus = tournamentDoc.data()?.status || '';

        if (tournamentStatus === 'completed') break;

        await devAutoApproveCurrentStageMatches(tournamentId, organizerId);
        await progressTournamentStage(tournamentId, organizerId);
        
        steps++;
    }
    
    const finalDoc = await adminDb.collection('tournaments').doc(tournamentId).get();
    return { status: finalDoc.data()?.status, steps };
}
