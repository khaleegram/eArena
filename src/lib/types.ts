

import type { Timestamp as FirebaseAdminTimestamp } from 'firebase-admin/firestore';
import type { Timestamp as FirebaseClientTimestamp } from 'firebase/firestore';

// A union type that can represent a timestamp from either the client or admin SDK, or a string.
export type UnifiedTimestamp = string | FirebaseClientTimestamp | FirebaseAdminTimestamp | Date;

export interface PushSubscription {
    endpoint: string;
    expirationTime?: number | null;
    keys: {
        p256dh: string;
        auth: string;
    };
}

export interface BankDetails {
    accountNumber: string;
    accountName: string;
    bankCode: string;
    bankName: string;
    recipientCode?: string; // Stored after Paystack recipient creation
    confirmedForPayout?: boolean;
}

export interface UserProfile {
  uid: string;
  email: string | null;
  username?: string;
  photoURL?: string;
  badges?: Badge[];
  warnings?: number;
  incidentLog?: {
    reason: string;
    date: UnifiedTimestamp;
    tournamentId?: string;
  }[];
  followers?: string[];
  following?: string[];
  earnedAchievements?: Record<string, EarnedAchievement>;
  playerTitles?: PlayerTitle[];
  activeTitle?: string;
  tournamentsWon?: number;
  isBanned?: boolean;
  bankDetails?: BankDetails;
}

export type RewardType = 'virtual' | 'money';

export interface PrizeAllocation {
    first_place: number;
    second_place: number;
    third_place: number;
    best_overall: number;
    highest_scoring: number;
    best_defensive: number;
    best_attacking: number;
}


export interface RewardDetails {
  type: RewardType;
  prizePool: number;
  currency: 'NGN';
  isPaidOut: boolean;
  paymentStatus: 'pending' | 'paid' | 'not-applicable' | 'failed';
  paymentReference?: string;
  paidAt?: UnifiedTimestamp;
  prizeAllocation?: PrizeAllocation;
}


export type TournamentFormat = 'league' | 'cup' | 'champions-league';
export type TournamentStatus = 'pending' | 'open_for_registration' | 'generating_fixtures' | 'in_progress' | 'completed' | 'ready_to_start';

export interface Tournament {
  id: string;
  name: string;
  description: string;
  game: string;
  platform: string;
  registrationStartDate: UnifiedTimestamp;
  registrationEndDate: UnifiedTimestamp;
  tournamentStartDate: UnifiedTimestamp;
  tournamentEndDate: UnifiedTimestamp;
  endedAt?: UnifiedTimestamp;
  maxTeams: number;
  rules?: string;
  organizerId: string;
  organizerUsername?: string;
  createdAt?: UnifiedTimestamp;
  format: TournamentFormat;
  status: TournamentStatus;
  teamCount: number;
  code: string;
  isPublic: boolean;
  matchLength: number;
  extraTime: boolean;
  penalties: boolean;
  squadRestrictions?: string;
  injuries: boolean;
  homeAndAway: boolean;
  substitutions: number;
  rewardType: RewardType;
  prizePool?: number;
  rewardDetails: RewardDetails;
  lastAutoResolvedAt?: UnifiedTimestamp;
  payoutInitiated?: boolean;
  payoutCompletedAt?: UnifiedTimestamp;
  payoutLog?: {
      uid: string;
      amount: number;
      category: string;
      status: string;
      transactionId: string;
      paystackTransferCode?: string;
      errorMessage?: string;
  }[];
}

export type PlayerRole = 'captain' | 'co-captain' | 'player';

export interface Player {
    uid: string;
    role: PlayerRole;
    username: string;
    photoURL?: string;
}

export interface Team {
  id: string;
  tournamentId: string;
  name: string;
  logoUrl?: string;
  captainId: string;
  captain: Player;
  players: Player[];
  playerIds: string[];
  isApproved?: boolean;
  performancePoints?: number;
}

export interface UserMembership {
    userId: string;
    teamId: string;
    tournamentId: string;
}

export interface MatchReport {
  reportedBy: string; // userId of the captain
  homeScore: number;
  awayScore: number;
  pkHomeScore?: number;
  pkAwayScore?: number;
  evidenceUrl: string;
  reportedAt: UnifiedTimestamp;
  highlightUrl?: string;
}

export interface TeamMatchStats {
    possession: number;
    shots: number;
    shotsOnTarget: number;
    fouls: number;
    offsides: number;
    cornerKicks: number;
    freeKicks: number;
    passes: number;
    successfulPasses: number;
    crosses: number;
    interceptions: number;
    tackles: number;
    saves: number;
    pkScore?: number;
}

export type MatchStatus = 'scheduled' | 'awaiting_confirmation' | 'needs_secondary_evidence' | 'disputed' | 'approved';

export interface ReplayRequest {
  requestedBy: string; // User ID of the player requesting
  reason: string;
  evidenceUrl?: string;
  status: 'pending' | 'accepted' | 'rejected' | 'approved' | 'organizer-rejected'; // approved by organizer
  respondedBy?: string; // Opponent's UID
}

export interface Match {
  id: string;
  tournamentId: string;
  homeTeamId: string;
  awayTeamId: string;
  hostId: string;
  hostTransferRequested: boolean;
  homeTeamName?: string; 
  awayTeamName?: string;
  homeScore: number | null; 
  awayScore: number | null;
  pkHomeScore?: number | null;
  pkAwayScore?: number | null;
  matchDay: UnifiedTimestamp;
  status: MatchStatus;
  round?: string;
  homeTeamReport?: MatchReport;
  awayTeamReport?: MatchReport;
  homeTeamSecondaryReport?: MatchReport;
  awayTeamSecondaryReport?: MatchReport;
  resolutionNotes?: string;
  roomCode?: string;
  roomCodeSetAt?: UnifiedTimestamp;
  homeTeamStats?: TeamMatchStats;
  awayTeamStats?: TeamMatchStats;
  highlightUrl?: string;
  streamLinks?: Record<string, { username: string; url: string }>;
  wasAutoForfeited?: boolean;
  replayRequest?: ReplayRequest;
  isReplay?: boolean;
  deadlineExtended?: boolean;
}

export interface Highlight {
  id: string; // match id
  tournamentId: string;
  tournamentName: string;
  highlightUrl: string;
  homeTeamName: string;
  awayTeamName:string;
  homeTeamLogo?: string;
  awayTeamLogo?: string;
  homeScore: number | null;
  awayScore: number | null;
  matchDay: UnifiedTimestamp;
}

export interface Standing {
  teamId: string;
  teamName?: string;
  tournamentId: string;
  matchesPlayed: number;
  wins: number;
  losses: number;
  draws: number;
  goalsFor: number;
  goalsAgainst: number;
  points: number;
  ranking: number;
  cleanSheets: number;
}

export interface ChatMessage {
  id: string;
  conversationId?: string;
  tournamentId?: string;
  teamId?: string;
  matchId?: string;
  userId: string;
  username: string;
  photoURL?: string;
  message: string;
  timestamp: UnifiedTimestamp;
}

export interface Conversation {
    id: string;
    participants: UserProfile[];
    participantIds: string[];
    createdAt?: UnifiedTimestamp;
    lastMessage?: {
        message: string;
        timestamp: UnifiedTimestamp;
    };
    messages?: ChatMessage[];
}


export interface Notification {
    id: string;
    userId: string;
    tournamentId?: string;
    title: string;
    body: string;
    href: string;
    isRead: boolean;
    createdAt: UnifiedTimestamp;
}

export interface TournamentPerformancePoint {
  tournamentId: string;
  tournamentName: string;
  goals: number;
  assists: number; // Placeholder for now, stats don't include assists yet
  matchesPlayed: number;
}

export interface PlayerStats {
  uid?: string;
  totalMatches: number;
  totalWins: number;
  totalLosses: number;
  totalDraws: number;
  totalGoals: number;
  totalConceded: number;
  totalCleanSheets: number;
  avgPossession: number;
  totalPassPercentageSum: number;
  matchesWithPassStats: number;
  totalShots: number;
  totalShotsOnTarget: number;
  totalPasses: number;
  totalTackles: number;
  totalInterceptions: number;
  totalSaves: number;
  performanceHistory: TournamentPerformancePoint[];
}

export interface Article {
  id: string;
  slug: string;
  title: string;
  content: string;
  excerpt: string;
  authorName: string;
  authorId: string;
  type: 'news' | 'guide';
  tags: string[];
  createdAt: UnifiedTimestamp;
}

export interface PlatformSettings {
  isMaintenanceMode: boolean;
  allowNewTournaments: boolean;
  whatsappUrl?: string;
  facebookUrl?: string;
  instagramUrl?: string;
  youtubeUrl?: string;
}

export interface PlatformSummary {
    totalPlatformFees: number;
    totalPayouts: number;
    lastUpdated: UnifiedTimestamp;
}

export interface TournamentAward {
    awardTitle: string;
    team: Team;
    reason: string;
}

export interface Transaction {
    id: string;
    uid: string;
    tournamentId: string;
    category: string;
    amount: number;
    status: 'success' | 'failed' | 'pending' | 'reversed';
    paystackTransferCode?: string;
    errorMessage?: string;
    createdAt: UnifiedTimestamp;
    updatedAt: UnifiedTimestamp;
    recipientName: string;
    recipientBank: string;
    recipientAccountNumber: string;
}

export interface PrizeDistributionItem {
    category: string;
    percentage: number;
    amount: number;
    winner?: {
        teamId: string;
        teamName: string;
        captainId: string;
        logoUrl?: string;
    } | null;
}

export interface DisputedMatchInfo extends Match {
    tournamentName: string;
    homeTeam: Team;
    awayTeam: Team;
}

export interface EarnedAchievement {
    achievementId: string;
    tier: number; // Index of the tier in the achievement's tiers array
    unlockedAt: UnifiedTimestamp;
    progress: number;
}

export interface PlayerTitle {
    title: string;
    unlockedAt: UnifiedTimestamp;
    sourceAchievementId: string; // The achievement that granted this title
}
