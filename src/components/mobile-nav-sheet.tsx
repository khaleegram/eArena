'use client';

import Link from 'next/link';
import { Menu, Trophy, BarChart3, Users, HelpCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { ThemeToggle } from '@/components/theme-provider';
import { useState } from 'react';

const LINKS = [
  { href: '/tournaments', label: 'Browse Tournaments', icon: Trophy },
  { href: '/leaderboards', label: 'Leaderboards', icon: BarChart3 },
  { href: '/community', label: 'Community', icon: Users },
] as const;

export function MobileNavSheet({
  showAuthLinks = false,
}: {
  showAuthLinks?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const supportEmail = process.env.NEXT_PUBLIC_PLATFORM_EMAIL;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-10 w-10 rounded-full md:hidden"
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-[min(100%,20rem)] p-0">
        <SheetHeader className="border-b px-5 py-4 text-left">
          <SheetTitle className="font-headline flex items-center gap-2 text-xl">
            <Trophy className="h-5 w-5 text-primary" />
            eArena
          </SheetTitle>
        </SheetHeader>
        <nav className="flex flex-col gap-1 p-3">
          {LINKS.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium text-foreground hover:bg-secondary"
            >
              <Icon className="h-5 w-5 text-primary" />
              {label}
            </Link>
          ))}
          {supportEmail && (
            <a
              href={`mailto:${supportEmail}`}
              className="flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium text-foreground hover:bg-secondary"
            >
              <HelpCircle className="h-5 w-5 text-primary" />
              Help
            </a>
          )}
          <div className="mt-2 flex items-center justify-between rounded-lg px-3 py-2">
            <span className="text-sm text-muted-foreground">Theme</span>
            <ThemeToggle />
          </div>
          {showAuthLinks && (
            <div className="mt-4 flex flex-col gap-2 border-t px-3 pt-4">
              <Link href="/login" onClick={() => setOpen(false)}>
                <Button variant="outline" className="w-full h-11">
                  Login
                </Button>
              </Link>
              <Link href="/signup" onClick={() => setOpen(false)}>
                <Button className="w-full h-11">Sign Up</Button>
              </Link>
            </div>
          )}
        </nav>
      </SheetContent>
    </Sheet>
  );
}
