
'use server';
/**
 * @fileOverview A Genkit flow to generate a sports-journalist-style summary of a completed match.
 *
 * - generateMatchSummary - Creates a narrative summary of the match.
 * - GenerateMatchSummaryInput - The input type for the flow.
 * - GenerateMatchSummaryOutput - The return type for the flow.
 */

import { ai } from '@/ai/genkit';
import { z } from 'zod';

const TeamStatsSchema = z.object({
  name: z.string(),
  score: z.number(),
  shotsOnTarget: z.number().optional(),
  possession: z.number().optional(),
  saves: z.number().optional(),
});

const GenerateMatchSummaryInputSchema = z.object({
  homeTeam: TeamStatsSchema,
  awayTeam: TeamStatsSchema,
});
export type GenerateMatchSummaryInput = z.infer<typeof GenerateMatchSummaryInputSchema>;

const GenerateMatchSummaryOutputSchema = z.object({
  summary: z.string().describe("A 2-3 sentence summary of the match written in the style of a sports journalist, highlighting key moments or standout stats."),
});
export type GenerateMatchSummaryOutput = z.infer<typeof GenerateMatchSummaryOutputSchema>;

export async function generateMatchSummary(input: GenerateMatchSummaryInput): Promise<GenerateMatchSummaryOutput> {
  return generateMatchSummaryFlow(input);
}

const prompt = ai.definePrompt({
  name: 'generateMatchSummaryPrompt',
  input: { schema: GenerateMatchSummaryInputSchema },
  output: { schema: GenerateMatchSummaryOutputSchema },
  system: "You are a creative and insightful sports journalist for eFootball. Your tone is professional but engaging. You write concise summaries that capture the story of the match.",
  prompt: `
    Write a 2-3 sentence summary for the following eFootball match.

    Match Details:
    - Home Team: {{homeTeam.name}} (Score: {{homeTeam.score}})
    - Away Team: {{awayTeam.name}} (Score: {{awayTeam.score}})

    Key Stats (if available):
    - {{homeTeam.name}} Shots on Target: {{homeTeam.shotsOnTarget}}
    - {{awayTeam.name}} Shots on Target: {{awayTeam.shotsOnTarget}}
    - {{homeTeam.name}} Possession: {{homeTeam.possession}}%
    - {{awayTeam.name}} Possession: {{awayTeam.possession}}%
    - {{homeTeam.name}} Goalkeeper Saves: {{homeTeam.saves}}
    - {{awayTeam.name}} Goalkeeper Saves: {{awayTeam.saves}}

    Instructions:
    1.  Start with the result (who won and the score).
    2.  If the score is close, describe it as a "narrow victory", "tense showdown", or "hard-fought battle".
    3.  If one team won by a large margin, describe it as a "dominant performance" or "commanding victory".
    4.  If stats are available, weave one or two key stats into the narrative to explain HOW the result happened. For example, if a team won despite having lower possession, mention their clinical finishing. If a keeper made many saves, highlight their heroic performance.
    5.  Do not just list the stats. Create a compelling narrative.
    
    Example:
    "In a tense showdown, Team A clinched a narrow 2-1 victory over Team B. While Team B dominated possession, it was Team A's clinical finishing, scoring twice from just three shots on target, that ultimately decided the nail-biting contest."
  `,
});

const generateMatchSummaryFlow = ai.defineFlow(
  {
    name: 'generateMatchSummaryFlow',
    inputSchema: GenerateMatchSummaryInputSchema,
    outputSchema: GenerateMatchSummaryOutputSchema,
  },
  async (input) => {
    const { output } = await prompt(input);
    return output!;
  }
);
