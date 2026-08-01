import type { Metadata } from 'next';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({
  title: 'Search Players',
  description: 'Find eArena players by username and view public profiles, stats, and achievements.',
  path: '/search',
});

export default function SearchLayout({ children }: { children: React.ReactNode }) {
  return children;
}
