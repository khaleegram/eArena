
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { Orbitron } from 'next/font/google';
import './globals.css';
import { Providers } from '@/components/providers';
import { cn } from '@/lib/utils';
import { getPlatformSettings } from '@/lib/settings';
import { HardHat } from 'lucide-react';
import { cookies } from 'next/headers';
import { JsonLd } from '@/components/json-ld';
import {
  DEFAULT_OG_IMAGE,
  SITE_DESCRIPTION,
  SITE_NAME,
  SITE_TAGLINE,
  absoluteUrl,
  getSiteUrl,
} from '@/lib/seo';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-body',
});
const orbitron = Orbitron({
  subsets: ['latin'],
  weight: ['400', '700'],
  variable: '--font-headline',
});

const siteUrl = getSiteUrl();

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: `${SITE_NAME}: ${SITE_TAGLINE}`,
    template: `%s | ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  authors: [{ name: SITE_NAME, url: siteUrl }],
  creator: SITE_NAME,
  publisher: SITE_NAME,
  category: 'sports',
  keywords: [
    'eArena',
    'eFootball',
    'eFootball tournaments',
    'PES',
    'online football tournament',
    'esports Nigeria',
    'tournament manager',
    'eFootball league',
    'earena.ng',
  ],
  manifest: '/manifest.json',
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icons/android/any-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/android/any-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [
      { url: '/icons/ios/180.png', sizes: '180x180', type: 'image/png' },
      { url: '/icons/ios/192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/ios/512.png', sizes: '512x512', type: 'image/png' },
    ],
    shortcut: '/icons/android/any-192.png',
  },
  appleWebApp: {
    capable: true,
    title: SITE_NAME,
    statusBarStyle: 'default',
  },
  formatDetection: {
    telephone: false,
  },
  alternates: {
    canonical: siteUrl,
  },
  openGraph: {
    type: 'website',
    locale: 'en_NG',
    url: siteUrl,
    siteName: SITE_NAME,
    title: `${SITE_NAME}: ${SITE_TAGLINE}`,
    description: SITE_DESCRIPTION,
    images: [
      {
        url: DEFAULT_OG_IMAGE,
        width: 1200,
        height: 630,
        alt: `${SITE_NAME} — ${SITE_TAGLINE}`,
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: `${SITE_NAME}: ${SITE_TAGLINE}`,
    description: SITE_DESCRIPTION,
    images: [DEFAULT_OG_IMAGE],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
      'max-video-preview': -1,
    },
  },
  verification: {
    google: 'kYYbHnFaEuBUE0-jEPI-67wyMbbq842E2FSIRzm2dD0',
  },
  other: {
    'msapplication-TileColor': '#ffffff',
    'msapplication-config': '/browserconfig.xml',
  },
};

const MaintenancePage = () => (
    <html lang="en">
      <body className={cn("font-body antialiased", inter.variable, orbitron.variable)}>
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

  const organizationLd = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: SITE_NAME,
    url: siteUrl,
    logo: absoluteUrl('/icons/android/any-512.png'),
    description: SITE_DESCRIPTION,
    sameAs: [
      settings.whatsappUrl,
      settings.facebookUrl,
      settings.instagramUrl,
      settings.youtubeUrl,
    ].filter(Boolean),
  };

  const websiteLd = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: SITE_NAME,
    url: siteUrl,
    description: SITE_DESCRIPTION,
  };
  
  return (
    <html lang="en">
      <head>
        <meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)" />
        <meta name="theme-color" content="#0f172a" media="(prefers-color-scheme: dark)" />
      </head>
      <body className={cn(
          "font-body antialiased bg-background text-foreground",
          inter.variable,
          orbitron.variable
        )}>
        <JsonLd data={[organizationLd, websiteLd]} />
        <Providers settings={settings}>
            {children}
        </Providers>
      </body>
    </html>
  );
}
