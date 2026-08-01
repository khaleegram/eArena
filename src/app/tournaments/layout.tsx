import type { Metadata } from 'next';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({
  title: 'Browse Public Tournaments',
  description:
    'Browse open, live, and upcoming eFootball tournaments on eArena. Filter by status, search by game or platform, and join the competition.',
  path: '/tournaments',
  keywords: [
    'browse eFootball tournaments',
    'public tournaments',
    'join eFootball league',
    'eArena tournaments',
  ],
});

export default function TournamentsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
