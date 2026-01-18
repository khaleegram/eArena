
'use server';

import { adminDb } from '@/lib/firebase-admin';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import type { Tournament, Player, Match } from '@/lib/types';
import { revalidatePath } from 'next/cache';
import { serializeData } from '@/lib/utils';
import { getTournamentAwards } from './payouts';
import { updateStandings } from './standings';
import { customAlphabet } from 'nanoid';
import { getStorage } from 'firebase-admin/storage';
import { getUserProfileById } from './user';
import { sendNotification } from './notifications';
import { getCurrentCupRound } from '../cup-progression';
import { getSwissRoundNumber } from '../swiss';
import { isGroupRound } from '../group-stage';
import { progressTournamentStage } from './team';


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

export async function approveMatchResult(tournamentId: string, matchId: string, winningTeamId: string, adminNotes?: string) {
    const matchRef = adminDb.collection('tournaments').doc(tournamentId).collection('matches').doc(matchId);
    
    // In a transaction, update the match status and scores based on the winner
    await adminDb.runTransaction(async (transaction) => {
        const matchDoc = await transaction.get(matchRef);
        if (!matchDoc.exists) {
            throw new Error("Match not found");
        }
        const matchData = matchDoc.data();
        
        let homeScore = 0;
        let awayScore = 0;

        if (matchData?.homeTeamId === winningTeamId) {
            homeScore = 3;
            awayScore = 0;
        } else {
            homeScore = 0;
            awayScore = 3;
        }
        
        const updateData: any = {
            status: 'approved',
            homeScore,
            awayScore,
        };

        if (adminNotes) {
            updateData.resolutionNotes = adminNotes;
        }

        transaction.update(matchRef, updateData);
    });

    // Set flag for cron job to update standings
    await adminDb.collection('tournaments').doc(tournamentId).update({
        needsStandingsUpdate: true,
        lastAutoResolvedAt: FieldValue.serverTimestamp()
    });

    revalidatePath(`/tournaments/${tournamentId}`);
}


export async function getMatchPrediction(matchId: string, tournamentId: string) {
    const matchRef = adminDb.collection('tournaments').doc(tournamentId).collection('matches').doc(matchId);
    // ... logic for prediction
    return { predictedWinnerName: 'Team A', confidence: 75, reasoning: 'AI analysis placeholder' };
}

export async function getTournamentsByIds(ids: string[]): Promise<Tournament[]> {
    if (!ids || ids.length === 0) {
        return [];
    }
    const tournaments: Tournament[] = [];
    const chunks: string[][] = [];
    // Firestore 'in' query supports a maximum of 30 elements.
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

// DEV-ONLY FUNCTIONS FOR TESTING

export async function devSeedDummyTeams(tournamentId: string, organizerId: string, count: number) {
    const tournamentRef = adminDb.collection('tournaments').doc(tournamentId);
    const tournamentDoc = await tournamentRef.get();
    if (!tournamentDoc.exists || tournamentDoc.data()?.organizerId !== organizerId) {
        throw new Error("Unauthorized or tournament not found.");
    }
    const tournament = tournamentDoc.data() as Tournament;

    const teamsToAdd = Math.min(count, tournament.maxTeams - tournament.teamCount);
    if (teamsToAdd <= 0) {
        throw new Error("No space for new teams or count is zero.");
    }

    const batch = adminDb.batch();
    for (let i = 0; i < teamsToAdd; i++) {
        const teamRef = tournamentRef.collection('teams').doc();
        const captainId = `dummy_captain_${teamRef.id}`;
        
        batch.set(teamRef, {
            name: `Dummy Team ${i + 1}`,
            logoUrl: '',
            captainId: captainId,
            players: [{ uid: captainId, role: 'captain', username: `Captain ${i+1}` }],
            playerIds: [captainId],
            isApproved: true,
            tournamentId: tournamentId,
        });

        const membershipRef = adminDb.collection('userMemberships').doc(`${tournamentId}_${captainId}`);
        batch.set(membershipRef, { userId: captainId, teamId: teamRef.id, tournamentId });
    }

    batch.update(tournamentRef, { teamCount: FieldValue.increment(teamsToAdd) });
    await batch.commit();

    revalidatePath(`/tournaments/${tournamentId}`);
    return { created: teamsToAdd };
}

export async function devAutoApproveCurrentStageMatches(tournamentId: string, organizerId: string) {
    const tournamentRef = adminDb.collection('tournaments').doc(tournamentId);
    const tournamentDoc = await tournamentRef.get();
    if (!tournamentDoc.exists || tournamentDoc.data()?.organizerId !== organizerId) {
        throw new Error("Unauthorized or tournament not found.");
    }
    const tournament = tournamentDoc.data() as Tournament;

    const matchesSnapshot = await tournamentRef.collection('matches').get();
    const allMatches = matchesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }) as Match);

    let currentRound: string | undefined;
    if (tournament.format === 'cup') {
        currentRound = getCurrentCupRound(allMatches);
    } else if (tournament.format === 'swiss') {
        const roundNumbers = allMatches.map(m => getSwissRoundNumber(m.round)).filter(n => n !== null) as number[];
        const maxRound = Math.max(0, ...roundNumbers);
        if (maxRound > 0) {
            currentRound = `Swiss Round ${maxRound}`;
        }
    }

    const matchesToApprove = allMatches.filter(m => {
        if (m.status !== 'scheduled') return false;
        if (currentRound) return m.round === currentRound;
        return true; // league format
    });

    if (matchesToApprove.length === 0) {
        return { approved: 0, message: "No scheduled matches found in the current stage." };
    }

    const batch = adminDb.batch();
    for (const match of matchesToApprove) {
        const matchRef = tournamentRef.collection('matches').doc(match.id);
        const homeScore = Math.floor(Math.random() * 4);
        let awayScore = Math.floor(Math.random() * 4);
        
        const isKnockout = tournament.format === 'cup' && !isGroupRound(match.round);
        if (isKnockout && homeScore === awayScore) {
            awayScore += 1;
        }

        batch.update(matchRef, {
            status: 'approved',
            homeScore: homeScore,
            awayScore: awayScore,
        });
    }

    batch.update(tournamentRef, { needsStandingsUpdate: true });
    await batch.commit();

    revalidatePath(`/tournaments/${tournamentId}`);
    return { approved: matchesToApprove.length };
}


export async function devAutoApproveAndProgress(tournamentId: string, organizerId: string) {
    const approveResult = await devAutoApproveCurrentStageMatches(tournamentId, organizerId);

    // Add a small delay to allow Firestore to process the first write batch
    await new Promise(res => setTimeout(res, 500));

    const tournamentDoc = await adminDb.collection('tournaments').doc(tournamentId).get();
    const tournament = tournamentDoc.data() as Tournament;
    
    if (tournament.status === 'in_progress' && (tournament.format === 'cup' || tournament.format === 'swiss')) {
        try {
            await progressTournamentStage(tournamentId, organizerId);
            const updatedTournamentDoc = await adminDb.collection('tournaments').doc(tournamentId).get();
            return { approved: approveResult.approved, progressed: true, status: updatedTournamentDoc.data()?.status };
        } catch (e: any) {
            return { approved: approveResult.approved, progressed: false, status: tournament.status, error: e.message };
        }
    }
    
    return { approved: approveResult.approved, progressed: false, status: tournament.status };
}


export async function devAutoRunCupToCompletion(tournamentId: string, organizerId: string) {
    let steps = 0;
    let tournamentDoc = await adminDb.collection('tournaments').doc(tournamentId).get();
    let status = tournamentDoc.data()?.status;

    while (status === 'in_progress' && steps < 10) { // safety break
        steps++;
        await devAutoApproveCurrentStageMatches(tournamentId, organizerId);
        await new Promise(resolve => setTimeout(resolve, 500));

        try {
             await progressTournamentStage(tournamentId, organizerId);
        } catch(e) {
            // Fails when tournament is complete, which is expected.
        }
        
        await new Promise(resolve => setTimeout(resolve, 500));
        tournamentDoc = await adminDb.collection('tournaments').doc(tournamentId).get();
        status = tournamentDoc.data()?.status;
    }
    
    return { steps, status };
}
