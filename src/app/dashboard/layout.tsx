'use client';
import { useEffect } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/hooks/use-auth';
import { DashboardSidebar } from '@/components/dashboard-sidebar';
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { Loader2, Trophy } from 'lucide-react';
import { ThemeToggle } from '@/components/theme-provider';
import { NotificationBell } from '@/components/notification-bell';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
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

  if (loading || !user) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

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
