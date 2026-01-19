
'use server';

import { adminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { allAchievements } from '../achievements';
import { getPlayerStats, getUserProfileById } from './user';
import { sendNotification } from './notifications';
import { revalidatePath } from 'next/cache';
import type { UserProfile, PlayerStats } from '@/lib/types';

export async function checkAndGrantAchievements(userId: string) {
    const playerStats = await getPlayerStats(userId);
    const userProfile = await getUserProfileById(userId);

    if (!userProfile) return;

    const batch = adminDb.batch();
    const userProfileRef = adminDb.collection('users').doc(userId);
    let hasNewAchievements = false;
    let hasUpdates = false;

    for (const achievement of allAchievements) {
        const progress = achievement.evaluator(userProfile, playerStats);
        const earnedData = userProfile.earnedAchievements?.[achievement.id];
        const currentTier = earnedData?.tier ?? -1;
        
        let nextTierIndex = currentTier;
        for (let i = currentTier + 1; i < achievement.tiers.length; i++) {
            if (progress >= achievement.tiers[i]!.value) {
                nextTierIndex = i;
            } else {
                break;
            }
        }

        if (nextTierIndex > currentTier) {
            hasNewAchievements = true;
            hasUpdates = true;
            const newTier = achievement.tiers[nextTierIndex]!;
            
            batch.update(userProfileRef, {
                [`earnedAchievements.${achievement.id}`]: {
                    achievementId: achievement.id,
                    tier: nextTierIndex,
                    unlockedAt: FieldValue.serverTimestamp(),
                    progress: progress,
                }
            });

            if (newTier.title) {
                batch.update(userProfileRef, {
                    playerTitles: FieldValue.arrayUnion({
                        title: newTier.title,
                        unlockedAt: FieldValue.serverTimestamp(),
                        sourceAchievementId: achievement.id,
                    })
                });
            }
            
            await sendNotification(userId, {
                userId,
                title: `Achievement Unlocked: ${newTier.name} ${achievement.name}`,
                body: newTier.description,
                href: '/profile'
            });
        } else if (earnedData && earnedData.progress !== progress) {
            hasUpdates = true;
             batch.update(userProfileRef, {
                [`earnedAchievements.${achievement.id}.progress`]: progress,
            });
        }
    }
    
    if (hasUpdates) {
        await batch.commit();
        revalidatePath(`/profile/${userId}`);
    }
}
