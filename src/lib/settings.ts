import { unstable_cache } from 'next/cache';
import { adminDb } from '@/lib/firebase-admin';
import type { PlatformSettings } from '@/lib/types';

export const DEFAULT_PLATFORM_SETTINGS: PlatformSettings = {
  isMaintenanceMode: false,
  allowNewTournaments: true,
  whatsappUrl: '',
  facebookUrl: '',
  instagramUrl: '',
  youtubeUrl: '',
  backgroundMusic: [],
};

async function fetchPlatformSettings(): Promise<PlatformSettings> {
  const docRef = adminDb.collection('platform').doc('settings');
  const doc = await docRef.get();

  if (!doc.exists) {
    void docRef.set(DEFAULT_PLATFORM_SETTINGS).catch(() => undefined);
    return DEFAULT_PLATFORM_SETTINGS;
  }

  const data = doc.data();
  return {
    isMaintenanceMode: data?.isMaintenanceMode || false,
    allowNewTournaments: data?.allowNewTournaments !== false,
    whatsappUrl: data?.whatsappUrl || '',
    facebookUrl: data?.facebookUrl || '',
    instagramUrl: data?.instagramUrl || '',
    youtubeUrl: data?.youtubeUrl || '',
    backgroundMusic: data?.backgroundMusic || [],
  };
}

/** Cached for 60s so every page navigation doesn't hit Firestore for settings. */
export const getPlatformSettings = unstable_cache(fetchPlatformSettings, ['platform-settings'], {
  revalidate: 60,
  tags: ['platform-settings'],
});

/** Never stall first paint more than a short window on cold Firestore. */
export async function getPlatformSettingsFast(timeoutMs = 500): Promise<PlatformSettings> {
  try {
    return await Promise.race([
      getPlatformSettings(),
      new Promise<PlatformSettings>((resolve) => {
        setTimeout(() => resolve(DEFAULT_PLATFORM_SETTINGS), timeoutMs);
      }),
    ]);
  } catch {
    return DEFAULT_PLATFORM_SETTINGS;
  }
}
