
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
  prompt: `You are a tournament scheduler. Your task is to generate a complete and valid set of match fixtures for a tournament based on the provided list of team IDs and the specified format. It is crucial that the output is a valid JSON array of match objects.

Tournament Details:
- Team IDs: {{#each teamIds}} {{this}} {{/each}}
- Format: {{format}}

Instructions:
1.  **Shuffle Teams for Fairness**: Before generation, randomly shuffle the list of team IDs to ensure a fair draw.
2.  **League Format**: Generate a single round-robin schedule. Every team must play every other team exactly once. Label rounds as "Round 1", "Round 2", etc.
3.  **Cup Format**: This is a group stage followed by a single-elimination knockout.
    *   First, divide teams into balanced groups (e.g., 4 groups of 4 for 16 teams).
    *   For each group, generate a single round-robin schedule (e.g., "Group A", "Group B").
    *   Then, create a single-elimination knockout bracket for a sensible number of advancing teams (e.g., top 2 from each group).
    *   Label knockout rounds clearly: "Quarter-Final", "Semi-Final", "Final".
4.  **Champions League Format**: This is a group stage followed by a single-elimination knockout.
    *   Assume teams are provided in seeded pots (e.g., for 16 teams, IDs 1-4 are Pot 1, 5-8 Pot 2, etc.). Create balanced groups by drawing one team from each pot into each group.
    *   For each group, generate a **double round-robin** schedule (home and away).
    *   Then, create a single-elimination knockout bracket for the advancing teams.
    *   Label rounds clearly: "Group A", "Round of 16", "Quarter-Final", "Semi-Final", "Final".
5.  **Output**:
    *   Ensure the output is a valid JSON array of match objects.
    *   Each object MUST contain 'homeTeamId', 'awayTeamId', and 'round'.
    *   A team cannot play against itself.
    *   Ensure all teams are included in the generated fixtures for the initial stage.
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
