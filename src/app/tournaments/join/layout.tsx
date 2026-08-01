import type { Metadata } from 'next';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({
  title: 'Join with Code',
  description:
    'Have a private tournament invite code? Enter it here to join the competition on eArena.',
  path: '/tournaments/join',
});

export default function JoinTournamentLayout({ children }: { children: React.ReactNode }) {
  return children;
}
