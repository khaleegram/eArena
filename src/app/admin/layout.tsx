'use client';
import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/hooks/use-auth';
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { AdminSidebar } from '@/components/admin-sidebar';
import { Loader2, Trophy } from 'lucide-react';
import { ThemeToggle } from '@/components/theme-provider';

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, isAdmin, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !isAdmin) {
      router.replace('/');
    }
  }, [isAdmin, loading, router]);

  if (pathname === '/admin/settings') {
    return children;
  }

  if (loading || !isAdmin) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full flex-col bg-background md:flex-row">
        <AdminSidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="sticky top-0 z-40 flex h-14 items-center gap-2 border-b border-border/40 bg-background/95 px-3 backdrop-blur md:hidden">
            <SidebarTrigger className="h-10 w-10" />
            <Link href="/admin" className="flex items-center gap-2 font-headline font-bold">
              <Trophy className="h-5 w-5 text-primary" />
              Admin
            </Link>
            <div className="ml-auto">
              <ThemeToggle />
            </div>
          </div>
          <main className="flex-1 p-4 sm:p-6 md:p-8">{children}</main>
        </div>
      </div>
    </SidebarProvider>
  );
}
