# eArena: Your eFootball Tournament Platform

Welcome to the eArena project documentation. This document provides a comprehensive overview of the application's features, architecture, and core logic.

## 1. Core Features

eArena is a full-featured platform for creating, managing, and competing in eFootball tournaments.

### For Players:
- **Authentication:** Secure user sign-up and login using email/password or Google accounts.
- **User Profiles:** Public player profiles displaying stats, achievements, tournament history, and reputation.
- **Tournament Discovery:** Browse public tournaments or join private ones with a unique code.
- **Team Management:** Create and manage a team roster for tournaments.
- **Match Reporting:** Submit match scores with screenshot evidence for verification.
- **Match Communication:** Real-time chat with opponents for each match.
- **Highlights Reel:** Submit a URL to a highlight clip from a match to be featured on the site.
- **Leaderboards:** Global rankings based on wins, trophies, goals, and reputation.
- **Notifications:** Receive real-time updates on match schedules, tournament events, and direct messages.

### For Organizers:
- **Tournament Creation:** A multi-step form to create customized tournaments with different formats (League, Cup, Champions League), rules, and prize pools.
- **Automated Fixture Generation:** AI-powered scheduling for all tournament formats.
- **Automated Standings:** Live, automated calculation and display of tournament standings.
- **Communication Hub:** Post announcements to all participants and monitor general chat.
- **Dispute Resolution:** A dedicated interface to review and resolve disputed match results.

### For Admins:
- **Admin Dashboard:** A central control panel for platform management.
- **User Management:** View, edit, ban, or unban user accounts.
- **Tournament Oversight:** Monitor all tournaments and intervene if necessary.
- **Dispute Center:** A global view of all disputed matches across the platform.
- **Payout Management:** Track and manage prize money payouts.
- **Platform Settings:** Control global settings like maintenance mode.

---

## 2. Technology Stack

- **Framework:** Next.js (App Router)
- **Language:** TypeScript
- **UI:** React, ShadCN UI, Tailwind CSS
- **State Management:** React Context API for authentication.
- **Backend Services:** Firebase (Authentication, Firestore, Storage)
- **Generative AI:** Google AI & Genkit

---

## 3. Directory Structure

- `/src/app` - Main application routes, following the Next.js App Router convention.
- `/src/components` - Reusable React components.
- `/src/lib` - Core logic, actions, and Firebase configuration.
- `/src/hooks` - Custom React hooks.
- `/src/ai/flows` - All Genkit AI flow definitions.

---

## 4. AI Flows & Core Logic (Genkit)

The platform's intelligence is powered by several Genkit flows.

### `generateTournamentFixtures`
- **Purpose:** Creates a fair and complete match schedule.
- **Input:** A list of team IDs and the tournament format (`league`, `cup`, `champions-league`).
- **Logic:**
  1.  Takes the list of teams and the chosen format.
  2.  The AI shuffles the teams to ensure fairness.
  3.  It generates a round-robin or group-stage-plus-knockout schedule based on the format.
  4.  The output is a structured array of match objects (`{homeTeamId, awayTeamId, round}`).

### `calculateTournamentStandings`
- **Purpose:** Ranks teams in a tournament based on their performance.
- **Input:** An array of teams with their calculated stats (wins, goals, etc.) and optional custom tie-breaker rules.
- **Logic:**
  1.  Analyzes the provided stats for each team.
  2.  Applies standard sports tie-breaking logic (Points > Goal Difference > Goals For) or the custom rules provided.
  3.  Outputs a sorted array of teams with their final ranking, which is then stored in the `standings` collection.

### `predictMatchWinner`
- **Purpose:** Provides an entertaining, pundit-style prediction for an upcoming match.
- **Input:** Key stats for the home and away teams (win rate, avg goals for/against).
- **Logic:**
  1.  Compares the offensive and defensive stats of the two teams.
  2.  Makes a call on the likely winner, even if the stats are close.
  3.  Generates a confidence score and a short, flavorful sentence explaining the reasoning.

### `analyzePlayerPerformance`
- **Purpose:** Gives players a personalized analysis of their career performance.
- **Input:** A player's complete career statistics.
- **Logic:**
  1.  Evaluates the player's stats (goals, passes, tackles, etc.).
  2.  Categorizes the player into a descriptive archetype (e.g., 'Clinical Finisher', 'Midfield Maestro').
  3.  Generates a two-sentence analysis highlighting a key strength and a constructive area for improvement.

### `verifyMatchScores` (Most Complex Flow)
- **Purpose:** To act as an impartial AI referee, verifying match results from screenshot evidence and extracting detailed stats.
- **Input:** An array of evidence (screenshots), team names, and match date. Evidence is typed as either `match_stats` (primary) or `match_history` (secondary).
- **Logic:** The flow follows a strict, multi-phase protocol:
  1.  **Phase 1: Analyze Primary Evidence (`match_stats`)**
      - It first looks for `match_stats` screenshots. These are the end-of-game screens with detailed statistics.
      - **If only one is provided:** It trusts the evidence, extracts the score and *all detailed stats*, and sets the status to `verified`.
      - **If two are provided and they match:** It verifies the result, extracts stats, and sets the status to `verified`.
      - **If they conflict or are unreadable:** It sets the status to `needs_secondary_evidence` and requests `match_history` screenshots from both players.
  2.  **Phase 2: Analyze Secondary Evidence (`match_history`)**
      - This phase is triggered if primary evidence fails. The AI scans the `match_history` screenshots.
      - **If a valid entry is found:** It uses that score as the final result and sets the status to `verified`. Crucially, **no detailed stats are extracted** in this case; this acts as a "stats penalty" for the initial dispute.
      - **If evidence is still contradictory:** It flags a potential cheater and sets the status to `replay_required`.
      - **If no valid entry is found:** The evidence is deemed inconclusive, and the status is set to `replay_required`.
  3.  **Output:** Returns a final status (`verified`, `disputed`, etc.), the confirmed scores, the extracted stats (if any), and a reasoning for its decision.

This rigorous, step-by-step logic ensures fair and automated resolution for the vast majority of match reports, minimizing the need for manual organizer intervention.
