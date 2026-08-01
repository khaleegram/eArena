import type { Metadata } from 'next';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({
  title: 'Community',
  description:
    'News, guides, and updates from the eArena community. Learn how to run better eFootball tournaments and stay on top of the meta.',
  path: '/community',
  keywords: ['eArena community', 'eFootball guides', 'esports news', 'tournament tips'],
});

export default function CommunityLayout({ children }: { children: React.ReactNode }) {
  return children;
}
