'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Trophy,
  LayoutDashboard,
  MessageSquare,
  UserCircle,
  BarChart3,
  Users,
  LogIn,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/use-auth';

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  match?: (pathname: string) => boolean;
};

const GUEST_ITEMS: NavItem[] = [
  {
    href: '/tournaments',
    label: 'Browse',
    icon: Trophy,
    match: (p) => p === '/tournaments' || p.startsWith('/tournaments/'),
  },
  {
    href: '/leaderboards',
    label: 'Boards',
    icon: BarChart3,
    match: (p) => p.startsWith('/leaderboards'),
  },
  {
    href: '/community',
    label: 'Community',
    icon: Users,
    match: (p) => p.startsWith('/community'),
  },
  {
    href: '/login',
    label: 'Login',
    icon: LogIn,
    match: (p) => p.startsWith('/login') || p.startsWith('/signup'),
  },
];

const PLAYER_ITEMS: NavItem[] = [
  {
    href: '/tournaments',
    label: 'Browse',
    icon: Trophy,
    match: (p) => p === '/tournaments' || p.startsWith('/tournaments/'),
  },
  {
    href: '/dashboard',
    label: 'My Arena',
    icon: LayoutDashboard,
    match: (p) => p === '/dashboard' || p.startsWith('/dashboard/'),
  },
  {
    href: '/messages',
    label: 'Messages',
    icon: MessageSquare,
    match: (p) => p.startsWith('/messages'),
  },
  {
    href: '/profile',
    label: 'Profile',
    icon: UserCircle,
    match: (p) => p === '/profile' || p.startsWith('/profile/'),
  },
];

export function MobileBottomNav() {
  const pathname = usePathname();
  const { user } = useAuth();
  const items = user ? PLAYER_ITEMS : GUEST_ITEMS;

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border/60 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:hidden pb-safe"
      aria-label="Primary"
    >
      <ul className="grid h-16 grid-cols-4">
        {items.map(({ href, label, icon: Icon, match }) => {
          const active = match ? match(pathname) : pathname === href;
          return (
            <li key={href}>
              <Link
                href={href}
                className={cn(
                  'flex h-full flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors',
                  active ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <Icon className={cn('h-5 w-5', active && 'stroke-[2.5px]')} />
                <span>{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
