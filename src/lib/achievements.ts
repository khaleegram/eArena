
import type { UserProfile, PlayerStats, Rarity } from './types';

export type AchievementTier = {
  name: 'Bronze' | 'Silver' | 'Gold' | 'Platinum' | 'Diamond' | 'Legendary';
  value: number; // The value needed to unlock this tier
  description: string;
  title?: string; // Optional title awarded for reaching this tier
};

export type Achievement = {
  id: string; // e.g., 'tournament-victor'
  name: string;
  category: 'Competitive' | 'Participation' | 'Mastery' | 'Community';
  rarity: Rarity;
  description: string;
  icon: string; // Name of a Lucide icon
  tiers: AchievementTier[];
  evaluator: (profile: UserProfile, stats: PlayerStats) => number; // Function to get current progress value
};

// We define achievements here. The evaluator function determines how to calculate progress.
export const allAchievements: Achievement[] = [
  // Competitive Prowess
  {
    id: 'tournament-victor',
    name: 'Tournament Victor',
    category: 'Competitive',
    rarity: 'Rare',
    description: 'Win eArena tournaments.',
    icon: 'Trophy',
    tiers: [
      { name: 'Bronze', value: 1, description: 'Win 1 tournament' },
      { name: 'Silver', value: 5, description: 'Win 5 tournaments' },
      { name: 'Gold', value: 10, description: 'Win 10 tournaments', title: 'Tournament Champion' },
      { name: 'Platinum', value: 25, description: 'Win 25 tournaments' },
      { name: 'Diamond', value: 50, description: 'Win 50 tournaments' },
      { name: 'Legendary', value: 100, description: 'Win 100 tournaments', title: 'eArena Legend' },
    ],
    evaluator: (profile) => profile.tournamentsWon || 0,
  },
  // Participation & Consistency
  {
    id: 'earena-veteran',
    name: 'eArena Veteran',
    category: 'Participation',
    rarity: 'Common',
    description: 'Play matches on the platform.',
    icon: 'Gamepad2',
    tiers: [
      { name: 'Bronze', value: 10, description: 'Play 10 matches' },
      { name: 'Silver', value: 50, description: 'Play 50 matches' },
      { name: 'Gold', value: 100, description: 'Play 100 matches', title: 'eArena Veteran' },
      { name: 'Platinum', value: 250, description: 'Play 250 matches' },
      { name: 'Diamond', value: 500, description: 'Play 500 matches' },
      { name: 'Legendary', value: 1000, description: 'Play 1000 matches' },
    ],
    evaluator: (profile, stats) => stats.totalMatches || 0,
  },
  // Game Mastery
  {
    id: 'golden-boot',
    name: 'Golden Boot',
    category: 'Mastery',
    rarity: 'Uncommon',
    description: 'Score goals across all matches.',
    icon: 'Target',
    tiers: [
      { name: 'Bronze', value: 25, description: 'Score 25 goals' },
      { name: 'Silver', value: 100, description: 'Score 100 goals' },
      { name: 'Gold', value: 500, description: 'Score 500 goals', title: 'Golden Boot' },
      { name: 'Platinum', value: 1000, description: 'Score 1000 goals' },
    ],
    evaluator: (profile, stats) => stats.totalGoals || 0,
  },
  {
    id: 'iron-wall',
    name: 'Iron Wall',
    category: 'Mastery',
    rarity: 'Uncommon',
    description: 'Keep clean sheets.',
    icon: 'Shield',
    tiers: [
      { name: 'Bronze', value: 5, description: 'Achieve 5 clean sheets' },
      { name: 'Silver', value: 20, description: 'Achieve 20 clean sheets' },
      { name: 'Gold', value: 50, description: 'Achieve 50 clean sheets', title: 'The Wall' },
      { name: 'Platinum', value: 100, description: 'Achieve 100 clean sheets' },
    ],
    evaluator: (profile, stats) => stats.totalCleanSheets || 0,
  },
  // Community
  {
    id: 'good-sport',
    name: 'Good Sport',
    category: 'Community',
    rarity: 'Rare',
    description: 'Maintain a good reputation with few warnings.',
    icon: 'ShieldCheck',
    tiers: [
        { name: 'Bronze', value: 10, description: 'Play 10 matches with less than 5 warnings' },
        { name: 'Silver', value: 50, description: 'Play 50 matches with less than 5 warnings' },
        { name: 'Gold', value: 100, description: 'Play 100 matches with less than 3 warnings', title: 'Fair Play Ambassador' },
    ],
    evaluator: (profile, stats) => {
        const warnings = profile.warnings || 0;
        if(warnings >= 5) return 0;
        if(warnings < 3 && stats.totalMatches >=100) return 100;
        if(warnings < 5 && stats.totalMatches >=50) return 50;
        if(warnings < 5 && stats.totalMatches >=10) return 10;
        return 0;
    }
  }
];
