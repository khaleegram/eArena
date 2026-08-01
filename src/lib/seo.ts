import type { Metadata } from 'next';

export const SITE_NAME = 'eArena';
export const SITE_TAGLINE = 'Your eFootball Tournament Platform';
export const SITE_DESCRIPTION =
  'Create, manage, and compete in eFootball tournaments on eArena. Browse public leagues, join with a code, track standings, and climb the leaderboards.';

export const DEFAULT_OG_IMAGE = '/images/Tournament.png';

export function getSiteUrl(): string {
  const raw =
    process.env.NEXT_PUBLIC_BASE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) ||
    (process.env.NEXT_PUBLIC_VERCEL_URL
      ? `https://${process.env.NEXT_PUBLIC_VERCEL_URL}`
      : null) ||
    'https://earena.ng';

  return raw.replace(/\/$/, '');
}

export function absoluteUrl(path = '/'): string {
  const base = getSiteUrl();
  if (!path || path === '/') return base;
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

export function truncateMeta(text: string | undefined | null, max = 160): string {
  if (!text) return SITE_DESCRIPTION;
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (cleaned.length <= max) return cleaned;
  return `${cleaned.slice(0, max - 1).trimEnd()}…`;
}

type BuildMetadataOptions = {
  title: string;
  description?: string;
  path?: string;
  image?: string;
  noIndex?: boolean;
  type?: 'website' | 'article' | 'profile';
  keywords?: string[];
  /** Skip the root "%s | eArena" title template */
  absoluteTitle?: boolean;
};

export function buildMetadata({
  title,
  description = SITE_DESCRIPTION,
  path = '/',
  image = DEFAULT_OG_IMAGE,
  noIndex = false,
  type = 'website',
  keywords,
  absoluteTitle = false,
}: BuildMetadataOptions): Metadata {
  const url = absoluteUrl(path);
  const desc = truncateMeta(description);
  const resolvedTitle = absoluteTitle
    ? ({ absolute: title } as Metadata['title'])
    : title;

  return {
    title: resolvedTitle,
    description: desc,
    keywords: keywords ?? [
      'eArena',
      'eFootball',
      'eFootball tournaments',
      'PES',
      'online football tournament',
      'esports Nigeria',
      'tournament manager',
      'eFootball league',
    ],
    alternates: {
      canonical: url,
    },
    openGraph: {
      title: title,
      description: desc,
      url,
      siteName: SITE_NAME,
      locale: 'en_NG',
      type,
      images: [
        {
          url: image,
          width: 1200,
          height: 630,
          alt: title,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: title,
      description: desc,
      images: [image],
    },
    robots: noIndex
      ? { index: false, follow: false, googleBot: { index: false, follow: false } }
      : { index: true, follow: true, googleBot: { index: true, follow: true } },
  };
}
