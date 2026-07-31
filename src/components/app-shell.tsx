'use client';

import { usePathname } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { Header } from '@/components/header';
import { Footer } from '@/components/footer';
import { MobileBottomNav } from '@/components/mobile-bottom-nav';
import { cn } from '@/lib/utils';

function isAdminRoute(pathname: string) {
  return pathname.startsWith('/admin');
}

function isDashboardRoute(pathname: string) {
  return pathname.startsWith('/dashboard');
}

function isAuthRoute(pathname: string) {
  return (
    pathname.startsWith('/login') ||
    pathname.startsWith('/signup') ||
    pathname.startsWith('/forgot-password') ||
    pathname.startsWith('/verify-email')
  );
}

function isLanding(pathname: string) {
  return pathname === '/';
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { loading } = useAuth();

  const admin = isAdminRoute(pathname);
  const dashboard = isDashboardRoute(pathname);
  const authRoute = isAuthRoute(pathname);
  const landing = isLanding(pathname);

  // App-like bottom nav on every mobile page except landing, auth, and admin
  const showBottomNav = !landing && !authRoute && !admin;

  // Marketing header: hide on auth, admin, and dashboard (dashboard has its own top bar)
  const showHeader = !authRoute && !admin && !dashboard;

  const showFooterDesktop = !authRoute && !admin && !dashboard;
  const showFooterMobile = showFooterDesktop && !showBottomNav;

  return (
    <div className="flex min-h-screen flex-col">
      {showHeader && <Header />}
      <main className={cn('flex-grow', showBottomNav && 'pb-nav md:pb-0')}>
        {children}
      </main>
      {showFooterDesktop && (
        <div className={cn(showFooterMobile ? 'block' : 'hidden md:block')}>
          <Footer />
        </div>
      )}
      {!loading && showBottomNav && <MobileBottomNav />}
    </div>
  );
}
