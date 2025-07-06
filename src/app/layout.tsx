import type { Metadata } from 'next';
import { Inter, Orbitron } from 'next/font/google';
import './globals.css';
import { AuthProvider } from '@/components/auth-provider';
import { Header } from '@/components/header';
import { Footer } from '@/components/footer';
import { Toaster } from '@/components/ui/toaster';
import { cn } from '@/lib/utils';
import { getPlatformSettings } from '@/lib/actions';
import { cookies } from 'next/headers';
import { HardHat } from 'lucide-react';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
});
const orbitron = Orbitron({
  subsets: ['latin'],
  weight: ['400', '700'],
  variable: '--font-orbitron',
});

export const metadata: Metadata = {
  title: 'eArena: Your eFootball Tournament Platform',
  description: 'Create, manage, and compete in eFootball tournaments.',
  manifest: '/manifest.json',
};

const MaintenancePage = () => (
    <div className="flex flex-col items-center justify-center h-screen text-center bg-background text-foreground">
      <HardHat className="w-20 h-20 mb-6 text-primary" />
      <h1 className="text-4xl font-bold font-headline">Under Maintenance</h1>
      <p className="mt-2 text-lg text-muted-foreground">eArena is currently down for scheduled maintenance.</p>
      <p className="text-muted-foreground">Please check back soon.</p>
    </div>
  );

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Check for maintenance mode
  const settings = await getPlatformSettings();
  const isAdminCookie = cookies().get('isAdmin')?.value === 'true';

  if (settings.isMaintenanceMode && !isAdminCookie) {
    return (
      <html lang="en" className="dark">
        <body className={cn("font-body antialiased", inter.variable, orbitron.variable)}>
          <MaintenancePage />
        </body>
      </html>
    );
  }


  return (
    <html lang="en" className="dark">
      <head>
          <meta name="application-name" content="eArena" />
          <meta name="apple-mobile-web-app-capable" content="yes" />
          <meta name="apple-mobile-web-app-status-bar-style" content="default" />
          <meta name="apple-mobile-web-app-title" content="eArena" />
          <meta name="format-detection" content="telephone=no" />
          <meta name="mobile-web-app-capable" content="yes" />
          <meta name="theme-color" content="#172554" />
      </head>
      <body className={cn(
          "font-body antialiased bg-background text-foreground",
          inter.variable,
          orbitron.variable
        )}>
        <AuthProvider>
          <div className="flex min-h-screen flex-col">
            <Header />
            <main className="flex-grow">{children}</main>
            <Footer />
          </div>
          <Toaster />
        </AuthProvider>
      </body>
    </html>
  );
}
