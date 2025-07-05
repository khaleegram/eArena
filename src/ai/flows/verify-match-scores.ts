

'use server';
/**
 * @fileOverview A Genkit flow to verify match results by analyzing screenshots from both teams,
 * and extracting detailed match statistics. It intelligently handles discrepancies and validates evidence.
 *
 * - verifyMatchScores - Compares screenshots to determine the correct score and extracts stats.
 * - VerifyMatchScoresInput - The input type for the verifyMatchScores function.
 * - VerifyMatchScoresOutput - The return type for the verifyMatchScores function.
 */

import { ai } from '@/ai/genkit';
import { z } from 'zod';

const TeamMatchStatsSchema = z.object({
  possession: z.number().describe("Team's possession percentage (e.g., 58 for 58%)."),
  shots: z.number().describe("Total shots taken."),
  shotsOnTarget: z.number().describe("Shots on target."),
  fouls: z.number().describe("Fouls committed."),
  offsides: z.number().describe("Number of offsides."),
  cornerKicks: z.number().describe("Number of corner kicks."),
  freeKicks: z.number().describe("Number of free kicks."),
  passes: z.number().describe("Total passes."),
  successfulPasses: z.number().describe("Number of successful passes."),
  crosses: z.number().describe("Number of crosses."),
  interceptions: z.number().describe("Number of interceptions."),
  tackles: z.number().describe("Number of tackles."),
  saves: z.number().describe("Number of saves made by the goalkeeper."),
  pkScore: z.number().optional().describe("Score in the penalty shootout, if applicable."),
});

const EvidenceSchema = z.object({
    type: z.enum(['match_stats', 'match_history']).describe("The type of screenshot provided: 'match_stats' is the primary evidence from the end-of-game screen, 'match_history' is the secondary evidence from the user's game history list."),
    imageUri: z.string().describe("The screenshot as a data URI."),
    teamName: z.string().describe("The name of the team who submitted this evidence."),
});

const VerifyMatchScoresInputSchema = z.object({
  evidence: z.array(EvidenceSchema).describe("An array of evidence objects submitted by the teams."),
  homeTeamName: z.string().describe("The name of the home team."),
  awayTeamName: z.string().describe("The name of the away team."),
  scheduledDate: z.string().describe("The scheduled date of the match in ISO 8601 format."),
  roomCodeSetAt: z.string().optional().describe("The timestamp (ISO 8601 format) when the match room code was set, to help identify the correct match in history."),
});
export type VerifyMatchScoresInput = z.infer<typeof VerifyMatchScoresInputSchema>;

const VerifiedScoresSchema = z.object({
    homeScore: z.number().describe("The verified score for the home team."),
    awayScore: z.number().describe("The verified score for the away team."),
    pkHomeScore: z.number().optional().describe("The verified penalty shootout score for the home team, if applicable."),
    pkAwayScore: z.number().optional().describe("The verified penalty shootout score for the away team, if applicable."),
});

const VerifyMatchScoresOutputSchema = z.object({
  verificationStatus: z.enum(['verified', 'disputed', 'needs_secondary_evidence', 'replay_required']).describe("The result of the verification process."),
  verifiedScores: VerifiedScoresSchema.optional().describe("The verified scores, if the status is 'verified'."),
  reasoning: z.string().describe("A brief explanation of the verification result, noting any discrepancies or issues."),
  homeStats: TeamMatchStatsSchema.optional().describe('Detailed match stats for the home team.'),
  awayStats: TeamMatchStatsSchema.optional().describe('Detailed match stats for the away team.'),
  cheatingFlag: z.string().optional().describe("The user ID of a player flagged for submitting falsified records, if detected.")
});
export type VerifyMatchScoresOutput = z.infer<typeof VerifyMatchScoresOutputSchema>;

export async function verifyMatchScores(input: VerifyMatchScoresInput): Promise<VerifyMatchScoresOutput> {
  return verifyMatchScoresFlow(input);
}

const prompt = ai.definePrompt({
  name: 'verifyMatchScoresPrompt',
  input: { schema: VerifyMatchScoresInputSchema },
  output: { schema: VerifyMatchScoresOutputSchema },
  prompt: `You are an impartial and highly accurate eFootball tournament referee. Your task is to verify a match result by analyzing screenshot evidence. You must determine the correct score and extract detailed match stats following a strict protocol.

**Match Details:**
- Home Team: {{homeTeamName}}
- Away Team: {{awayTeamName}}
- Scheduled Match Date: {{scheduledDate}}
{{#if roomCodeSetAt}}- Room Code Set Time: {{roomCodeSetAt}} (This is the most likely time the match was played. Prioritize match history entries closest to this time.){{/if}}

**Submitted Evidence:**
{{#each evidence}}
- Evidence from {{this.teamName}} (Type: {{this.type}}): {{media url=this.imageUri}}
{{/each}}

**Verification Protocol (Follow these steps exactly):**

**Phase 1: Analyze Primary Evidence ('match_stats' screenshots)**
1.  Examine all submitted 'match_stats' screenshots. This is your primary source of truth.
2.  **CRITICAL STATS EXTRACTION:** For any 'match_stats' screenshot, you MUST extract the full set of detailed statistics listed in the output schema. If a stat is not visible or is zero, return 0 for it. The 'homeStats' and 'awayStats' objects MUST be present in the output if you are processing primary evidence. Do not omit them. For each screenshot, identify the final score and assign it to the correct teams based on the names in the screenshot ({{homeTeamName}} and {{awayTeamName}}). If the match was a knockout and required a penalty shootout, extract the PK score if visible.
3.  **Compare Evidence:**
    *   **If only one 'match_stats' screenshot is provided:** Verify the score and stats from this single piece of evidence. If it is readable and valid, set 'verificationStatus' to 'verified' and extract the stats.
    *   **If both 'match_stats' screenshots are provided and show the exact same score for the correct teams:** The result is verified. Set 'verificationStatus' to 'verified'. The 'reasoning' should state that both primary reports were consistent. Extract all detailed stats from one of the screenshots into 'homeStats' and 'awayStats'.
    *   **If the 'match_stats' screenshots show conflicting scores, or if one or both are unreadable/irrelevant:** Set 'verificationStatus' to 'needs_secondary_evidence'. The reasoning must state that primary evidence is conflicting or invalid and that secondary 'match_history' evidence is now required from both players.

**Phase 2: Analyze Secondary Evidence ('match_history' screenshots)**
(This phase is only relevant if the input contains evidence of type 'match_history').
1.  **Scan for Valid Entry:** Scan the 'match_history' image(s) to find an entry matching the teams and the 'scheduledDate'. The date and teams must match exactly.
2.  **Precise Match Identification:** Identify the exact tournament fixture by matching the scheduled date and participating team names. If 'Room Code Set Time' is provided, prioritize the match history entry closest to that time if multiple valid matches are found on the same day.
3.  **Cheating Detection:** If one player submits a valid 'match_history' and the other player's evidence (either 'match_stats' or 'match_history') clearly contradicts it (e.g., shows a different match or score for the same fixture), this is potential cheating. In your 'reasoning', state which team submitted the valid proof and which submitted the contradictory evidence. Set the 'cheatingFlag' to the user ID of the player who submitted the falsified evidence.
4.  **Verification Outcome:**
    *   **If a valid, readable entry is found in at least one 'match_history' screenshot:** Use its score as the final result. Set 'verificationStatus' to 'verified'.
    *   **Stats Handling on Secondary Verification:** If verification is successful *only* because of secondary evidence, you MUST NOT extract detailed stats. The 'homeStats' and 'awayStats' fields must be omitted from the output. The 'reasoning' should state that the result was confirmed via match history, and that a stats penalty is applied due to the initial dispute.
    *   **If no valid entry is found, or evidence is still contradictory:** A replay is required. Set 'verificationStatus' to 'replay_required'. The reasoning must state that the match history evidence is inconclusive and a replay is necessary.
5.  **Dispute:** Only set 'verificationStatus' to 'disputed' if there is a catastrophic system error and you, the AI, cannot process the information at all.

**Final Outcome:**
-   **verified:** The score is confirmed by a single valid 'match_stats', matching 'match_stats' OR a definitive 'match_history' entry.
-   **needs_secondary_evidence:** Primary evidence is conflicting or invalid.
-   **replay_required:** Evidence remains insufficient or contradictory after analyzing all provided types.
-   **disputed:** A system error occurred. Requires organizer review.
`,
});

const verifyMatchScoresFlow = ai.defineFlow(
  {
    name: 'verifyMatchScoresFlow',
    inputSchema: VerifyMatchScoresInputSchema,
    outputSchema: VerifyMatchScoresOutputSchema,
  },
  async (input) => {
    const { output } = await prompt(input);
    return output!;
  }
);
