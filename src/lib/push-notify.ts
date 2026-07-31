import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import webpush from 'web-push';
import { addDays, format, startOfDay } from 'date-fns';
import { adminDb } from './firebase-admin';
import { toDate } from './utils';
import type { Match, Notification, PushSubscription, Team, Tournament, UserMembership } from './types';

export type NotifyTier = 1 | 2 | 3;

export type NotifyPayload = {
  title: string;
  body: string;
  href: string;
  tournamentId?: string;
};

const QUIET_START_HOUR = 21; // 21:00 UTC inclusive → quiet
const QUIET_END_HOUR = 7; // until 07:00 UTC
const TIER23_DAILY_CAP = 3;

if (process.env.VAPID_PRIVATE_KEY && process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) {
  webpush.setVapidDetails(
    `mailto:${process.env.SMTP_USERNAME || 'noreply@earena.app'}`,
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
}

function utcDayKey(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

function isQuietHoursUtc(d = new Date()): boolean {
  const h = d.getUTCHours();
  return h >= QUIET_START_HOUR || h < QUIET_END_HOUR;
}

async function sendPushNotification(userId: string, payload: { title: string; body: string; url: string }) {
  if (!process.env.VAPID_PRIVATE_KEY) return;
  try {
    const subscriptionsSnapshot = await adminDb.collection('users').doc(userId).collection('pushSubscriptions').get();
    if (subscriptionsSnapshot.empty) return;

    const notificationPayload = JSON.stringify(payload);
    await Promise.all(
      subscriptionsSnapshot.docs.map((docSnap) => {
        const subscription = docSnap.data() as PushSubscription;
        return webpush.sendNotification(subscription, notificationPayload).catch((error: any) => {
          if (error.statusCode === 410 || error.statusCode === 404) {
            return docSnap.ref.delete();
          }
          console.error('Failed to send push notification:', error);
        });
      })
    );
  } catch (error) {
    console.error(`Error sending push notification to user ${userId}:`, error);
  }
}

/** Writes in-app notification + fires push (fire-and-forget). No tier/budget. */
export async function writeNotification(
  userId: string,
  notification: Omit<Notification, 'id' | 'createdAt' | 'isRead'>
) {
  if (!userId) return;
  await adminDb
    .collection('users')
    .doc(userId)
    .collection('notifications')
    .add({
      ...notification,
      isRead: false,
      createdAt: FieldValue.serverTimestamp(),
    });

  void sendPushNotification(userId, {
    title: notification.title,
    body: notification.body,
    url: notification.href || '/',
  });
}

async function consumePushBudget(userId: string): Promise<boolean> {
  const userRef = adminDb.collection('users').doc(userId);
  const day = utcDayKey();

  try {
    return await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(userRef);
      const data = snap.data() || {};
      const budget = (data.pushBudget as { day?: string; count?: number } | undefined) || {};
      const count = budget.day === day ? budget.count || 0 : 0;
      if (count >= TIER23_DAILY_CAP) return false;
      tx.set(userRef, { pushBudget: { day, count: count + 1 } }, { merge: true });
      return true;
    });
  } catch (e) {
    console.error('pushBudget transaction failed:', e);
    return true; // fail open for retention
  }
}

/**
 * Tiered notify: Tier 1 always; Tier 2/3 respect quiet hours + daily cap.
 */
export async function notifyUser(userId: string, payload: NotifyPayload, tier: NotifyTier) {
  if (!userId) return;

  if (tier >= 2) {
    if (isQuietHoursUtc()) return;
    const ok = await consumePushBudget(userId);
    if (!ok) return;
  }

  await writeNotification(userId, {
    userId,
    tournamentId: payload.tournamentId,
    title: payload.title,
    body: payload.body,
    href: payload.href,
  });
}

export async function getTeamCaptainId(tournamentId: string, teamId: string): Promise<string | null> {
  const snap = await adminDb.collection('tournaments').doc(tournamentId).collection('teams').doc(teamId).get();
  if (!snap.exists) return null;
  return (snap.data() as Team).captainId || null;
}

export async function notifyMatchCaptains(
  tournamentId: string,
  match: Pick<Match, 'homeTeamId' | 'awayTeamId'>,
  payload: NotifyPayload,
  tier: NotifyTier,
  excludeUserId?: string
) {
  const [homeCaptainId, awayCaptainId] = await Promise.all([
    getTeamCaptainId(tournamentId, match.homeTeamId),
    getTeamCaptainId(tournamentId, match.awayTeamId),
  ]);

  const ids = [homeCaptainId, awayCaptainId].filter(
    (id): id is string => !!id && id !== excludeUserId
  );
  const unique = [...new Set(ids)];
  await Promise.all(unique.map((id) => notifyUser(id, { ...payload, tournamentId }, tier)));
}

export async function getOpenTournamentHighlights(limit = 3): Promise<Tournament[]> {
  const snap = await adminDb
    .collection('tournaments')
    .where('status', '==', 'open_for_registration')
    .orderBy('createdAt', 'desc')
    .limit(Math.max(limit * 3, 12))
    .get()
    .catch(async () => {
      // Fallback if createdAt index missing
      return adminDb.collection('tournaments').where('status', '==', 'open_for_registration').limit(50).get();
    });

  const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Tournament));
  list.sort((a, b) => {
    const spotsA = (a.maxTeams || 0) - (a.teamCount || 0);
    const spotsB = (b.maxTeams || 0) - (b.teamCount || 0);
    return spotsA - spotsB;
  });
  return list.slice(0, limit);
}

/** Users not currently in an open / ready / in-progress tournament. */
export async function getIdleUserIds(): Promise<string[]> {
  const usersSnap = await adminDb.collection('users').select().get();
  const allUserIds = usersSnap.docs.map((d) => d.id);
  if (allUserIds.length === 0) return [];

  const statusList = ['open_for_registration', 'ready_to_start', 'in_progress'] as const;
  const snaps = await Promise.all(
    statusList.map((status) => adminDb.collection('tournaments').where('status', '==', status).get())
  );
  const activeTournamentIds = new Set(snaps.flatMap((s) => s.docs.map((d) => d.id)));

  if (activeTournamentIds.size === 0) return allUserIds;

  const busy = new Set<string>();
  const membershipsSnap = await adminDb.collection('userMemberships').get();
  for (const docSnap of membershipsSnap.docs) {
    const m = docSnap.data() as UserMembership;
    if (m.tournamentId && activeTournamentIds.has(m.tournamentId) && m.userId) {
      busy.add(m.userId);
    }
  }

  return allUserIds.filter((id) => !busy.has(id));
}

/** Cron helper: remind captains of scheduled matches today. */
export async function processMatchDayReminders(): Promise<{
  reminded: number;
  failed: number;
  errors: { matchId: string; error: string }[];
}> {
  const today = startOfDay(new Date());
  const tomorrow = addDays(today, 1);

  const matchesSnapshot = await adminDb
    .collectionGroup('matches')
    .where('matchDay', '>=', today)
    .where('matchDay', '<', tomorrow)
    .where('status', '==', 'scheduled')
    .get();

  if (matchesSnapshot.empty) {
    return { reminded: 0, failed: 0, errors: [] };
  }

  let reminded = 0;
  const errors: { matchId: string; error: string }[] = [];

  for (const docSnap of matchesSnapshot.docs) {
    const match = { id: docSnap.id, ...docSnap.data() } as Match;
    if (match.reminderSentAt) continue;

    const tournamentId = match.tournamentId;
    if (!tournamentId) continue;

    try {
      const [homeTeamDoc, awayTeamDoc] = await Promise.all([
        adminDb.collection('tournaments').doc(tournamentId).collection('teams').doc(match.homeTeamId).get(),
        adminDb.collection('tournaments').doc(tournamentId).collection('teams').doc(match.awayTeamId).get(),
      ]);

      if (!homeTeamDoc.exists || !awayTeamDoc.exists) continue;

      const homeTeam = homeTeamDoc.data() as Team;
      const awayTeam = awayTeamDoc.data() as Team;
      const href = `/tournaments/${tournamentId}?tab=my-matches`;

      if (homeTeam.captainId) {
        await notifyUser(
          homeTeam.captainId,
          {
            tournamentId,
            title: 'Your match is today',
            body: `You play vs ${awayTeam.name || 'your opponent'} today. Open My Matches to play and report.`,
            href,
          },
          2
        );
      }
      if (awayTeam.captainId) {
        await notifyUser(
          awayTeam.captainId,
          {
            tournamentId,
            title: 'Your match is today',
            body: `You play vs ${homeTeam.name || 'your opponent'} today. Open My Matches to play and report.`,
            href,
          },
          2
        );
      }

      await docSnap.ref.update({ reminderSentAt: Timestamp.now() });
      reminded++;
    } catch (error: any) {
      console.error(`Match reminder failed for ${docSnap.id}:`, error?.message || error);
      errors.push({ matchId: docSnap.id, error: error?.message || String(error) });
    }
  }

  return { reminded, failed: errors.length, errors };
}

export async function processMatchEveningNudges(): Promise<{
  nudged: number;
  failed: number;
  errors: { matchId: string; error: string }[];
}> {
  const today = startOfDay(new Date());
  const tomorrow = addDays(today, 1);

  const matchesSnapshot = await adminDb
    .collectionGroup('matches')
    .where('matchDay', '>=', today)
    .where('matchDay', '<', tomorrow)
    .where('status', '==', 'scheduled')
    .get();

  let nudged = 0;
  const errors: { matchId: string; error: string }[] = [];

  for (const docSnap of matchesSnapshot.docs) {
    const match = { id: docSnap.id, ...docSnap.data() } as Match;
    if ((match as Match).eveningNudgeSentAt) continue;
    const tournamentId = match.tournamentId;
    if (!tournamentId) continue;

    try {
      const [homeTeamDoc, awayTeamDoc] = await Promise.all([
        adminDb.collection('tournaments').doc(tournamentId).collection('teams').doc(match.homeTeamId).get(),
        adminDb.collection('tournaments').doc(tournamentId).collection('teams').doc(match.awayTeamId).get(),
      ]);
      if (!homeTeamDoc.exists || !awayTeamDoc.exists) continue;

      const homeTeam = homeTeamDoc.data() as Team;
      const awayTeam = awayTeamDoc.data() as Team;
      const href = `/tournaments/${tournamentId}?tab=my-matches`;

      if (homeTeam.captainId) {
        await notifyUser(
          homeTeam.captainId,
          {
            tournamentId,
            title: "Still haven't played?",
            body: `Your match vs ${awayTeam.name || 'your opponent'} is today. Match day ends soon — open My Matches.`,
            href,
          },
          2
        );
      }
      if (awayTeam.captainId) {
        await notifyUser(
          awayTeam.captainId,
          {
            tournamentId,
            title: "Still haven't played?",
            body: `Your match vs ${homeTeam.name || 'your opponent'} is today. Match day ends soon — open My Matches.`,
            href,
          },
          2
        );
      }

      await docSnap.ref.update({ eveningNudgeSentAt: Timestamp.now() });
      nudged++;
    } catch (error: any) {
      errors.push({ matchId: docSnap.id, error: error?.message || String(error) });
    }
  }

  return { nudged, failed: errors.length, errors };
}

export async function processOpenTournamentsDigest(): Promise<{ sent: number; skipped: number }> {
  const highlights = await getOpenTournamentHighlights(3);
  if (highlights.length === 0) return { sent: 0, skipped: 0 };

  const names = highlights.map((t) => t.name).join(', ');
  const idleIds = await getIdleUserIds();
  let sent = 0;
  let skipped = 0;
  const sixDaysMs = 6 * 24 * 60 * 60 * 1000;
  const now = Date.now();

  for (const userId of idleIds) {
    try {
      const userRef = adminDb.collection('users').doc(userId);
      const snap = await userRef.get();
      const last = snap.data()?.lastOpenTournamentsDigestAt;
      if (last) {
        const lastMs = toDate(last).getTime();
        if (now - lastMs < sixDaysMs) {
          skipped++;
          continue;
        }
      }

      await notifyUser(
        userId,
        {
          title: `${highlights.length} tournament${highlights.length === 1 ? '' : 's'} open`,
          body: `You're not in a live event. Join now: ${names}`,
          href: '/tournaments',
        },
        3
      );
      await userRef.set({ lastOpenTournamentsDigestAt: Timestamp.now() }, { merge: true });
      sent++;
    } catch {
      skipped++;
    }
  }

  return { sent, skipped };
}

function spotsLeft(t: Tournament): number {
  return Math.max(0, (t.maxTeams || 0) - (t.teamCount || 0));
}

function isAlmostFull(t: Tournament): boolean {
  if (!t.maxTeams || t.maxTeams < 1) return false;
  const ratio = (t.teamCount || 0) / t.maxTeams;
  return ratio >= 0.8 || spotsLeft(t) <= 2;
}

export async function processRegistrationFomo(): Promise<{
  almostFull: number;
  closing: number;
}> {
  const openSnap = await adminDb.collection('tournaments').where('status', '==', 'open_for_registration').get();
  let almostFull = 0;
  let closing = 0;

  const today = startOfDay(new Date());
  const tomorrow = addDays(today, 1);
  const dayAfter = addDays(today, 2);

  const idleIds = await getIdleUserIds();

  for (const docSnap of openSnap.docs) {
    const tournament = { id: docSnap.id, ...docSnap.data() } as Tournament;
    const left = spotsLeft(tournament);
    const href = `/tournaments/${tournament.id}`;

    // Almost full FOMO
    if (isAlmostFull(tournament) && !tournament.almostFullNotifiedAt) {
      if (tournament.organizerId) {
        await notifyUser(
          tournament.organizerId,
          {
            tournamentId: tournament.id,
            title: 'Almost full',
            body: `${tournament.name} is almost full — ${tournament.teamCount}/${tournament.maxTeams} teams.`,
            href,
          },
          2
        );
      }
      for (const userId of idleIds) {
        if (userId === tournament.organizerId) continue;
        await notifyUser(
          userId,
          {
            tournamentId: tournament.id,
            title: `Almost full: ${tournament.name}`,
            body: `Only ${left} spot${left === 1 ? '' : 's'} left — join before it fills.`,
            href,
          },
          2
        );
      }
      await docSnap.ref.update({ almostFullNotifiedAt: Timestamp.now() });
      almostFull++;
    }

    // Closing tomorrow
    const regEnd = toDate(tournament.registrationEndDate);
    const regEndDay = startOfDay(regEnd);
    const closesTomorrow = regEndDay.getTime() >= tomorrow.getTime() && regEndDay.getTime() < dayAfter.getTime();

    if (closesTomorrow && !tournament.regClosingNotifiedAt) {
      if (tournament.organizerId) {
        await notifyUser(
          tournament.organizerId,
          {
            tournamentId: tournament.id,
            title: 'Registration closes tomorrow',
            body: `${tournament.name}: ${tournament.teamCount}/${tournament.maxTeams} teams. Closes ${format(regEnd, 'PPP')}.`,
            href,
          },
          2
        );
      }
      for (const userId of idleIds) {
        if (userId === tournament.organizerId) continue;
        await notifyUser(
          userId,
          {
            tournamentId: tournament.id,
            title: `Last day to join ${tournament.name}`,
            body: `Registration closes tomorrow. ${left} spot${left === 1 ? '' : 's'} left.`,
            href,
          },
          2
        );
      }
      await docSnap.ref.update({ regClosingNotifiedAt: Timestamp.now() });
      closing++;
    }
  }

  return { almostFull, closing };
}
