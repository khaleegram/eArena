'use server';
import { adminDb } from '@/lib/firebase-admin';
import { getStorage } from 'firebase-admin/storage';
import { revalidatePath } from 'next/cache';
import type { PlatformSettings } from '@/lib/types';

export async function updatePlatformSettings(formData: FormData) {
    const settingsRef = adminDb.collection('platform').doc('settings');
    
    const settings: Partial<PlatformSettings> = {
        isMaintenanceMode: formData.get('isMaintenanceMode') === 'true',
        allowNewTournaments: formData.get('allowNewTournaments') === 'true',
        whatsappUrl: formData.get('whatsappUrl') as string,
        facebookUrl: formData.get('facebookUrl') as string,
        instagramUrl: formData.get('instagramUrl') as string,
        youtubeUrl: formData.get('youtubeUrl') as string,
        backgroundMusic: [],
    };

    const musicFiles: { file: File, index: number }[] = [];
    const existingMusicUrls: (string | null)[] = Array(5).fill(null);

    for (let i = 0; i < 5; i++) {
        const file = formData.get(`backgroundMusic_${i}`) as File | null;
        const existingUrl = formData.get(`existingBackgroundMusic_${i}`) as string | null;
        if (file && file.size > 0) {
            musicFiles.push({ file, index: i });
        } else if (existingUrl) {
            existingMusicUrls[i] = existingUrl;
        }
    }
    
    const bucket = getStorage().bucket(process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET);
    const uploadPromises = musicFiles.map(async ({ file, index }) => {
        const fileName = `platform/music/${Date.now()}_${file.name}`;
        const fileRef = bucket.file(fileName);
        const buffer = Buffer.from(await file.arrayBuffer());
        await fileRef.save(buffer, { contentType: file.type });
        const [url] = await fileRef.getSignedUrl({ action: 'read', expires: '03-09-2491' });
        return { url, index };
    });

    const uploadedUrls = await Promise.all(uploadPromises);

    uploadedUrls.forEach(({ url, index }) => {
        existingMusicUrls[index] = url;
    });

    settings.backgroundMusic = existingMusicUrls.filter(url => url !== null) as string[];

    await settingsRef.set(settings, { merge: true });
    revalidatePath('/admin/settings');
    revalidatePath('/'); // Revalidate home page as well
}
