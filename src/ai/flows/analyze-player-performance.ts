
'use server';
/**
 * @fileOverview A Genkit flow to analyze player performance stats and generate an archetype and textual analysis.
 *
 * - analyzePlayerPerformance - Analyzes stats to provide insights.
 * - PlayerPerformanceInput - The input type (player stats).
 * - PlayerPerformanceOutput - The return type (analysis and archetype).
 */

import { ai } from '@/ai/genkit';
import { z } from 'zod';

// We define a Zod schema that matches the structure of the stats we need for analysis.
const PlayerStatsSchema = z.object({
  totalMatches: z.number(),
  totalWins: z.number(),
  totalLosses: z.number(),
  totalDraws: z.number(),
  totalGoals: z.number(),
  totalConceded: z.number(),
  totalCleanSheets: z.number(),
  avgPossession: z.number(),
  totalShots: z.number(),
  totalShotsOnTarget: z.number(),
  totalPasses: z.number(),
  totalTackles: z.number(),
  totalInterceptions: z.number(),
  totalSaves: z.number(),
});

export type PlayerPerformanceInput = z.infer<typeof PlayerStatsSchema>;

const PlayerPerformanceOutputSchema = z.object({
  archetype: z.string().describe("A concise player archetype based on their stats (e.g., 'Clinical Finisher', 'Midfield General', 'Defensive Rock')."),
  analysis: z.string().describe("A brief, insightful analysis of the player's strengths and one area for improvement, written in a helpful and encouraging tone."),
});
export type PlayerPerformanceOutput = z.infer<typeof PlayerPerformanceOutputSchema>;

export async function analyzePlayerPerformance(input: PlayerPerformanceInput): Promise<PlayerPerformanceOutput> {
  return analyzePlayerPerformanceFlow(input);
}

const prompt = ai.definePrompt({
  name: 'analyzePlayerPerformancePrompt',
  input: { schema: PlayerStatsSchema },
  output: { schema: PlayerPerformanceOutputSchema },
  prompt: `You are an expert eFootball performance analyst. Your task is to provide a concise, insightful analysis and determine a player archetype based on their career statistics.

Player Career Statistics:
- Matches Played: {{totalMatches}}
- Wins: {{totalWins}}
- Losses: {{totalLosses}}
- Draws: {{totalDraws}}
- Goals Scored: {{totalGoals}}
- Goals Conceded: {{totalConceded}}
- Clean Sheets: {{totalCleanSheets}}
- Average Possession: {{avgPossession}}%
- Total Shots: {{totalShots}}
- Shots on Target: {{totalShotsOnTarget}}
- Total Passes: {{totalPasses}}
- Total Tackles: {{totalTackles}}
- Total Interceptions: {{totalInterceptions}}
- Total Saves: {{totalSaves}}

Instructions:
1.  **Determine Archetype:** Based on the stats, classify the player into a single, fitting archetype. Examples:
    *   High goals & shots: 'Clinical Finisher' or 'Goal Poacher'
    *   High passes & possession: 'Midfield Maestro' or 'Deep-Lying Playmaker'
    *   High tackles, interceptions & low conceded: 'Defensive Rock' or 'Stalwart Defender'
    *   High saves: 'Shot Stopper'
    *   Balanced stats: 'All-Rounder' or 'Box-to-Box Midfielder'
    *   Be creative but keep it grounded in the data.

2.  **Write Analysis:**
    *   Provide a short, two-sentence analysis.
    *   The first sentence should highlight one or two key strengths evident from the stats.
    *   The second sentence should gently suggest one area for improvement.
    *   The tone should be encouraging and constructive.

Example Output:
{
  "archetype": "Midfield Maestro",
  "analysis": "Your high pass count and impressive possession stats show excellent control of the game's tempo. Focusing on converting that control into more shots on target could elevate your attacking threat."
}
`,
});

const analyzePlayerPerformanceFlow = ai.defineFlow(
  {
    name: 'analyzePlayerPerformanceFlow',
    inputSchema: PlayerStatsSchema,
    outputSchema: PlayerPerformanceOutputSchema,
  },
  async input => {
    // If there are no matches, return a default state.
    if (input.totalMatches === 0) {
        return {
            archetype: "Newcomer",
            analysis: "Play some matches to get your performance analysis! We're excited to see what you can do.",
        };
    }
    const { output } = await prompt(input);
    return output!;
  }
);
