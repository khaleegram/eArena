import type { Metadata } from 'next';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({
  title: 'My Profile',
  description: 'Manage your eArena profile, bank details, and account settings.',
  path: '/profile',
  noIndex: true,
});

export default function OwnProfileLayout({ children }: { children: React.ReactNode }) {
  return children;
}
