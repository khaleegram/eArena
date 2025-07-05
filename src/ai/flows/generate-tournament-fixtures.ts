
'use server';
/**
 * @fileOverview A Genkit flow to generate tournament fixtures based on a list of teams and a specified format.
 *
 * - generateTournamentFixtures - A function that creates a schedule of matches.
 * - GenerateFixturesInput - The input type for the generateTournamentFixtures function.
 * - GenerateFixturesOutput - The return type for the generateTournamentFixtures function.
 */

import { ai } from '@/ai/genkit';
import { z } from 'zod';
import type { TournamentFormat } from '@/lib/types';

const GenerateFixturesInputSchema = z.object({
  teamIds: z.array(z.string()).describe('An array of team IDs participating in the tournament.'),
  format: z.custom<TournamentFormat>().describe("The tournament format: 'league', 'cup', or 'champions-league'."),
});
export type GenerateFixturesInput = z.infer<typeof GenerateFixturesInputSchema>;

const GenerateFixturesOutputSchema = z.array(
    z.object({
        homeTeamId: z.string().describe('The ID of the home team.'),
        awayTeamId: z.string().describe('The ID of the away team.'),
        round: z.string().describe('The round or stage of the tournament this match belongs to (e.g., "Round 1", "Quarter-Final", "Group A").'),
    })
).describe('An array of generated match fixtures.');
export type GenerateFixturesOutput = z.infer<typeof GenerateFixturesOutputSchema>;

export async function generateTournamentFixtures(input: GenerateFixturesInput): Promise<GenerateFixturesOutput> {
  return generateFixturesFlow(input);
}

const prompt = ai.definePrompt({
  name: 'generateFixturesPrompt',
  input: { schema: GenerateFixturesInputSchema },
  output: { schema: GenerateFixturesOutputSchema },
  prompt: `You are a tournament scheduler. Your task is to generate a complete set of match fixtures for a tournament based on the provided list of team IDs and the specified format.

Tournament Details:
- Team IDs: {{#each teamIds}} {{this}} {{/each}}
- Format: {{format}}

Instructions:
1.  **Shuffle Teams (for fairness)**: Before creating fixtures, you should conceptually shuffle the list of team IDs to ensure fairness, unless the format is 'champions-league' where pot-based seeding is used.
2.  **League Format**: If the format is 'league', generate a single round-robin schedule where every team plays every other team exactly once. Label each set of matches as "Round 1", "Round 2", etc.
3.  **Cup Format (Groups + Knockout)**: If the format is 'cup', first divide the teams into balanced groups (e.g., for 12 teams, create 3 groups of 4). For each group, generate a *single* round-robin schedule. After the group stage, create a single-elimination knockout bracket for the top advancing teams (e.g., top 2 from each group). Label rounds appropriately: "Group A", "Group B", "Quarter-Final", "Semi-Final", "Final".
4.  **Champions League Format (UCL Style)**: If the format is 'champions-league', this implies a group stage with seeded pots followed by a knockout stage. Assume the teams are provided in pot order (e.g., for 16 teams, IDs 1-4 are Pot 1, 5-8 are Pot 2, etc.). Create balanced groups by placing one team from each pot into each group. For each group, generate a *double* round-robin schedule (home and away). Then, create a single-elimination knockout bracket for the advancing teams. Label rounds: "Group A", "Group B", "Round of 16", "Quarter-Final", "Semi-Final", "Final".
5.  **Output**: Ensure the output is a valid JSON array of match objects, each containing 'homeTeamId', 'awayTeamId', and 'round'. Do not create matches where a team plays against itself. Ensure all teams are included in the fixtures. The fixtures should cover both group and knockout stages where applicable.
`,
});

const generateFixturesFlow = ai.defineFlow(
  {
    name: 'generateFixturesFlow',
    inputSchema: GenerateFixturesInputSchema,
    outputSchema: GenerateFixturesOutputSchema,
  },
  async input => {
    const { output } = await prompt(input);
    return output!;
  }
);
