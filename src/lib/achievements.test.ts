import { describe, it, expect } from 'vitest';
import { allAchievements } from './achievements';
import type { UserProfile, PlayerStats } from './types';

describe('achievements', () => {
  const createMockProfile = (overrides: Partial<UserProfile> = {}): UserProfile => ({
    uid: 'test-user',
    email: 'test@example.com',
    ...overrides,
  });

  const createMockStats = (overrides: Partial<PlayerStats> = {}): PlayerStats => ({
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
    ...overrides,
  });

  describe('tournament-victor', () => {
    it('should evaluate correctly for different win counts', () => {
      const achievement = allAchievements.find(a => a.id === 'tournament-victor');
      expect(achievement).toBeDefined();

      const profile1 = createMockProfile({ tournamentsWon: 0 });
      const profile2 = createMockProfile({ tournamentsWon: 1 });
      const profile3 = createMockProfile({ tournamentsWon: 5 });
      const profile4 = createMockProfile({ tournamentsWon: 100 });

      const stats = createMockStats();

      expect(achievement!.evaluator(profile1, stats)).toBe(0);
      expect(achievement!.evaluator(profile2, stats)).toBe(1);
      expect(achievement!.evaluator(profile3, stats)).toBe(5);
      expect(achievement!.evaluator(profile4, stats)).toBe(100);
    });
  });

  describe('earena-veteran', () => {
    it('should evaluate based on total matches', () => {
      const achievement = allAchievements.find(a => a.id === 'earena-veteran');
      expect(achievement).toBeDefined();

      const profile = createMockProfile();
      const stats1 = createMockStats({ totalMatches: 0 });
      const stats2 = createMockStats({ totalMatches: 10 });
      const stats3 = createMockStats({ totalMatches: 100 });
      const stats4 = createMockStats({ totalMatches: 1000 });

      expect(achievement!.evaluator(profile, stats1)).toBe(0);
      expect(achievement!.evaluator(profile, stats2)).toBe(10);
      expect(achievement!.evaluator(profile, stats3)).toBe(100);
      expect(achievement!.evaluator(profile, stats4)).toBe(1000);
    });
  });

  describe('golden-boot', () => {
    it('should evaluate based on total goals', () => {
      const achievement = allAchievements.find(a => a.id === 'golden-boot');
      expect(achievement).toBeDefined();

      const profile = createMockProfile();
      const stats1 = createMockStats({ totalGoals: 0 });
      const stats2 = createMockStats({ totalGoals: 25 });
      const stats3 = createMockStats({ totalGoals: 500 });

      expect(achievement!.evaluator(profile, stats1)).toBe(0);
      expect(achievement!.evaluator(profile, stats2)).toBe(25);
      expect(achievement!.evaluator(profile, stats3)).toBe(500);
    });
  });

  describe('iron-wall', () => {
    it('should evaluate based on clean sheets', () => {
      const achievement = allAchievements.find(a => a.id === 'iron-wall');
      expect(achievement).toBeDefined();

      const profile = createMockProfile();
      const stats1 = createMockStats({ totalCleanSheets: 0 });
      const stats2 = createMockStats({ totalCleanSheets: 5 });
      const stats3 = createMockStats({ totalCleanSheets: 50 });

      expect(achievement!.evaluator(profile, stats1)).toBe(0);
      expect(achievement!.evaluator(profile, stats2)).toBe(5);
      expect(achievement!.evaluator(profile, stats3)).toBe(50);
    });
  });

  describe('good-sport', () => {
    it('should return 0 if warnings >= 5', () => {
      const achievement = allAchievements.find(a => a.id === 'good-sport');
      expect(achievement).toBeDefined();

      const profile = createMockProfile({ warnings: 5 });
      const stats = createMockStats({ totalMatches: 100 });

      expect(achievement!.evaluator(profile, stats)).toBe(0);
    });

    it('should return correct value based on matches and warnings', () => {
      const achievement = allAchievements.find(a => a.id === 'good-sport');
      expect(achievement).toBeDefined();

      // 10 matches, < 5 warnings
      const profile1 = createMockProfile({ warnings: 2 });
      const stats1 = createMockStats({ totalMatches: 10 });
      expect(achievement!.evaluator(profile1, stats1)).toBe(10);

      // 50 matches, < 5 warnings
      const profile2 = createMockProfile({ warnings: 3 });
      const stats2 = createMockStats({ totalMatches: 50 });
      expect(achievement!.evaluator(profile2, stats2)).toBe(50);

      // 100 matches, < 3 warnings
      const profile3 = createMockProfile({ warnings: 2 });
      const stats3 = createMockStats({ totalMatches: 100 });
      expect(achievement!.evaluator(profile3, stats3)).toBe(100);
    });
  });

  describe('achievement structure', () => {
    it('should have all required fields for each achievement', () => {
      allAchievements.forEach(achievement => {
        expect(achievement.id).toBeTruthy();
        expect(achievement.name).toBeTruthy();
        expect(achievement.category).toBeTruthy();
        expect(achievement.rarity).toBeTruthy();
        expect(achievement.description).toBeTruthy();
        expect(achievement.icon).toBeTruthy();
        expect(achievement.tiers).toBeInstanceOf(Array);
        expect(achievement.tiers.length).toBeGreaterThan(0);
        expect(typeof achievement.evaluator).toBe('function');
      });
    });

    it('should have tiers in ascending order', () => {
      allAchievements.forEach(achievement => {
        for (let i = 1; i < achievement.tiers.length; i++) {
          expect(achievement.tiers[i].value).toBeGreaterThan(achievement.tiers[i - 1].value);
        }
      });
    });
  });
});
