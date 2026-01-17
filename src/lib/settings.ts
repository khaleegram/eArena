'use server';

import { adminDb } from '@/lib/firebase-admin';
import type { PlatformSettings } from '@/lib/types';
import { Timestamp } from 'firebase-admin/firestore';

export async function getPlatformSettings(): Promise<PlatformSettings> {
    const docRef = adminDb.collection('platform').doc('settings');
    const doc = await docRef.get();
    
    if (!doc.exists) {
        // Default settings if the document doesn't exist
        const defaultSettings: PlatformSettings = {
            isMaintenanceMode: false,
            allowNewTournaments: true,
            whatsappUrl: '',
            facebookUrl: '',
            instagramUrl: '',
            youtubeUrl: '',
            backgroundMusic: [],
        };
        // We can also create it with default values for future use
        await docRef.set(defaultSettings);
        return defaultSettings;
    }
    const data = doc.data();
    // This ensures that even if some fields are missing from Firestore, we provide defaults.
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
