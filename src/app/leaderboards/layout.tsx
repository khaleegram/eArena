import type { Metadata } from 'next';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({
  title: 'Leaderboards',
  description:
    'See top eArena players by wins, trophies, goals, and reputation. Climb the ranks in the eFootball community.',
  path: '/leaderboards',
  keywords: ['eFootball leaderboard', 'eArena rankings', 'top players', 'esports rankings'],
});

export default function LeaderboardsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
