

'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { signOut } from 'firebase/auth';
import { Trophy, LogOut, UserCircle, LayoutDashboard, BarChart, Shield, MessageSquare, Search, Clapperboard } from 'lucide-react';

import { Button } from './ui/button';
import { Skeleton } from './ui/skeleton';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuth } from '@/hooks/use-auth';
import { auth } from '@/lib/firebase';
import { NotificationBell } from './notification-bell';
import { ReputationAvatar } from './reputation-avatar';
import { ThemeToggle } from './theme-provider';

export function Header() {
  const { user, userProfile, loading, isAdmin } = useAuth();
  const router = useRouter();

  const onSignOut = async () => {
    try {
      await signOut(auth);
      router.push('/');
    } catch (error) {
      console.error("Sign out failed:", error);
    }
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-14 items-center">
        <div className="mr-4 flex items-center">
          <Link href="/" className="flex items-center space-x-2">
            <Trophy className="h-6 w-6 text-primary" />
            <span className="font-bold font-headline text-lg sm:inline-block">eArena</span>
          </Link>
        </div>
        <nav className="flex flex-1 items-center space-x-4">
           <Link href="/tournaments" className="text-sm font-medium text-muted-foreground transition-colors hover:text-primary">
            Browse
          </Link>
          <Link href="/live" className="relative text-sm font-medium text-muted-foreground transition-colors hover:text-primary">
            Live
            <span className="absolute -right-2 -top-1 flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-red-600"></span>
            </span>
          </Link>
          <Link href="/highlights" className="text-sm font-medium text-muted-foreground transition-colors hover:text-primary">
            Highlights
          </Link>
           <Link href="/leaderboards" className="text-sm font-medium text-muted-foreground transition-colors hover:text-primary">
            Leaderboards
          </Link>
           <Link href="/community" className="text-sm font-medium text-muted-foreground transition-colors hover:text-primary">
            Community
          </Link>
        </nav>
        <div className="flex items-center justify-end space-x-2">
          <ThemeToggle />
          {loading ? (
             <Skeleton className="h-8 w-20" />
          ) : user ? (
            <>
              <Link href="/search">
                  <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full">
                    <Search className="h-5 w-5" />
                  </Button>
              </Link>
              <NotificationBell />
              <Link href="/messages">
                  <Button variant="ghost" size="icon" className="relative h-8 w-8 rounded-full">
                    <MessageSquare className="h-5 w-5" />
                  </Button>
              </Link>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="relative h-9 w-9 rounded-full">
                    <ReputationAvatar profile={userProfile} className="h-8 w-8" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-56" align="end" forceMount>
                  <DropdownMenuLabel className="font-normal">
                    <div className="flex flex-col space-y-1">
                      <p className="text-sm font-medium leading-none">{userProfile?.username || 'User'}</p>
                      <p className="text-xs leading-none text-muted-foreground">
                        {user.email}
                      </p>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {isAdmin && (
                    <DropdownMenuItem asChild>
                        <Link href="/admin"><Shield className="mr-2 h-4 w-4" />Admin</Link>
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem asChild>
                      <Link href="/dashboard"><LayoutDashboard className="mr-2 h-4 w-4" />Dashboard</Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                      <Link href="/profile"><UserCircle className="mr-2 h-4 w-4" />Profile</Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                      <Link href="/messages"><MessageSquare className="mr-2 h-4 w-4" />Messages</Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={onSignOut}>
                    <LogOut className="mr-2 h-4 w-4" />
                    <span>Log out</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          ) : (
            <>
              <Link href="/search">
                  <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full">
                    <Search className="h-5 w-5" />
                  </Button>
              </Link>
              <Link href="/login">
                <Button variant="ghost" size="sm">
                  Login
                </Button>
              </Link>
              <Link href="/signup">
                <Button size="sm">Sign Up</Button>
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
