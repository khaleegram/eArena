'use server';

import { adminDb, adminAuth } from '@/lib/firebase-admin';
import { Timestamp, FieldValue } from 'firebase-admin/firestore';
import type {
  Tournament,
  Team,
  Match,
  Standing,
  MatchReport,
  TeamMatchStats,
  PlayerStats,
  Badge,
  UnifiedTimestamp,
  MatchStatus,
  ReplayRequest,
  Notification,
} from '@/lib/types';
import { revalidatePath } from 'next/cache';
import { verifyMatchScores, type VerifyMatchScoresInput, type VerifyMatchScoresOutput } from '@/ai/flows/verify-match-scores';
import { getStorage } from 'firebase-admin/storage';
import { addDays, endOfDay, isPast, isAfter, format } from 'date-fns';
import { notifyUser, notifyMatchCaptains, getTeamCaptainId } from '@/lib/push-notify';
import { checkAndGrantAchievements } from './achievements';
import { sendNotification } from './notifications';
import { generateMatchSummary, type GenerateMatchSummaryInput } from '@/ai/flows/generate-match-summary';
import { isSwissRound } from '@/lib/swiss';

function toAdminDate(timestamp: UnifiedTimestamp): Date {
    if (typeof timestamp === 'string') {
        return new Date(timestamp);
    }
    if (timestamp instanceof Timestamp) {
        return timestamp.toDate();
    }
    if (timestamp instanceof Date) {
      return timestamp;
    }
    throw new Error('Invalid timestamp format for server-side processing.');
}

export async function notifyNextRoundCaptains(
  tournamentId: string,
  fixtures: { homeTeamId: string; awayTeamId: string; round?: string }[]
) {
  const teamIds = new Set<string>();
  for (const f of fixtures) {
    teamIds.add(f.homeTeamId);
    teamIds.add(f.awayTeamId);
  }
  const roundLabel = fixtures[0]?.round || 'the next round';
  await Promise.all(
    [...teamIds].map(async (teamId) => {
      const captainId = await getTeamCaptainId(tournamentId, teamId);
      if (!captainId) return;
      await notifyUser(
        captainId,
        {
          tournamentId,
          title: 'Your next match is up',
          body: `${roundLabel} fixtures are live. Open My Matches.`,
          href: `/tournaments/${tournamentId}?tab=my-matches`,
        },
        2
      );
    })
  );
}

async function awardBadges(tournamentId: string) {
    const tournamentDoc = await adminDb.collection('tournaments').doc(tournamentId).get();
    if (!tournamentDoc.exists) return;
    const tournament = tournamentDoc.data() as Tournament;

    const standingsSnapshot = await adminDb.collection('standings')
        .where('tournamentId', '==', tournamentId)
        .orderBy('ranking', 'asc')
        .limit(3)
        .get();
    
    if (standingsSnapshot.empty) return;

    for (const doc of standingsSnapshot.docs) {
        const standing = doc.data() as Standing;
        if (standing.ranking > 3) continue;

        const teamDoc = await adminDb.collection('tournaments').doc(tournamentId).collection('teams').doc(standing.teamId).get();
        if (!teamDoc.exists) continue;

        const team = teamDoc.data() as Team;
        const newBadge: Omit<Badge, 'id'> = {
            tournamentName: tournament.name,
            tournamentId: tournamentId,
            rank: standing.ranking,
            date: Timestamp.now(),
        };

        for (const player of team.players) {
            if (!player || !player.uid) continue;
            const userRef = adminDb.collection('users').doc(player.uid);
            
            const updateData: { badges: FieldValue, tournamentsWon?: FieldValue } = {
                badges: FieldValue.arrayUnion(newBadge)
            };
            if (standing.ranking === 1) {
                updateData.tournamentsWon = FieldValue.increment(1);
            }
            try {
                await userRef.update(updateData);
            } catch (error) {
                console.error(`Failed to update badges for player ${player.uid}:`, error);
                continue;
            }

            await sendNotification(player.uid, {
                userId: player.uid,
                tournamentId: tournament.id,
                title: `You Placed ${standing.ranking}${standing.ranking === 1 ? 'st' : standing.ranking === 2 ? 'nd' : 'rd'}!`,
                body: `Congratulations on your performance in ${tournament.name}.`,
                href: `/tournaments/${tournamentId}?tab=rewards`,
            });
             // Now check for achievements after awarding the badge
            await checkAndGrantAchievements(player.uid);
        }
    }
}


export async function uploadFileAndGetPublicURL(bucketPath: string, file: File, forceContentType?: string): Promise<string> {
    const bucket = getStorage().bucket(process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET);
    const buffer = Buffer.from(await file.arrayBuffer());
    const filePath = `${bucketPath}/${Date.now()}_${file.name}`;
    const fileRef = bucket.file(filePath);

    await fileRef.save(buffer, {
        metadata: { contentType: forceContentType || file.type },
    });
    
    await fileRef.makePublic();

    return fileRef.publicUrl();
}

async function triggerAIVerification(tournamentId: string, matchId: string): Promise<VerifyMatchScoresOutput> {
    const matchRef = adminDb.collection('tournaments').doc(tournamentId).collection('matches').doc(matchId);
    const tournamentRef = adminDb.collection('tournaments').doc(tournamentId);

    const [matchDoc, tournamentDoc] = await Promise.all([matchRef.get(), tournamentRef.get()]);
    if (!matchDoc.exists) throw new Error("Match not found for AI verification.");
    if (!tournamentDoc.exists) throw new Error("Tournament not found for AI verification.");

    const match = matchDoc.data() as Match;
    const tournament = tournamentDoc.data() as Tournament;

    const homeTeamDoc = await tournamentRef.collection('teams').doc(match.homeTeamId).get();
    const awayTeamDoc = await tournamentRef.collection('teams').doc(match.awayTeamId).get();
    if (!homeTeamDoc.exists || !awayTeamDoc.exists) throw new Error("Teams not found for AI verification.");

    const evidence = [];
    if (match.homeTeamReport?.evidenceUrl) evidence.push({ type: 'match_stats' as const, imageUri: match.homeTeamReport.evidenceUrl, teamName: homeTeamDoc.data()!.name });
    if (match.awayTeamReport?.evidenceUrl) evidence.push({ type: 'match_stats' as const, imageUri: match.awayTeamReport.evidenceUrl, teamName: awayTeamDoc.data()!.name });
    if (match.homeTeamSecondaryReport?.evidenceUrl) evidence.push({ type: 'match_history' as const, imageUri: match.homeTeamSecondaryReport.evidenceUrl, teamName: homeTeamDoc.data()!.name });
    if (match.awayTeamSecondaryReport?.evidenceUrl) evidence.push({ type: 'match_history' as const, imageUri: match.awayTeamSecondaryReport.evidenceUrl, teamName: awayTeamDoc.data()!.name });

    if (evidence.length === 0) {
        throw new Error("No evidence provided for AI verification.");
    }
    
    const aiInput: VerifyMatchScoresInput = {
        evidence,
        homeTeamName: homeTeamDoc.data()!.name,
        awayTeamName: awayTeamDoc.data()!.name,
        scheduledDate: toAdminDate(match.matchDay).toISOString(),
        roomCodeSetAt: match.roomCodeSetAt ? toAdminDate(match.roomCodeSetAt).toISOString() : undefined,
    };
    
    return await verifyMatchScores(aiInput);
}


export async function submitMatchResult(tournamentId: string, matchId: string, teamId: string, userId: string, formData: FormData) {
    const homeScoreRaw = formData.get('homeScore');
    const awayScoreRaw = formData.get('awayScore');
    const evidenceFile = formData.get('evidence') as File;
    const highlightUrl = formData.get('highlightUrl') as string | null;

    if (homeScoreRaw === null || awayScoreRaw === null || !evidenceFile || evidenceFile.size === 0) {
        throw new Error("Missing score or evidence file.");
    }
    const homeScore = Number(homeScoreRaw);
    const awayScore = Number(awayScoreRaw);

    const evidenceUrl = await uploadFileAndGetPublicURL(`tournaments/${tournamentId}/evidence`, evidenceFile, evidenceFile.type);
    
    const matchRef = adminDb.collection('tournaments').doc(tournamentId).collection('matches').doc(matchId);
    
    const report: Partial<MatchReport> = {
        reportedBy: userId,
        homeScore,
        awayScore,
        evidenceUrl,
        reportedAt: Timestamp.now(),
    };

    if (highlightUrl) {
      report.highlightUrl = highlightUrl;
    }
    
    const matchDoc = await matchRef.get();
    if (!matchDoc.exists) throw new Error("Match not found.");
    const matchData = matchDoc.data() as Match;
    const isHomeTeam = matchData.homeTeamId === teamId;
    
    const updateData: Partial<Match> & { status?: MatchStatus } = {};
    if (isHomeTeam) {
        updateData.homeTeamReport = report as MatchReport;
    } else {
        updateData.awayTeamReport = report as MatchReport;
    }
    
    await matchRef.update(updateData);
    
    const updatedMatchDoc = await matchRef.get();
    const updatedMatchData = updatedMatchDoc.data() as Match;

    // Phase 1 Immediate Processing: If both have submitted primary evidence, trigger AI now.
    if (updatedMatchData.homeTeamReport && updatedMatchData.awayTeamReport) {
      try {
        const result = await triggerAIVerification(tournamentId, matchId);
        await handleAIVerificationResult(tournamentId, matchId, result);
      } catch (error: any) {
        console.error(`AI Verification failed for match ${matchId}:`, error);
        await matchRef.update({ status: 'disputed', resolutionNotes: `AI verification failed: ${error.message}`});
        const tournament = (await adminDb.collection('tournaments').doc(tournamentId).get()).data() as Tournament | undefined;
        await notifyMatchCaptains(
          tournamentId,
          updatedMatchData,
          {
            tournamentId,
            title: 'Match disputed',
            body: 'AI verification failed. Check My Matches ΓÇö evidence or a rematch may be needed.',
            href: `/tournaments/${tournamentId}?tab=my-matches`,
          },
          1
        );
        if (tournament?.organizerId) {
          await notifyUser(tournament.organizerId, {
            tournamentId,
            title: 'Match disputed',
            body: `A match in "${tournament.name}" needs your attention.`,
            href: `/tournaments/${tournamentId}?tab=fixtures`,
          }, 1);
        }
      }
    } else {
      await matchRef.update({ status: 'awaiting_confirmation' });
      // #1 Opponent submitted a score ΓÇö notify the other captain
      const opponentTeamId = isHomeTeam ? updatedMatchData.awayTeamId : updatedMatchData.homeTeamId;
      const opponentCaptainId = await getTeamCaptainId(tournamentId, opponentTeamId);
      if (opponentCaptainId && opponentCaptainId !== userId) {
        await notifyUser(opponentCaptainId, {
          tournamentId,
          title: 'Opponent submitted a score',
          body: 'Confirm or dispute now ΓÇö open My Matches.',
          href: `/tournaments/${tournamentId}?tab=my-matches`,
        }, 1);
      }
    }

    revalidatePath(`/tournaments/${tournamentId}`);
}

export async function submitSecondaryEvidence(tournamentId: string, matchId: string, teamId: string, userId: string, formData: FormData) {
    const evidenceFile = formData.get('evidence') as File;
    if (!evidenceFile || evidenceFile.size === 0) throw new Error("Missing evidence file.");

    const evidenceUrl = await uploadFileAndGetPublicURL(`tournaments/${tournamentId}/evidence`, evidenceFile, evidenceFile.type);
    const matchRef = adminDb.collection('tournaments').doc(tournamentId).collection('matches').doc(matchId);

    const report: MatchReport = {
        reportedBy: userId,
        homeScore: -1, 
        awayScore: -1,
        evidenceUrl,
        reportedAt: Timestamp.now(),
    };
    
    const currentMatch = (await matchRef.get()).data() as Match;
    const isHomeTeam = currentMatch.homeTeamId === teamId;
    
    const updateData: Partial<Match> = {};
    if (isHomeTeam) {
        updateData.homeTeamSecondaryReport = report;
    } else {
        updateData.awayTeamSecondaryReport = report;
    }
    await matchRef.update(updateData);

    // Now, fetch the updated doc and check if both have submitted
    const updatedMatchDoc = await matchRef.get();
    const updatedMatchData = updatedMatchDoc.data() as Match;

    // Wait for the second report before triggering verification
    if (updatedMatchData.homeTeamSecondaryReport && updatedMatchData.awayTeamSecondaryReport) {
        try {
            const result = await triggerAIVerification(tournamentId, matchId);
            await handleAIVerificationResult(tournamentId, matchId, result);
        } catch (error: any) {
            console.error(`AI Verification failed for match ${matchId}:`, error);
            await matchRef.update({ status: 'disputed', resolutionNotes: `AI verification failed: ${error.message}`});
            await notifyMatchCaptains(
              tournamentId,
              updatedMatchData,
              {
                tournamentId,
                title: 'Match disputed',
                body: 'Secondary verification failed. Check My Matches.',
                href: `/tournaments/${tournamentId}?tab=my-matches`,
              },
              1
            );
        }
    }

    revalidatePath(`/tournaments/${tournamentId}`);
}

function calculatePerformancePointsForTeam(match: Match, teamStats: TeamMatchStats, isHomeTeam: boolean): number {
    let points = 0;
    const playerScore = isHomeTeam ? match.homeScore! : match.awayScore!;
    const opponentScore = isHomeTeam ? match.awayScore! : match.homeScore!;

    if (playerScore > opponentScore) points += 10; // Win
    if (playerScore === opponentScore) points += 5; // Draw
    if (opponentScore === 0) points += 5; // Clean Sheet
    points += playerScore; // Each Goal Scored
    if (teamStats.shotsOnTarget) points += Math.floor(teamStats.shotsOnTarget / 2); // Shots on Target
    if (teamStats.interceptions) points += Math.floor(teamStats.interceptions / 10); // Interceptions
    if (teamStats.tackles) points += Math.floor(teamStats.tackles / 5); // Tackles
    if (teamStats.saves) points += teamStats.saves; // Saves
    if (teamStats.possession > 50) points += 2; // Possession
    if (teamStats.passes > 0 && (teamStats.successfulPasses / teamStats.passes) > 0.75) points += 2; // Pass Accuracy
    if (teamStats.fouls === 0 && teamStats.offsides === 0) points += 2; // Fair Play

    return points;
}

async function updatePlayerAndTeamStatsForMatch(tournamentId: string, match: Match, applyStatsPenalty: boolean, forfeitingPlayerId?: string) {
    const tournamentDoc = await adminDb.collection('tournaments').doc(tournamentId).get();
    if (!tournamentDoc.exists) {
        console.error("Tournament not found for stat update");
        return;
    }
    const tournamentName = tournamentDoc.data()!.name;

    const homeTeamRef = adminDb.collection('tournaments').doc(tournamentId).collection('teams').doc(match.homeTeamId);
    const awayTeamRef = adminDb.collection('tournaments').doc(tournamentId).collection('teams').doc(match.awayTeamId);

    const [homeTeamDoc, awayTeamDoc] = await Promise.all([homeTeamRef.get(), awayTeamRef.get()]);
    if (!homeTeamDoc.exists || !awayTeamDoc.exists) {
        console.error("Could not find teams to update stats.");
        return;
    }
    
    const homeTeam = homeTeamDoc.data() as Team;
    const awayTeam = awayTeamDoc.data() as Team;

    let homePerfPoints = 0;
    let awayPerfPoints = 0;
    if (match.homeTeamStats) homePerfPoints = calculatePerformancePointsForTeam(match, match.homeTeamStats, true);
    if (match.awayTeamStats) awayPerfPoints = calculatePerformancePointsForTeam(match, match.awayTeamStats, false);
    
    // Update team performance points
    await Promise.all([
        homeTeamRef.update({ performancePoints: FieldValue.increment(homePerfPoints) }),
        awayTeamRef.update({ performancePoints: FieldValue.increment(awayPerfPoints) }),
    ]);

    const playersToUpdate = [
        { captainId: homeTeam.captainId, isHome: true },
        { captainId: awayTeam.captainId, isHome: false }
    ];

    for (const player of playersToUpdate) {
        await adminDb.runTransaction(async (transaction) => {
            const statsRef = adminDb.collection('playerStats').doc(player.captainId);
            const statsDoc = await transaction.get(statsRef);
            const stats = statsDoc.exists ? statsDoc.data() as PlayerStats : createDefaultPlayerStats(player.captainId);
            
            let localPenalty = applyStatsPenalty || (forfeitingPlayerId === player.captainId);
            updateSinglePlayerStats(stats, tournamentId, tournamentName, match, player.isHome, localPenalty);
            
            transaction.set(statsRef, stats);
        });
    }
}


function createDefaultPlayerStats(uid: string): PlayerStats {
  return {
    uid,
    totalMatches: 0,
    totalWins: 0,
    totalLosses: 0,
    totalDraws: 0,
    totalGoals: 0,
    totalConceded: 0,
    totalCleanSheets: 0,
    avgPossession: 0,
    totalPassPercentageSum: 0,
    matchesWithPassStats: 0,
    totalShots: 0,
    totalShotsOnTarget: 0,
    totalPasses: 0,
    totalTackles: 0,
    totalInterceptions: 0,
    totalSaves: 0,
    performanceHistory: [],
  };
}

function updateSinglePlayerStats(stats: PlayerStats, tournamentId: string, tournamentName: string, match: Match, isHomePlayer: boolean, applyStatsPenalty: boolean) {
  stats.totalMatches++;

  const playerScore = isHomePlayer ? match.homeScore! : match.awayScore!;
  const opponentScore = isHomePlayer ? match.awayScore! : match.homeScore!;

  if (playerScore > opponentScore) stats.totalWins++;
  else if (playerScore < opponentScore) stats.totalLosses++;
  else stats.totalDraws++;

  stats.totalGoals += playerScore;
  stats.totalConceded += opponentScore;
  if (opponentScore === 0) stats.totalCleanSheets++;
  
  const playerMatchStats = isHomePlayer ? match.homeTeamStats : match.awayTeamStats;

  if (playerMatchStats && !applyStatsPenalty) {
      if (playerMatchStats.passes > 0 && playerMatchStats.successfulPasses !== undefined) {
        const passPercentage = (playerMatchStats.successfulPasses / playerMatchStats.passes) * 100;
        stats.totalPassPercentageSum = (stats.totalPassPercentageSum || 0) + passPercentage;
        stats.matchesWithPassStats = (stats.matchesWithPassStats || 0) + 1;
      }
      stats.totalShots += playerMatchStats.shots || 0;
      stats.totalShotsOnTarget += playerMatchStats.shotsOnTarget || 0;
      stats.totalPasses += playerMatchStats.passes || 0;
      stats.totalTackles += playerMatchStats.tackles || 0;
      stats.totalInterceptions += playerMatchStats.interceptions || 0;
      stats.totalSaves += playerMatchStats.saves || 0;
  }
  
  if (stats.matchesWithPassStats > 0) {
    stats.avgPossession = Math.round(stats.totalPassPercentageSum! / stats.matchesWithPassStats);
  } else {
    stats.avgPossession = stats.avgPossession || 0;
  }

  let perfPoint = stats.performanceHistory.find(p => p.tournamentId === tournamentId);
  if (perfPoint) {
      perfPoint.matchesPlayed++;
      perfPoint.goals += playerScore;
  } else {
      stats.performanceHistory.push({
          tournamentId,
          tournamentName,
          goals: playerScore,
          assists: 0, // Placeholder
          matchesPlayed: 1,
      });
  }
}

export async function approveMatchResult(tournamentId: string, matchId: string, homeScore: number, awayScore: number, notes?: string, applyStatsPenalty: boolean = false, homeStats?: TeamMatchStats, awayStats?: TeamMatchStats, forfeitingPlayerId?: string, wasAutoForfeited: boolean = false) {
    const batch = adminDb.batch();
    const matchRef = adminDb.collection('tournaments').doc(tournamentId).collection('matches').doc(matchId);
    
    const matchDoc = await matchRef.get();
    if (!matchDoc.exists) throw new Error("Match not found while trying to approve.");
    const matchData = matchDoc.data() as Match;

    let highlightUrl: string | undefined = undefined;
    
    // Prioritize winner's highlight
    if (homeScore > awayScore) {
        highlightUrl = matchData.homeTeamReport?.highlightUrl || matchData.awayTeamReport?.highlightUrl;
    } else if (awayScore > homeScore) {
        highlightUrl = matchData.awayTeamReport?.highlightUrl || matchData.homeTeamReport?.highlightUrl;
    } else { // On a draw, take home team's first, then away
        highlightUrl = matchData.homeTeamReport?.highlightUrl || matchData.awayTeamReport?.highlightUrl;
    }

    const updateData: any = {
        status: 'approved',
        homeScore,
        awayScore,
        resolutionNotes: notes || "Result approved.",
        wasAutoForfeited,
    };
    if (homeStats) updateData.homeTeamStats = homeStats;
    if (awayStats) updateData.awayStats = awayStats;
    if (highlightUrl) {
      updateData.highlightUrl = highlightUrl;
    }
    
    // Call the summary generation flow
    try {
        const homeTeamDoc = await adminDb.collection('tournaments').doc(tournamentId).collection('teams').doc(matchData.homeTeamId).get();
        const awayTeamDoc = await adminDb.collection('tournaments').doc(tournamentId).collection('teams').doc(matchData.awayTeamId).get();

        if (homeTeamDoc.exists && awayTeamDoc.exists) {
            const summaryInput: GenerateMatchSummaryInput = {
                homeTeam: {
                    name: homeTeamDoc.data()!.name,
                    score: homeScore,
                    shotsOnTarget: homeStats?.shotsOnTarget,
                    possession: homeStats?.possession,
                    saves: homeStats?.saves
                },
                awayTeam: {
                    name: awayTeamDoc.data()!.name,
                    score: awayScore,
                    shotsOnTarget: awayStats?.shotsOnTarget,
                    possession: awayStats?.possession,
                    saves: awayStats?.saves
                }
            };
            const summaryResult = await generateMatchSummary(summaryInput);
            updateData.summary = summaryResult.summary;
        }
    } catch (e) {
        console.error("AI Match Summary generation failed:", e);
        // Do not block match approval if summary fails
    }


    batch.update(matchRef, updateData);
    
    await batch.commit();

    const updatedMatchDoc = await matchRef.get();
    const approvedMatch = updatedMatchDoc.data() as Match;
    await updatePlayerAndTeamStatsForMatch(tournamentId, approvedMatch, applyStatsPenalty, forfeitingPlayerId);
    
    // Check achievements for both players after stats update
    const homeTeamDoc = await adminDb.collection('tournaments').doc(tournamentId).collection('teams').doc(approvedMatch.homeTeamId).get();
    const awayTeamDoc = await adminDb.collection('tournaments').doc(tournamentId).collection('teams').doc(approvedMatch.awayTeamId).get();
    const homeCaptainId = homeTeamDoc.data()?.captainId;
    const awayCaptainId = awayTeamDoc.data()?.captainId;
    if(homeCaptainId) await checkAndGrantAchievements(homeCaptainId);
    if(awayCaptainId) await checkAndGrantAchievements(awayCaptainId);
    
    await updateStandings(tournamentId);

    // #3 / #4 Result approved (+ forfeit copy when applicable)
    const homeName = homeTeamDoc.data()?.name || 'Home';
    const awayName = awayTeamDoc.data()?.name || 'Away';
    const isForfeit = wasAutoForfeited || (notes || '').toLowerCase().includes('forfeit');
    const hrefMy = `/tournaments/${tournamentId}?tab=my-matches`;
    const hrefStandings = `/tournaments/${tournamentId}?tab=standings`;

    const outcomeFor = (isHome: boolean) => {
      if (homeScore > awayScore) return isHome ? 'won' : 'lost';
      if (awayScore > homeScore) return isHome ? 'lost' : 'won';
      return 'drew';
    };

    if (homeCaptainId) {
      const outcome = outcomeFor(true);
      if (isForfeit && outcome === 'won') {
        await notifyUser(homeCaptainId, {
          tournamentId,
          title: 'Opponent forfeited ΓÇö you win!',
          body: `Final ${homeScore}ΓÇô${awayScore} vs ${awayName}. Check standings.`,
          href: hrefStandings,
        }, 1);
      } else if (isForfeit && outcome === 'lost') {
        await notifyUser(homeCaptainId, {
          tournamentId,
          title: 'Match recorded as forfeit',
          body: `Final ${homeScore}ΓÇô${awayScore} vs ${awayName}.`,
          href: hrefMy,
        }, 2);
      } else {
        await notifyUser(homeCaptainId, {
          tournamentId,
          title: outcome === 'won' ? 'You won!' : outcome === 'lost' ? 'Match result in' : "It's a draw",
          body: `Final ${homeScore}ΓÇô${awayScore} vs ${awayName}. Check standings.`,
          href: hrefStandings,
        }, 2);
      }
    }
    if (awayCaptainId) {
      const outcome = outcomeFor(false);
      if (isForfeit && outcome === 'won') {
        await notifyUser(awayCaptainId, {
          tournamentId,
          title: 'Opponent forfeited ΓÇö you win!',
          body: `Final ${homeScore}ΓÇô${awayScore} vs ${homeName}. Check standings.`,
          href: hrefStandings,
        }, 1);
      } else if (isForfeit && outcome === 'lost') {
        await notifyUser(awayCaptainId, {
          tournamentId,
          title: 'Match recorded as forfeit',
          body: `Final ${homeScore}ΓÇô${awayScore} vs ${homeName}.`,
          href: hrefMy,
        }, 2);
      } else {
        await notifyUser(awayCaptainId, {
          tournamentId,
          title: outcome === 'won' ? 'You won!' : outcome === 'lost' ? 'Match result in' : "It's a draw",
          body: `Final ${homeScore}ΓÇô${awayScore} vs ${homeName}. Check standings.`,
          href: hrefStandings,
        }, 2);
      }
    }

    // Finalize tournament
    // IMPORTANT:
    // - League can complete when all matches are approved
    // - Bracket formats (Cup, Champions League Swiss->Knockout, Double-elimination) should complete ONLY when the Final is approved.
    const tournamentRef = adminDb.collection('tournaments').doc(tournamentId);
    const tournamentData = (await tournamentRef.get()).data() as Tournament | undefined;

    const allMatchesSnapshot = await tournamentRef.collection('matches').get();
    const allMatchesApproved = allMatchesSnapshot.docs.every(doc => doc.data().status === 'approved');

    const finalMatchDoc = allMatchesSnapshot.docs.find(doc => (doc.data().round || '').toLowerCase() === 'final');
    const finalApproved = !!finalMatchDoc && finalMatchDoc.data().status === 'approved';

    const shouldComplete =
        tournamentData?.format === 'league'
            ? allMatchesApproved
            : finalApproved;

    if (shouldComplete) {
        await tournamentRef.update({ status: 'completed' });
        await awardBadges(tournamentId);

        if (tournamentData) {
            const organizerNotification: Omit<Notification, 'id' | 'createdAt' | 'isRead'> = {
                userId: tournamentData.organizerId,
                tournamentId,
                title: `"${tournamentData.name}" has concluded!`,
                body: "The tournament is complete. Check out the results and rewards.",
                href: `/tournaments/${tournamentId}?tab=standings`,
            };
            await sendNotification(tournamentData.organizerId, organizerNotification);
        }
    }

    revalidatePath(`/tournaments/${tournamentId}`);
}

export async function deleteMatchReport(tournamentId: string, matchId: string, userId: string) {
    const matchRef = adminDb.collection('tournaments').doc(tournamentId).collection('matches').doc(matchId);
    const matchDoc = await matchRef.get();
    if (!matchDoc.exists) throw new Error("Match not found.");
    
    const matchData = matchDoc.data() as Match;
    
    const updateData: any = { status: 'scheduled' };
    if (matchData.homeTeamReport?.reportedBy === userId) {
        updateData.homeTeamReport = FieldValue.delete();
    }
    if (matchData.awayTeamReport?.reportedBy === userId) {
        updateData.awayTeamReport = FieldValue.delete();
    }
    
    await matchRef.update(updateData);
    revalidatePath(`/tournaments/${tournamentId}`);
}

export async function scheduleRematch(tournamentId: string, matchId: string, notes: string) {
    const matchRef = adminDb.collection('tournaments').doc(tournamentId).collection('matches').doc(matchId);
    const matchDoc = await matchRef.get();
    if (!matchDoc.exists) throw new Error("Match not found");
    const matchData = matchDoc.data() as Match;
    
    const tournamentRef = adminDb.collection('tournaments').doc(tournamentId);
    const tournamentDoc = await tournamentRef.get();
    if (!tournamentDoc.exists) throw new Error("Tournament not found");
    const tournamentData = tournamentDoc.data() as Tournament;

    let newMatchDay: Date;

    if (tournamentData.format === 'cup') {
        newMatchDay = toAdminDate(matchData.matchDay); // Replay on the same day for cups
    } else { // League format
        const allMatchesSnapshot = await tournamentRef.collection('matches').orderBy('matchDay', 'desc').get();
        const lastMatchDay = allMatchesSnapshot.empty ? toAdminDate(tournamentData.tournamentStartDate) : toAdminDate(allMatchesSnapshot.docs[0].data().matchDay);
        newMatchDay = addDays(lastMatchDay, 1);
        if(isAfter(newMatchDay, toAdminDate(tournamentData.tournamentEndDate))) {
            // If the new date is past the end date, just schedule it for the last day
            newMatchDay = toAdminDate(tournamentData.tournamentEndDate);
        }
    }
    
    await matchRef.update({
        status: 'scheduled',
        homeScore: null,
        awayScore: null,
        homeTeamReport: FieldValue.delete(),
        awayTeamReport: FieldValue.delete(),
        homeTeamSecondaryReport: FieldValue.delete(),
        awayTeamSecondaryReport: FieldValue.delete(),
        homeTeamStats: FieldValue.delete(),
        awayTeamStats: FieldValue.delete(),
        resolutionNotes: `Rematch ordered: ${notes}`,
        wasAutoForfeited: false,
        replayRequest: FieldValue.delete(),
        matchDay: Timestamp.fromDate(newMatchDay),
        isReplay: true,
    });

    const homeTeamDoc = await adminDb.collection('tournaments').doc(tournamentId).collection('teams').doc(matchData.homeTeamId).get();
    const awayTeamDoc = await adminDb.collection('tournaments').doc(tournamentId).collection('teams').doc(matchData.awayTeamId).get();
    
    const homeTeamCaptainId = homeTeamDoc.data()?.captainId;
    const awayTeamCaptainId = awayTeamDoc.data()?.captainId;

    const notification = {
        tournamentId,
        title: "Rematch Ordered!",
        body: `Your match has been reset. Please play again on ${format(newMatchDay, 'PPP')}.`,
        href: `/tournaments/${tournamentId}?tab=my-matches`,
    };

    if(homeTeamCaptainId) await sendNotification(homeTeamCaptainId, {...notification, userId: homeTeamCaptainId, body: `Your match vs ${awayTeamDoc.data()?.name} has been reset. Please play again on ${format(newMatchDay, 'PPP')}. Reason: ${notes}`});
    if(awayTeamCaptainId) await sendNotification(awayTeamCaptainId, {...notification, userId: awayTeamCaptainId, body: `Your match vs ${homeTeamDoc.data()?.name} has been reset. Please play again on ${format(newMatchDay, 'PPP')}. Reason: ${notes}`});
    
    revalidatePath(`/tournaments/${tournamentId}`);
}

function revertSinglePlayerStats(stats: PlayerStats, tournamentId: string, tournamentName: string, match: Match, isHomePlayer: boolean) {
    if (!match || match.homeScore === null || match.awayScore === null) return;
    
    if (stats.totalMatches > 0) stats.totalMatches--;

    const homeScore = match.homeScore!;
    const awayScore = match.awayScore!;

    const goalsFor = isHomePlayer ? homeScore : awayScore;
    const goalsAgainst = isHomePlayer ? awayScore : homeScore;

    if (goalsFor > goalsAgainst) {
        if (stats.totalWins > 0) stats.totalWins--;
    } else if (goalsFor < goalsAgainst) {
        if (stats.totalLosses > 0) stats.totalLosses--;
    } else {
        if (stats.totalDraws > 0) stats.totalDraws--;
    }

    stats.totalGoals = Math.max(0, stats.totalGoals - goalsFor);
    stats.totalConceded = Math.max(0, (stats.totalConceded || 0) - goalsAgainst);

    if (goalsAgainst === 0 && stats.totalCleanSheets > 0) {
        stats.totalCleanSheets--;
    }

    const playerMatchStats = isHomePlayer ? match.homeTeamStats : match.awayTeamStats;

    if (playerMatchStats) {
        if (playerMatchStats.passes > 0 && playerMatchStats.successfulPasses !== undefined) {
            const passPercentage = (playerMatchStats.successfulPasses / playerMatchStats.passes) * 100;
            if (stats.totalPassPercentageSum) stats.totalPassPercentageSum -= passPercentage;
            if (stats.matchesWithPassStats) stats.matchesWithPassStats -= 1;
        }
        stats.totalShots = Math.max(0, stats.totalShots - (playerMatchStats.shots || 0));
        stats.totalShotsOnTarget = Math.max(0, stats.totalShotsOnTarget - (playerMatchStats.shotsOnTarget || 0));
        stats.totalPasses = Math.max(0, stats.totalPasses - (playerMatchStats.passes || 0));
        stats.totalTackles = Math.max(0, stats.totalTackles - (playerMatchStats.tackles || 0));
        stats.totalInterceptions = Math.max(0, stats.totalInterceptions - (playerMatchStats.interceptions || 0));
        stats.totalSaves = Math.max(0, stats.totalSaves - (playerMatchStats.saves || 0));
    }
    
    if (stats.matchesWithPassStats && stats.matchesWithPassStats > 0) {
        stats.avgPossession = Math.round(stats.totalPassPercentageSum! / stats.matchesWithPassStats);
    } else {
        stats.avgPossession = 0;
    }

    let perfPoint = stats.performanceHistory.find(p => p.tournamentId === tournamentId);
    if (perfPoint) {
        if (perfPoint.matchesPlayed > 1) {
            perfPoint.matchesPlayed--;
            perfPoint.goals = Math.max(0, perfPoint.goals - goalsFor);
        } else {
            // Remove the performance point if this was the only match
            stats.performanceHistory = stats.performanceHistory.filter(p => p.tournamentId !== tournamentId);
        }
    }
}

function revertTeamPerformancePoints(match: Match, isHomeTeam: boolean) {
    if (!match || match.homeScore === null || match.awayScore === null) return 0;
    const teamStats = isHomeTeam ? match.homeTeamStats : match.awayTeamStats;
    if (!teamStats) return 0;
    return calculatePerformancePointsForTeam(match, teamStats, isHomeTeam);
}

export async function organizerForceReplay(tournamentId: string, matchId: string, organizerId: string, reason: string) {
    const tournamentRef = adminDb.collection('tournaments').doc(tournamentId);
    const matchRef = tournamentRef.collection('matches').doc(matchId);

    // --- Transaction Phase ---
    await adminDb.runTransaction(async (transaction) => {
        // --- READS ---
        const tournamentDoc = await transaction.get(tournamentRef);
        if (!tournamentDoc.exists || tournamentDoc.data()?.organizerId !== organizerId) {
            throw new Error("You are not authorized to perform this action.");
        }
        const tournament = tournamentDoc.data() as Tournament;

        const matchDoc = await transaction.get(matchRef);
        if (!matchDoc.exists) throw new Error("Match not found.");
        const match = matchDoc.data() as Match;

        let homeCaptainStats: PlayerStats | undefined;
        let awayCaptainStats: PlayerStats | undefined;
        let homeTeamDoc;
        let awayTeamDoc;
        
        if (match.status === 'approved') {
            const homeTeamRef = tournamentRef.collection('teams').doc(match.homeTeamId);
            const awayTeamRef = tournamentRef.collection('teams').doc(match.awayTeamId);
            homeTeamDoc = await transaction.get(homeTeamRef);
            awayTeamDoc = await transaction.get(awayTeamRef);

            if (homeTeamDoc.exists && awayTeamDoc.exists) {
                const homeTeam = homeTeamDoc.data() as Team;
                const awayTeam = awayTeamDoc.data() as Team;

                const homeCaptainStatsDoc = await transaction.get(adminDb.collection('playerStats').doc(homeTeam.captainId));
                const awayCaptainStatsDoc = await transaction.get(adminDb.collection('playerStats').doc(awayTeam.captainId));

                if (homeCaptainStatsDoc.exists) homeCaptainStats = homeCaptainStatsDoc.data() as PlayerStats;
                if (awayCaptainStatsDoc.exists) awayCaptainStats = awayCaptainStatsDoc.data() as PlayerStats;
            }
        }

        // --- COMPUTES (In Memory) ---
        if (homeCaptainStats && homeTeamDoc?.exists) {
            revertSinglePlayerStats(homeCaptainStats, tournamentId, tournament.name, match, true);
        }
        if (awayCaptainStats && awayTeamDoc?.exists) {
            revertSinglePlayerStats(awayCaptainStats, tournamentId, tournament.name, match, false);
        }

        // --- WRITES ---
        if (homeCaptainStats && homeTeamDoc?.exists) {
            const homeStatsRef = adminDb.collection('playerStats').doc((homeTeamDoc.data() as Team).captainId);
            transaction.set(homeStatsRef, homeCaptainStats);
            const homeTeamRef = tournamentRef.collection('teams').doc(match.homeTeamId);
            const pointsToRevert = revertTeamPerformancePoints(match, true);
            transaction.update(homeTeamRef, { performancePoints: FieldValue.increment(-pointsToRevert) });
        }
        if (awayCaptainStats && awayTeamDoc?.exists) {
            const awayStatsRef = adminDb.collection('playerStats').doc((awayTeamDoc.data() as Team).captainId);
            transaction.set(awayStatsRef, awayCaptainStats);
            const awayTeamRef = tournamentRef.collection('teams').doc(match.awayTeamId);
            const pointsToRevert = revertTeamPerformancePoints(match, false);
            transaction.update(awayTeamRef, { performancePoints: FieldValue.increment(-pointsToRevert) });
        }
        
        transaction.update(matchRef, {
            status: 'scheduled',
            homeScore: null,
            awayScore: null,
            homeTeamReport: FieldValue.delete(),
            awayTeamReport: FieldValue.delete(),
            homeTeamSecondaryReport: FieldValue.delete(),
            awayTeamSecondaryReport: FieldValue.delete(),
            homeTeamStats: FieldValue.delete(),
            awayTeamStats: FieldValue.delete(),
            resolutionNotes: `Organizer forced replay: ${reason}`,
            wasAutoForfeited: false,
            replayRequest: FieldValue.delete(),
            matchDay: Timestamp.fromDate(toAdminDate(match.matchDay)),
            isReplay: true,
        });
    });
    
    await updateStandings(tournamentId);
    revalidatePath(`/tournaments/${tournamentId}`);
}

export async function updateStandings(tournamentId: string) {
    const tournamentDoc = await adminDb.collection('tournaments').doc(tournamentId).get();
    const tournament = tournamentDoc.exists ? (tournamentDoc.data() as Tournament) : null;
    const teamsSnapshot = await adminDb.collection('tournaments').doc(tournamentId).collection('teams').get();
    if (teamsSnapshot.empty) return;

    const teamStatsList = teamsSnapshot.docs.map(doc => ({
        teamId: doc.id,
        matchesPlayed: 0,
        wins: 0,
        losses: 0,
        draws: 0,
        goalsFor: 0,
        goalsAgainst: 0,
        points: 0,
        cleanSheets: 0
    }));

    let matchesQuery = adminDb.collection('tournaments').doc(tournamentId).collection('matches')
        .where('status', '==', 'approved');

    const matchesSnapshot = await matchesQuery.get();
    const swissOnly = tournament?.format === 'swiss';
    
    matchesSnapshot.docs.forEach(doc => {
        const match = doc.data() as Match;
        if (match.homeScore === null || match.awayScore === null) return;
        // Swiss table is league-phase only; knockout results must not rewrite rankings.
        if (swissOnly && !isSwissRound(match.round)) return;
        
        const homeStats = teamStatsList.find(s => s.teamId === match.homeTeamId);
        const awayStats = teamStatsList.find(s => s.teamId === match.awayTeamId);

        if (!homeStats || !awayStats) return;

        homeStats.matchesPlayed++;
        awayStats.matchesPlayed++;
        homeStats.goalsFor += match.homeScore;
        awayStats.goalsFor += match.awayScore;
        homeStats.goalsAgainst += match.awayScore;
        awayStats.goalsAgainst += match.homeScore;

        if (match.homeScore > match.awayScore) {
            homeStats.wins++;
            homeStats.points += 3;
            awayStats.losses++;
        } else if (match.awayScore > match.homeScore) {
            awayStats.wins++;
            awayStats.points += 3;
            homeStats.losses++;
        } else {
            homeStats.draws++;
            awayStats.draws++;
            homeStats.points++;
            awayStats.points++;
        }

        if (match.awayScore === 0) homeStats.cleanSheets++;
        if (match.homeScore === 0) awayStats.cleanSheets++;
    });

    const goalDifferences = new Map<string, number>();
    teamStatsList.forEach(team => {
        goalDifferences.set(team.teamId, team.goalsFor - team.goalsAgainst);
    });

    teamStatsList.sort((a, b) => {
        if (b.points !== a.points) return b.points - a.points;
        const gdA = goalDifferences.get(a.teamId) ?? 0;
        const gdB = goalDifferences.get(b.teamId) ?? 0;
        if (gdB !== gdA) return gdB - gdA;
        if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
        return a.wins - b.wins;
    });

    const batch = adminDb.batch();
    const standingsRef = adminDb.collection('standings');
    
    const oldStandingsSnapshot = await standingsRef.where('tournamentId', '==', tournamentId).get();
    oldStandingsSnapshot.docs.forEach(doc => batch.delete(doc.ref));

    teamStatsList.forEach((team, index) => {
        const docRef = standingsRef.doc(`${tournamentId}_${team.teamId}`);
        const standingData = {
            ...team,
            tournamentId,
            ranking: index + 1
        };
        batch.set(docRef, standingData);
    });

    await batch.commit();
    revalidatePath(`/tournaments/${tournamentId}`);
}


async function resolveOverdueMatches(tournamentId: string) {
    const tournamentRef = adminDb.collection('tournaments').doc(tournamentId);
    
    const overdueSnapshot = await tournamentRef.collection('matches')
        .where('status', 'in', ['scheduled', 'awaiting_confirmation', 'needs_secondary_evidence', 'disputed'])
        .get();

    if (overdueSnapshot.empty) return 0;
    
    const tournamentDoc = await tournamentRef.get();
    if (!tournamentDoc.exists) return 0;
    const tournament = tournamentDoc.data() as Tournament;
    
    let resolvedCount = 0;
    for (const doc of overdueSnapshot.docs) {
        const match = doc.data() as Match;
        
        // Match day must be fully in the past.
        if (!isPast(endOfDay(toAdminDate(match.matchDay)))) {
            continue;
        }

        resolvedCount++;
        try {
            // CUP REPLAY FORFEIT LOGIC
            if (match.isReplay && tournament.format === 'cup') {
                await approveMatchResult(tournamentId, doc.id, 0, 0, 'Double forfeit. Replay was not completed by the match day deadline.', true, undefined, undefined, undefined, true);
                continue;
            }

            // Both players failed to submit anything.
            if (match.status === 'scheduled') {
                await approveMatchResult(tournamentId, doc.id, 0, 0, 'Match recorded as 0-0 draw due to no reports submitted.', true, undefined, undefined, undefined, true);
            } 
            // Only one player submitted a primary report.
            else if (match.status === 'awaiting_confirmation') {
                const result = await triggerAIVerification(tournamentId, doc.id);
                // Even with one screenshot, the AI should be able to verify it and extract stats.
                // We award a 3-0 forfeit win to the player who submitted.
                const submittingPlayerIsHome = !!match.homeTeamReport;
                await approveMatchResult(
                    tournamentId, 
                    doc.id, 
                    submittingPlayerIsHome ? 3 : 0, 
                    submittingPlayerIsHome ? 0 : 3, 
                    'Approved by forfeit. Opponent failed to report in time.', 
                    false, // Do not apply stats penalty to the winner
                    result.homeStats, 
                    result.awayStats, 
                    submittingPlayerIsHome ? match.awayTeamId : match.homeTeamId, 
                    true
                );
            } 
            // Players submitted conflicting primary/secondary reports, but failed to resolve by deadline.
            else if (match.status === 'needs_secondary_evidence' || match.status === 'disputed') {
                const result = await triggerAIVerification(tournamentId, doc.id);
                await handleAIVerificationResult(tournamentId, doc.id, result);
            }
        } catch (error: any) {
             console.error(`Failed to resolve overdue match ${doc.id}:`, error);
             const safeErrorMessage = `Automated resolution failed. Organizer review required.`.substring(0, 200);
             try {
                 await doc.ref.update({ status: 'disputed', resolutionNotes: safeErrorMessage });
             } catch (updateError) {
                 console.error(`Failed to even update match ${doc.id} to disputed status:`, updateError);
             }
        }
    }
    return resolvedCount;
}

export async function organizerResolveOverdueMatches(tournamentId: string, organizerId: string) {
    const tournamentRef = adminDb.collection('tournaments').doc(tournamentId);
    const tournamentDoc = await tournamentRef.get();
    if (!tournamentDoc.exists || tournamentDoc.data()?.organizerId !== organizerId) {
        throw new Error("You are not authorized to perform this action.");
    }
    
    // Prevent spamming the function
    const lastResolved = tournamentDoc.data()?.lastAutoResolvedAt;
    if (lastResolved) {
        const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000); 
        if (toAdminDate(lastResolved) > fifteenMinutesAgo) {
            throw new Error("Resolution can only be run once every 15 minutes to ensure stability.");
        }
    }
    await tournamentRef.update({ lastAutoResolvedAt: FieldValue.serverTimestamp() });
    
    const count = await resolveOverdueMatches(tournamentId);
    
    if (count > 0) {
        revalidatePath(`/tournaments/${tournamentId}`);
    }
    return count;
}


async function handleAIVerificationResult(tournamentId: string, matchId: string, result: VerifyMatchScoresOutput) {
    const matchRef = adminDb.collection('tournaments').doc(tournamentId).collection('matches').doc(matchId);
    
    if (result.cheatingFlag) {
        const userToWarnRef = adminDb.collection('users').doc(result.cheatingFlag);
        await userToWarnRef.update({
            warnings: FieldValue.increment(1),
            incidentLog: FieldValue.arrayUnion({
                reason: "AI flagged submission of falsified match evidence.",
                date: FieldValue.serverTimestamp(),
                tournamentId: tournamentId,
            })
        });
    }

    if (result.verificationStatus === 'verified' && result.verifiedScores) {
        const applyStatsPenalty = !result.homeStats || !result.awayStats;
        await approveMatchResult(tournamentId, matchId, result.verifiedScores.homeScore, result.verifiedScores.awayScore, `AI: ${result.reasoning}`, applyStatsPenalty, result.homeStats, result.awayStats, undefined, false);
    } else if (result.verificationStatus === 'needs_secondary_evidence') {
        await matchRef.update({ status: 'needs_secondary_evidence', resolutionNotes: `AI: ${result.reasoning}` });
        const match = (await matchRef.get()).data() as Match;
        await notifyMatchCaptains(tournamentId, match, {
          tournamentId,
          title: 'Secondary evidence needed',
          body: 'Upload secondary evidence soon ΓÇö your match is under review.',
          href: `/tournaments/${tournamentId}?tab=my-matches`,
        }, 1);
    } else if (result.verificationStatus === 'replay_required') {
        await scheduleRematch(tournamentId, matchId, `AI: ${result.reasoning}`);
    } else { // 'disputed'
        await matchRef.update({ status: 'disputed', resolutionNotes: `AI Review Failed: ${result.reasoning}` });
        const match = (await matchRef.get()).data() as Match;
        const tournament = (await adminDb.collection('tournaments').doc(tournamentId).get()).data() as Tournament | undefined;
        await notifyMatchCaptains(tournamentId, match, {
          tournamentId,
          title: 'Match disputed',
          body: 'Your match was disputed. Check My Matches for next steps.',
          href: `/tournaments/${tournamentId}?tab=my-matches`,
        }, 1);
        if (tournament?.organizerId) {
          await notifyUser(tournament.organizerId, {
            tournamentId,
            title: 'Match disputed',
            body: `A match in "${tournament.name}" needs attention.`,
            href: `/tournaments/${tournamentId}?tab=fixtures`,
          }, 1);
        }
    }
}

export async function transferHost(tournamentId: string, matchId: string, currentHostId: string) {
    const matchRef = adminDb.collection('tournaments').doc(tournamentId).collection('matches').doc(matchId);
    const matchDoc = await matchRef.get();
    if(!matchDoc.exists) throw new Error("Match not found");
    
    const matchData = matchDoc.data() as Match;
    const teamDoc = await adminDb.collection('tournaments').doc(tournamentId).collection('teams').doc(matchData.hostId).get();
    if(!teamDoc.exists) throw new Error("Host team not found");
    
    if(teamDoc.data()!.captainId !== currentHostId) throw new Error("Only the current host can transfer hosting duties.");

    const newHostId = matchData.homeTeamId === matchData.hostId ? matchData.awayTeamId : matchData.homeTeamId;

    await matchRef.update({
        hostId: newHostId,
        hostTransferRequested: true
    });
    revalidatePath(`/tournaments/${tournamentId}`);
}

export async function setMatchRoomCode(tournamentId: string, matchId: string, code: string) {
    const matchRef = adminDb.collection('tournaments').doc(tournamentId).collection('matches').doc(matchId);
    const matchDoc = await matchRef.get();
    if (!matchDoc.exists) throw new Error('Match not found');
    const match = matchDoc.data() as Match;

    await matchRef.update({ 
        roomCode: code,
        roomCodeSetAt: FieldValue.serverTimestamp(),
    });

    // #6 Notify opponent captain ΓÇö play now
    const hostTeamId = match.hostId;
    const opponentTeamId = hostTeamId === match.homeTeamId ? match.awayTeamId : match.homeTeamId;
    const opponentCaptainId = await getTeamCaptainId(tournamentId, opponentTeamId);
    if (opponentCaptainId) {
      await notifyUser(opponentCaptainId, {
        tournamentId,
        title: 'Room code ready ΓÇö play now',
        body: `Your host posted room code ${code}. Open My Matches to join.`,
        href: `/tournaments/${tournamentId}?tab=my-matches`,
      }, 1);
    }

    revalidatePath(`/tournaments/${tournamentId}`);
}

export async function setOrganizerStreamUrl(tournamentId: string, matchId: string, streamUrl: string, organizerId: string) {
    const tournamentRef = adminDb.collection('tournaments').doc(tournamentId);
    const tournamentDoc = await tournamentRef.get();
    if (!tournamentDoc.exists || tournamentDoc.data()?.organizerId !== organizerId) {
        throw new Error("You are not authorized to perform this action.");
    }
    const organizerProfile = await adminAuth.getUser(organizerId);

    const matchRef = tournamentRef.collection('matches').doc(matchId);
    const fieldPath = `streamLinks.organizer`;
    await matchRef.update({
        [fieldPath]: { username: `${organizerProfile.displayName || 'Organizer'} (Official)`, url: streamUrl }
    });

    revalidatePath(`/tournaments/${tournamentId}`);
}

export async function submitPlayerStreamUrl(tournamentId: string, matchId: string, userId: string, username: string, streamUrl: string) {
    const matchRef = adminDb.collection('tournaments').doc(tournamentId).collection('matches').doc(matchId);
    const matchDoc = await matchRef.get();
    if (!matchDoc.exists) throw new Error("Match not found.");

    const matchData = matchDoc.data() as Match;
    const homeTeamDoc = await adminDb.collection('tournaments').doc(tournamentId).collection('teams').doc(matchData.homeTeamId).get();
    const awayTeamDoc = await adminDb.collection('tournaments').doc(tournamentId).collection('teams').doc(matchData.awayTeamId).get();
    if (!homeTeamDoc.exists || !awayTeamDoc.exists) throw new Error("Teams not found.");
    
    const homeTeam = homeTeamDoc.data() as Team;
    const awayTeam = awayTeamDoc.data() as Team;

    if (userId !== homeTeam.captainId && userId !== awayTeam.captainId) {
        throw new Error("You are not a participant in this match.");
    }

    const fieldPath = `streamLinks.${userId}`;
    await matchRef.update({
        [fieldPath]: { username, url: streamUrl }
    });
    revalidatePath(`/tournaments/${tournamentId}`);
}

export async function requestPlayerReplay(tournamentId: string, matchId: string, requesterId: string, reason: string) {
    const matchRef = adminDb.collection('tournaments').doc(tournamentId).collection('matches').doc(matchId);
    const request: ReplayRequest = {
        requestedBy: requesterId,
        reason,
        status: 'pending',
    };
    await matchRef.update({ replayRequest: request });
    
    const matchDoc = await matchRef.get();
    const matchData = matchDoc.data() as Match;
    
    const homeTeamDoc = await adminDb.collection('tournaments').doc(tournamentId).collection('teams').doc(matchData.homeTeamId).get();
    const awayTeamDoc = await adminDb.collection('tournaments').doc(tournamentId).collection('teams').doc(matchData.awayTeamId).get();

    const opponentCaptainId = requesterId === homeTeamDoc.data()?.captainId ? awayTeamDoc.data()?.captainId : homeTeamDoc.data()?.captainId;
    const requesterUsername = requesterId === homeTeamDoc.data()?.captainId ? homeTeamDoc.data()?.name : awayTeamDoc.data()?.name;
    
    if (opponentCaptainId) {
        await sendNotification(opponentCaptainId, {
            userId: opponentCaptainId,
            tournamentId,
            title: "Replay Request",
            body: `${requesterUsername} has requested a replay for your match.`,
            href: `/tournaments/${tournamentId}?tab=my-matches`
        });
    }

    revalidatePath(`/tournaments/${tournamentId}`);
}

export async function respondToPlayerReplay(tournamentId: string, matchId: string, responderId: string, accepted: boolean) {
    const matchRef = adminDb.collection('tournaments').doc(tournamentId).collection('matches').doc(matchId);
    const tournamentRef = adminDb.collection('tournaments').doc(tournamentId);

    const matchDoc = await matchRef.get();
    const matchData = matchDoc.data() as Match;

    if (!matchData.replayRequest || matchData.replayRequest.status !== 'pending') {
        throw new Error("No active replay request found.");
    }
    
    const newStatus = accepted ? 'accepted' : 'rejected';
    await matchRef.update({
        'replayRequest.status': newStatus,
        'replayRequest.respondedBy': responderId
    });

    const tournamentDoc = await tournamentRef.get();
    const tournament = tournamentDoc.data() as Tournament;

    await sendNotification(tournament.organizerId, {
        userId: tournament.organizerId,
        tournamentId,
        title: "Replay Request Responded",
        body: `A replay request for a match in "${tournament.name}" has been ${newStatus}. Your approval may be required.`,
        href: `/tournaments/${tournamentId}?tab=schedule`
    });

    revalidatePath(`/tournaments/${tournamentId}`);
}

export async function organizerApproveReplay(tournamentId: string, matchId: string, organizerId: string, approve: boolean) {
    const tournamentRef = adminDb.collection('tournaments').doc(tournamentId);
    const tournamentDoc = await tournamentRef.get();
    if(tournamentDoc.data()?.organizerId !== organizerId) throw new Error("Not authorized.");

    const matchRef = tournamentRef.collection('matches').doc(matchId);
    const matchDoc = await matchRef.get();
    const request = matchDoc.data()?.replayRequest as ReplayRequest;

    if (request.status !== 'accepted') throw new Error("Replay was not accepted by both players.");

    if (approve) {
        await scheduleRematch(tournamentId, matchId, "Replay approved by organizer after player agreement.");
    } else {
        await matchRef.update({
            'replayRequest.status': 'organizer-rejected'
        });
    }
    revalidatePath(`/tournaments/${tournamentId}`);
}

export async function forfeitMatch(tournamentId: string, matchId: string, forfeitingUserId: string) {
    const matchRef = adminDb.collection('tournaments').doc(tournamentId).collection('matches').doc(matchId);
    const matchDoc = await matchRef.get();
    if (!matchDoc.exists) throw new Error("Match not found.");

    const match = matchDoc.data() as Match;

    const isHomeCaptain = match.homeTeamId && (await adminDb.collection('tournaments').doc(tournamentId).collection('teams').doc(match.homeTeamId).get()).data()?.captainId === forfeitingUserId;
    const isAwayCaptain = match.awayTeamId && (await adminDb.collection('tournaments').doc(tournamentId).collection('teams').doc(match.awayTeamId).get()).data()?.captainId === forfeitingUserId;

    if (!isHomeCaptain && !isAwayCaptain) {
        throw new Error("You are not a captain in this match and cannot forfeit.");
    }

    const homeScore = isHomeCaptain ? 0 : 3;
    const awayScore = isAwayCaptain ? 0 : 3;

    await approveMatchResult(
        tournamentId,
        matchId,
        homeScore,
        awayScore,
        `Match forfeited by ${isHomeCaptain ? 'home team' : 'away team'}.`,
        true, // Apply stats penalty
        undefined, // No home stats
        undefined, // No away stats
        forfeitingUserId, // ID of the forfeiting player's captain
        true // Mark as auto-forfeited
    );

    revalidatePath(`/tournaments/${tournamentId}`);
}

export async function cancelReplayRequest(tournamentId: string, matchId: string, userId: string) {
  const matchRef = adminDb.collection('tournaments').doc(tournamentId).collection('matches').doc(matchId);
  const matchDoc = await matchRef.get();
  if (!matchDoc.exists) throw new Error('Match not found.');
  const match = matchDoc.data() as Match;
  if (!match.replayRequest || match.replayRequest.status !== 'pending') {
    throw new Error('No pending replay request to cancel.');
  }
  if (match.replayRequest.requestedBy !== userId) {
    throw new Error('Only the requester can cancel this replay request.');
  }
  await matchRef.update({ replayRequest: FieldValue.delete() });
  revalidatePath(`/tournaments/${tournamentId}`);
}
