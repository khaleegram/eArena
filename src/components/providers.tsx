
'use client';

import { AuthProvider } from './auth-provider';
import { Header } from './header';
import { Footer } from './footer';
import { Toaster } from './ui/toaster';
import type { PlatformSettings } from '@/lib/types';
import { PushPermissionPrompt } from './push-permission-prompt';
import { ThemeProvider } from './theme-provider';
import { IosInstallPrompt } from './ios-install-prompt';

export function Providers({
  children,
  settings
}: {
  children: React.ReactNode;
  settings: PlatformSettings;
}) {
  return (
    <ThemeProvider>
      <AuthProvider settings={settings}>
        <div className="flex min-h-screen flex-col">
          <Header />
          <main className="flex-grow">{children}</main>
          <Footer />
        </div>
        <Toaster />
        <PushPermissionPrompt />
        <IosInstallPrompt />
      </AuthProvider>
    </ThemeProvider>
  );
}
