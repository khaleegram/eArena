
'use client';

import { AuthProvider } from './auth-provider';
import { Header } from './header';
import { Footer } from './footer';
import { Toaster } from './ui/toaster';
import type { PlatformSettings } from '@/lib/types';

export function Providers({
  children,
  settings
}: {
  children: React.ReactNode;
  settings: PlatformSettings;
}) {
  return (
    <AuthProvider settings={settings}>
      <div className="flex min-h-screen flex-col">
        <Header />
        <main className="flex-grow">{children}</main>
        <Footer />
      </div>
      <Toaster />
    </AuthProvider>
  );
}
