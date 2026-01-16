import { describe, it, expect } from 'vitest';
import { getRoundName, generateCupRound } from './cup-tournament';

describe('Cup Tournament Helper Functions', () => {
  describe('getRoundName', () => {
    it('should return "Final" for 2 teams', () => {
      expect(getRoundName(2)).toBe('Final');
    });

    it('should return "Semi-finals" for 4 teams', () => {
      expect(getRoundName(4)).toBe('Semi-finals');
    });

    it('should return "Quarter-finals" for 8 teams', () => {
      expect(getRoundName(8)).toBe('Quarter-finals');
    });

    it('should return "Round of X" for other team counts', () => {
      expect(getRoundName(16)).toBe('Round of 16');
      expect(getRoundName(32)).toBe('Round of 32');
      expect(getRoundName(64)).toBe('Round of 64');
    });
  });

  describe('generateCupRound', () => {
    it('should generate fixtures for 2 teams (Final)', () => {
      const teams = ['team1', 'team2'];
      const fixtures = generateCupRound(teams, 'Final');

      expect(fixtures).toHaveLength(1);
      expect(fixtures[0].round).toBe('Final');
      expect(fixtures[0].homeTeamId).toBeDefined();
      expect(fixtures[0].awayTeamId).toBeDefined();
      expect(fixtures[0].homeScore).toBeNull();
      expect(fixtures[0].awayScore).toBeNull();
    });

    it('should generate fixtures for 4 teams (Semi-finals)', () => {
      const teams = ['team1', 'team2', 'team3', 'team4'];
      const fixtures = generateCupRound(teams, 'Semi-finals');

      expect(fixtures).toHaveLength(2);
      expect(fixtures[0].round).toBe('Semi-finals');
      expect(fixtures[1].round).toBe('Semi-finals');
      
      // Check that all teams are included
      const allTeamIds = fixtures.flatMap(f => [f.homeTeamId, f.awayTeamId]);
      expect(allTeamIds).toHaveLength(4);
      teams.forEach(team => {
        expect(allTeamIds).toContain(team);
      });
    });

    it('should generate fixtures for 8 teams (Quarter-finals)', () => {
      const teams = ['team1', 'team2', 'team3', 'team4', 'team5', 'team6', 'team7', 'team8'];
      const fixtures = generateCupRound(teams, 'Quarter-finals');

      expect(fixtures).toHaveLength(4);
      expect(fixtures.every(f => f.round === 'Quarter-finals')).toBe(true);
      
      // Check that all teams are included
      const allTeamIds = fixtures.flatMap(f => [f.homeTeamId, f.awayTeamId]);
      expect(allTeamIds).toHaveLength(8);
      teams.forEach(team => {
        expect(allTeamIds).toContain(team);
      });
    });

    it('should generate fixtures for 16 teams (Round of 16)', () => {
      const teams = Array.from({ length: 16 }, (_, i) => `team${i + 1}`);
      const fixtures = generateCupRound(teams, 'Round of 16');

      expect(fixtures).toHaveLength(8);
      expect(fixtures.every(f => f.round === 'Round of 16')).toBe(true);
      
      // Check that all teams are included
      const allTeamIds = fixtures.flatMap(f => [f.homeTeamId, f.awayTeamId]);
      expect(allTeamIds).toHaveLength(16);
      teams.forEach(team => {
        expect(allTeamIds).toContain(team);
      });
    });

    it('should return empty array for less than 2 teams', () => {
      expect(generateCupRound([], 'Round 1')).toHaveLength(0);
      expect(generateCupRound(['team1'], 'Round 1')).toHaveLength(0);
    });

    it('should throw error for odd number of teams', () => {
      expect(() => generateCupRound(['team1', 'team2', 'team3'], 'Round 1')).toThrow(
        'Cannot generate cup round: odd number of teams'
      );
    });

    it('should pair teams correctly', () => {
      const teams = ['team1', 'team2', 'team3', 'team4'];
      const fixtures = generateCupRound(teams, 'Semi-finals');

      // Note: Teams are shuffled, so we can't test exact pairing
      // But we can verify structure
      expect(fixtures).toHaveLength(2);
      fixtures.forEach(fixture => {
        expect(fixture.homeTeamId).toBeDefined();
        expect(fixture.awayTeamId).toBeDefined();
        expect(fixture.homeTeamId).not.toBe(fixture.awayTeamId);
        expect(fixture.hostId).toBe(fixture.homeTeamId);
      });
    });
  });
});
