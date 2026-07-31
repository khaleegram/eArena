'use client';

import { AuthProvider } from './auth-provider';
import { AppShell } from './app-shell';
import { Toaster } from './ui/toaster';
import type { PlatformSettings } from '@/lib/types';
import { PushPermissionPrompt } from './push-permission-prompt';
import { ThemeProvider } from './theme-provider';
import { IosInstallPrompt } from './ios-install-prompt';

export function Providers({
  children,
  settings,
}: {
  children: React.ReactNode;
  settings: PlatformSettings;
}) {
  return (
    <ThemeProvider>
      <AuthProvider settings={settings}>
        <AppShell>{children}</AppShell>
        <Toaster />
        <PushPermissionPrompt />
        <IosInstallPrompt />
      </AuthProvider>
    </ThemeProvider>
  );
}
