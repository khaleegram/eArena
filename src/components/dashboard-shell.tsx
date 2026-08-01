'use client';

import { useEffect } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useAuth } from '@/hooks/use-auth';
import { DashboardSidebar } from '@/components/dashboard-sidebar';
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { Trophy } from 'lucide-react';
import { ThemeToggle } from '@/components/theme-provider';
import { Skeleton } from '@/components/ui/skeleton';

const NotificationBell = dynamic(
  () => import('@/components/notification-bell').then((m) => m.NotificationBell),
  { ssr: false, loading: () => <Skeleton className="h-10 w-10 rounded-full" /> }
);

function DashboardChrome({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full flex-col bg-background md:flex-row">
        <DashboardSidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="sticky top-0 z-40 flex h-14 items-center gap-2 border-b border-border/40 bg-background/95 px-3 backdrop-blur md:hidden">
            <SidebarTrigger className="h-10 w-10" />
            <Link href="/" className="flex items-center gap-2 font-headline font-bold">
              <Trophy className="h-5 w-5 text-primary" />
              eArena
            </Link>
            <div className="ml-auto flex items-center gap-1">
              <ThemeToggle />
              <NotificationBell />
            </div>
          </div>
          <main className="flex-1 p-4 sm:p-6 md:p-8">{children}</main>
        </div>
      </div>
    </SidebarProvider>
  );
}

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!loading && !user) {
      const params = searchParams.toString();
      const fullPath = `${pathname}${params ? `?${params}` : ''}`;
      router.replace(`/login?redirectUrl=${encodeURIComponent(fullPath)}`);
    }
  }, [user, loading, router, pathname, searchParams]);

  // Show real chrome immediately — never a blank full-page spinner.
  if (loading || !user) {
    return (
      <DashboardChrome>
        <div className="space-y-4">
          <Skeleton className="h-9 w-48" />
          <Skeleton className="h-4 w-72" />
          <div className="grid grid-cols-2 gap-3 pt-2">
            <Skeleton className="h-20 rounded-2xl" />
            <Skeleton className="h-20 rounded-2xl" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 pt-4">
            <Skeleton className="h-40 rounded-2xl" />
            <Skeleton className="h-40 rounded-2xl" />
            <Skeleton className="hidden h-40 rounded-2xl sm:block" />
          </div>
        </div>
      </DashboardChrome>
    );
  }

  return <DashboardChrome>{children}</DashboardChrome>;
}
