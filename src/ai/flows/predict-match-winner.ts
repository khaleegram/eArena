
'use server';
/**
 * @fileOverview A Genkit flow to predict a match winner based on team stats.
 *
 * - predictMatchWinner - A function that provides an entertaining prediction.
 * - PredictWinnerInput - The input type for the predictMatchWinner function.
 * - PredictWinnerOutput - The return type for the predictMatchWinner function.
 */

import { ai } from '@/ai/genkit';
import { z } from 'zod';

const TeamStatsInputSchema = z.object({
  teamName: z.string().describe('The name of the team.'),
  winPercentage: z.number().describe('The overall win percentage of the team.'),
  avgGoalsFor: z.number().describe('The average goals scored per match.'),
  avgGoalsAgainst: z.number().describe('The average goals conceded per match.'),
});

const PredictWinnerInputSchema = z.object({
  homeTeam: TeamStatsInputSchema,
  awayTeam: TeamStatsInputSchema,
});
export type PredictWinnerInput = z.infer<typeof PredictWinnerInputSchema>;

const PredictWinnerOutputSchema = z.object({
  predictedWinnerName: z.string().describe("The name of the team predicted to win."),
  confidence: z.number().min(50).max(100).describe("A confidence score for the prediction, from 50 (toss-up) to 100 (very confident)."),
  reasoning: z.string().describe("A short, one-sentence analysis explaining the prediction, written in the style of a sports pundit."),
});
export type PredictWinnerOutput = z.infer<typeof PredictWinnerOutputSchema>;

export async function predictMatchWinner(input: PredictWinnerInput): Promise<PredictWinnerOutput> {
  return predictMatchWinnerFlow(input);
}

const prompt = ai.definePrompt({
  name: 'predictMatchWinnerPrompt',
  input: { schema: PredictWinnerInputSchema },
  output: { schema: PredictWinnerOutputSchema },
  system: "You are an enthusiastic eFootball commentator and analyst. Your predictions are for entertainment purposes only and should be delivered with a bit of flair. Always provide a clear winner.",
  prompt: `Analyze the upcoming match between {{homeTeam.teamName}} and {{awayTeam.teamName}}.

Here are their key stats:
**{{homeTeam.teamName}}**:
- Win Rate: {{homeTeam.winPercentage}}%
- Avg. Goals For: {{homeTeam.avgGoalsFor}}
- Avg. Goals Against: {{homeTeam.avgGoalsAgainst}}

**{{awayTeam.teamName}}**:
- Win Rate: {{awayTeam.winPercentage}}%
- Avg. Goals For: {{awayTeam.avgGoalsFor}}
- Avg. Goals Against: {{awayTeam.avgGoalsAgainst}}

Based on these stats, predict a winner. Provide a confidence score and a concise, pundit-style reasoning for your choice. A higher goal average and win rate are strong indicators. A low goals against average shows strong defense. If stats are very close, make a call but keep the confidence score lower (e.g., 50-60%).
`,
});

const predictMatchWinnerFlow = ai.defineFlow(
  {
    name: 'predictMatchWinnerFlow',
    inputSchema: PredictWinnerInputSchema,
    outputSchema: PredictWinnerOutputSchema,
  },
  async input => {
    const { output } = await prompt(input);
    return output!;
  }
);
