'use client';

import dynamic from 'next/dynamic';
import { AuthProvider } from './auth-provider';
import { AppShell } from './app-shell';
import { Toaster } from './ui/toaster';
import type { PlatformSettings } from '@/lib/types';
import { ThemeProvider } from './theme-provider';

const PushPermissionPrompt = dynamic(
  () => import('./push-permission-prompt').then((m) => m.PushPermissionPrompt),
  { ssr: false }
);

const IosInstallPrompt = dynamic(
  () => import('./ios-install-prompt').then((m) => m.IosInstallPrompt),
  { ssr: false }
);

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
