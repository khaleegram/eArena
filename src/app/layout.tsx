

import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { Orbitron } from 'next/font/google';
import './globals.css';
import { Providers } from '@/components/providers';
import { ThemeProvider } from '@/components/theme-provider';
import { cn } from '@/lib/utils';
import { getPlatformSettings } from '@/lib/settings';
import { HardHat } from 'lucide-react';
import { cookies } from 'next/headers';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-body',
});
const orbitron = Orbitron({
  subsets: ['latin'],
  weight: ['400', '700'],
  variable: '--font-headline',
});

export const metadata: Metadata = {
  title: 'eArena: Your eFootball Tournament Platform',
  description: 'Create, manage, and compete in eFootball tournaments.',
  manifest: '/manifest.json',
};

const MaintenancePage = () => (
    <html lang="en">
      <body className={cn("font-body antialiased dark", inter.variable, orbitron.variable)}>
        <div className="flex flex-col items-center justify-center h-screen text-center bg-background text-foreground">
          <HardHat className="w-20 h-20 mb-6 text-primary" />
          <h1 className="text-4xl font-bold font-headline">Under Maintenance</h1>
          <p className="mt-2 text-lg text-muted-foreground">eArena is currently down for scheduled maintenance.</p>
          <p className="text-muted-foreground">Please check back soon.</p>
        </div>
      </body>
    </html>
);

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const settings = await getPlatformSettings();
  const cookieStore = await cookies();
  const isAdminCookie = cookieStore.get('isAdmin')?.value === 'true';

  if (settings.isMaintenanceMode && !isAdminCookie) {
    return <MaintenancePage />;
  }
  
  return (
    <html lang="en">
      <head>
        <meta name="application-name" content="eArena" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="eArena" />
        <link rel="apple-touch-icon" sizes="180x180" href="/icons/ios/180.png" />
        <link rel="manifest" href="/manifest.json" />
        <meta name="format-detection" content="telephone=no" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="theme-color" content="#172554" />
        <meta name="msapplication-TileColor" content="#0f172a" />
        <meta name="msapplication-config" content="/browserconfig.xml" />
        <meta name="google-site-verification" content="kYYbHnFaEuBUE0-jEPI-67wyMbbq842E2FSIRzm2dD0" />
      </head>
      <body className={cn(
          "font-body antialiased bg-background text-foreground",
          inter.variable,
          orbitron.variable
        )}>
        <ThemeProvider>
          <Providers settings={settings}>
            {children}
          </Providers>
        </ThemeProvider>
      </body>
    </html>
  );
}
