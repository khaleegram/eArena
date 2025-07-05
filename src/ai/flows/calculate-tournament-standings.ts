
'use server';
/**
 * @fileOverview A Genkit flow to calculate tournament standings based on pre-calculated team stats,
 * using GenAI to resolve complex tie-breaker scenarios.
 *
 * - calculateTournamentStandings - A function that ranks teams based on stats and rules.
 * - CalculateTournamentStandingsInput - The input type for the calculateTournamentStandings function.
 * - CalculateTournamentStandingsOutput - The return type for the calculateTournamentStandings function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'zod';

const TeamStatsForRankingSchema = z.object({
  teamId: z.string(),
  matchesPlayed: z.number(),
  wins: z.number(),
  losses: z.number(),
  draws: z.number(),
  goalsFor: z.number(),
  goalsAgainst: z.number(),
  points: z.number(),
  cleanSheets: z.number(),
});

const CalculateTournamentStandingsInputSchema = z.object({
  teamsWithStats: z.array(TeamStatsForRankingSchema),
  tieBreakerRules: z.string().optional().describe('Optional tie-breaker rules to apply.'),
});
export type CalculateTournamentStandingsInput = z.infer<typeof CalculateTournamentStandingsInputSchema>;

const CalculateTournamentStandingsOutputSchema = z.array(
  z.object({
    teamId: z.string().describe('The ID of the team.'),
    matchesPlayed: z.number().describe('Number of matches played.'),
    wins: z.number().describe('Number of wins.'),
    losses: z.number().describe('Number of losses.'),
    draws: z.number().describe('Number of draws.'),
    goalsFor: z.number().describe('Total goals scored by the team.'),
    goalsAgainst: z.number().describe('Total goals conceded by the team.'),
    points: z.number().describe('Total points earned by the team.'),
    ranking: z.number().describe('The rank of the team in the tournament.'),
    cleanSheets: z.number().describe('Number of matches where the team conceded zero goals.'),
  })
).describe('An array of team standings for the tournament, sorted by ranking.');
export type CalculateTournamentStandingsOutput = z.infer<typeof CalculateTournamentStandingsOutputSchema>;

export async function calculateTournamentStandings(input: CalculateTournamentStandingsInput): Promise<CalculateTournamentStandingsOutput> {
  return calculateTournamentStandingsFlow(input);
}

const calculateTournamentStandingsPrompt = ai.definePrompt({
  name: 'calculateTournamentStandingsPrompt',
  input: {schema: CalculateTournamentStandingsInputSchema},
  output: {schema: CalculateTournamentStandingsOutputSchema},
  prompt: `You are an expert tournament statistician. Your only task is to RANK the following teams from 1 to N based on their stats.

Here are the teams and their calculated stats:
{{#each teamsWithStats}}
- Team ID: {{this.teamId}}, Pts: {{this.points}}, GD: {{math this.goalsFor '-' this.goalsAgainst}}, GF: {{this.goalsFor}}, W: {{this.wins}}
{{/each}}

Tie-Breaker Rules (if any):
{{tieBreakerRules}}

If no specific rules are provided, use standard sports tie-breaking procedures in this order:
1. Points (Pts)
2. Goal Difference (GD = Goals For - Goals Against)
3. Goals For (GF)
4. Wins (W)

Your output MUST be a JSON array where each object contains the team's 'teamId' and their final 'ranking'. You MUST include all the other stats (matchesPlayed, wins, etc.) for each team in the final output object, exactly as they were provided in the input. The final array should be sorted by the 'ranking' field, from 1 to N.
`,
});

const calculateTournamentStandingsFlow = ai.defineFlow(
  {
    name: 'calculateTournamentStandingsFlow',
    inputSchema: CalculateTournamentStandingsInputSchema,
    outputSchema: CalculateTournamentStandingsOutputSchema,
  },
  async input => {
    if (input.teamsWithStats.length === 0) {
      return [];
    }
    const {output} = await calculateTournamentStandingsPrompt(input);
    // Ensure the output is sorted by ranking, as a fallback to the AI's instruction
    return output!.sort((a, b) => a.ranking - b.ranking);
  }
);
