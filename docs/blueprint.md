# **App Name**: eArena

## Core Features:

- Authentication: User authentication with email/password and Google sign-in, plus logout functionality.
- Organizer Dashboard: Dashboard for organizers to manage tournaments, including sections for 'My Tournaments', 'Create New Tournament', and 'Profile Settings'.
- Tournament Creation: Form to create tournaments with fields for name, description, game, platform, dates, max teams, and rules, stored in Firestore.
- Tournament Detail Page: Display all tournament information with tabs for Overview, Teams, Players, Fixtures, Standings, Brackets, and organizer actions.
- Team Management: Form to add teams to a tournament, including team name and logo upload.
- Match Result Submission and Approval: Allow participating players to submit scores with screenshot/video evidence; let tournament organizer approve or reject submitted result.
- Automated Standings: Trigger a Cloud Function to automatically update standings based on approved match results. Tool is used to determine standings for team in edge cases (tie-breakers).

## Style Guidelines:

- Primary color: Saturated blue (#2563EB) for a competitive and modern feel.
- Background color: Light blue (#F0F9FF) for a clean and unobtrusive background.
- Accent color: Purple (#7C3AED) to highlight interactive elements.
- Body: 'PT Sans' sans-serif for a neutral, readable style.
- Headlines: 'Playfair' serif for elegant, fashionable headings.
- Use modern, flat icons related to sports and competition.
- Subtle animations for transitions and loading states to enhance UX.