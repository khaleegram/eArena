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
- **Automated Fixture Generation:** Logic-based, deterministic scheduling for all tournament formats.
- **Automated Standings:** Live, automated calculation and display of tournament standings based on match results.
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

## 4. Tournament Logic & AI Flows

The platform's intelligence and automation are powered by a combination of deterministic logical functions and Genkit AI flows.

### Core Logic (Deterministic)

#### `generateRoundRobinFixtures` (in `src/lib/actions.ts`)
- **Purpose:** Creates a fair and complete match schedule for round-robin stages. This function **does not use AI** to ensure correctness.
- **Input:** A list of team IDs and a boolean for `homeAndAway`.
- **Logic:**
  1.  It systematically pairs each team ID against every other team ID once.
  2.  If `homeAndAway` is true, it generates a second set of fixtures, swapping the home and away teams.
  3.  The output is a structured array of match objects (`{homeTeamId, awayTeamId, round}`), which are then assigned dates and written to the database.

#### `updateStandings` (in `src/lib/actions.ts`)
- **Purpose:** Calculates and ranks teams in a tournament based on performance. This function **does not use AI** to ensure accuracy.
- **Logic:**
  1.  Triggered every time a match result is approved.
  2.  Fetches all `approved` matches for the tournament.
  3.  Iterates through the results to calculate each team's stats (Points, Wins, Draws, Losses, Goals For, Goals Against, Goal Difference, Clean Sheets).
  4.  Sorts all teams based on standard football tie-breaking rules: Points > Goal Difference > Goals For > Wins.
  5.  Saves the final, sorted list to the `standings` collection, which is displayed on the tournament page.

### AI-Powered Flows (Genkit)

#### `predictMatchWinner`
- **Purpose:** Provides an entertaining, pundit-style prediction for an upcoming match.
- **Input:** Key stats for the home and away teams (win rate, avg goals for/against).
- **Logic:**
  1.  Compares the offensive and defensive stats of the two teams.
  2.  Makes a call on the likely winner, even if the stats are close.
  3.  Generates a confidence score and a short, flavorful sentence explaining the reasoning.

#### `analyzePlayerPerformance`
- **Purpose:** Gives players a personalized analysis of their career performance.
- **Input:** A player's complete career statistics.
- **Logic:**
  1.  Evaluates the player's stats (goals, passes, tackles, etc.).
  2.  Categorizes the player into a descriptive archetype (e.g., 'Clinical Finisher', 'Midfield Maestro').
  3.  Generates a two-sentence analysis highlighting a key strength and a constructive area for improvement.

#### `verifyMatchScores` (Most Complex Flow)
- **Purpose:** To act as an impartial AI referee, verifying match results from screenshot evidence and extracting detailed stats. This is a hybrid system where the AI's visual analysis is governed by a strict logical protocol.
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

---

## 5. Configuration & Deployment

### Environment Variables
To run the application, you'll need to set up your environment variables. Create a `.env.local` file in the root of the project and add the necessary keys from `.env.example`.

### Cron Jobs (Automated Tasks)
This project uses GitHub Actions for scheduled tasks like updating standings and starting tournaments. To make this work, you need to add two secrets to your GitHub repository settings:

1.  **`CRON_URL`**: This is the full, absolute URL to your deployed application's daily cron API endpoint. For your app, this will be: `https://e-arena.vercel.app/api/cron/daily`
2.  **`CRON_SECRET`**: This should be a long, random, and secure string that you generate. You must add the same secret to your Vercel deployment environment variables. This secret ensures that only authorized requests can trigger your cron jobs.

**How to add secrets in GitHub:**
1. Go to your repository on GitHub.
2. Click on the "Settings" tab.
3. In the left sidebar, navigate to "Secrets and variables" > "Actions".
4. Click "New repository secret" to add `CRON_URL` and `CRON_SECRET`.
