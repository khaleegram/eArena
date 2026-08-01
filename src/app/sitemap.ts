import type { MetadataRoute } from 'next';
import { getArticles } from '@/lib/actions/community';
import { getPublicTournaments } from '@/lib/actions/tournament';
import { absoluteUrl, getSiteUrl } from '@/lib/seo';
import type { UnifiedTimestamp } from '@/lib/types';

function toDate(timestamp: UnifiedTimestamp | undefined): Date | undefined {
  if (!timestamp) return undefined;
  if (typeof timestamp === 'string') return new Date(timestamp);
  if (timestamp instanceof Date) return timestamp;
  if (typeof (timestamp as { toDate?: () => Date }).toDate === 'function') {
    return (timestamp as { toDate: () => Date }).toDate();
  }
  return undefined;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = getSiteUrl();
  const now = new Date();

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: base, lastModified: now, changeFrequency: 'daily', priority: 1 },
    {
      url: absoluteUrl('/tournaments'),
      lastModified: now,
      changeFrequency: 'hourly',
      priority: 0.9,
    },
    {
      url: absoluteUrl('/tournaments/join'),
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.6,
    },
    {
      url: absoluteUrl('/community'),
      lastModified: now,
      changeFrequency: 'daily',
      priority: 0.8,
    },
    {
      url: absoluteUrl('/leaderboards'),
      lastModified: now,
      changeFrequency: 'daily',
      priority: 0.7,
    },
    {
      url: absoluteUrl('/search'),
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.5,
    },
  ];

  let tournamentRoutes: MetadataRoute.Sitemap = [];
  let articleRoutes: MetadataRoute.Sitemap = [];

  try {
    const tournaments = await getPublicTournaments();
    tournamentRoutes = tournaments.map((t) => ({
      url: absoluteUrl(`/tournaments/${t.id}`),
      lastModified: toDate(t.createdAt) ?? now,
      changeFrequency: 'daily' as const,
      priority: t.status === 'in_progress' || t.status === 'open_for_registration' ? 0.85 : 0.6,
    }));
  } catch (error) {
    console.error('[sitemap] Failed to load tournaments:', error);
  }

  try {
    const articles = await getArticles();
    articleRoutes = articles.map((a) => ({
      url: absoluteUrl(`/community/articles/${a.slug}`),
      lastModified: toDate(a.createdAt) ?? now,
      changeFrequency: 'weekly' as const,
      priority: 0.7,
    }));
  } catch (error) {
    console.error('[sitemap] Failed to load articles:', error);
  }

  return [...staticRoutes, ...tournamentRoutes, ...articleRoutes];
}
