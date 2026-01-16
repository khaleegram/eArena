import { vi } from 'vitest';

// Mock server actions
export const mockServerActions = {
  createTournament: vi.fn(),
  updateTournament: vi.fn(),
  deleteTournament: vi.fn(),
  reportMatchScore: vi.fn(),
  approveMatchResult: vi.fn(),
  getUserProfile: vi.fn(),
  getPlayerStats: vi.fn(),
  getTournaments: vi.fn(),
  getMatches: vi.fn(),
  getStandings: vi.fn(),
};

// Helper to reset all mocks
export const resetServerActionMocks = () => {
  Object.values(mockServerActions).forEach((mock) => {
    if (typeof mock === 'function' && 'mockReset' in mock) {
      mock.mockReset();
    }
  });
};
