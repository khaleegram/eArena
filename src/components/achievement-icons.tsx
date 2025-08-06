
'use client';

import type { UserProfile } from '@/lib/types';
import { allAchievements, Achievement, AchievementTier } from '@/lib/achievements';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ShieldQuestion } from 'lucide-react';
import * as LucideIcons from 'lucide-react';
import { useMemo } from 'react';
import { cn } from '@/lib/utils';

const rarityOrder: Record<string, number> = {
    'Common': 1,
    'Uncommon': 2,
    'Rare': 3,
    'Epic': 4,
    'Legendary': 5,
};

const tierOrder: Record<string, number> = {
    'Bronze': 1,
    'Silver': 2,
    'Gold': 3,
    'Platinum': 4,
    'Diamond': 5,
    'Legendary': 6,
};

const iconMap: { [key: string]: React.ElementType } = {
  ...LucideIcons
};

const Icon = ({ name, className }: { name: string, className?: string }) => {
    const LucideIcon = iconMap[name] || ShieldQuestion;
    return <LucideIcon className={cn("h-4 w-4", className)} />;
};

const getTierColor = (tierName: AchievementTier['name']) => {
    switch (tierName) {
        case 'Bronze': return 'text-amber-700';
        case 'Silver': return 'text-slate-400';
        case 'Gold': return 'text-amber-400';
        case 'Platinum': return 'text-cyan-400';
        case 'Diamond': return 'text-blue-400';
        case 'Legendary': return 'text-purple-400';
        default: return 'text-muted-foreground';
    }
};

export const AchievementIcons = ({ profile }: { profile: UserProfile | null }) => {
    const topAchievements = useMemo(() => {
        if (!profile?.earnedAchievements) return [];

        const earned = Object.values(profile.earnedAchievements);
        if (earned.length === 0) return [];
        
        const sorted = earned.sort((a, b) => {
            const achievementA = allAchievements.find(ach => ach.id === a.achievementId);
            const achievementB = allAchievements.find(ach => ach.id === b.achievementId);

            if (!achievementA || !achievementB) return 0;
            
            const rarityA = rarityOrder[achievementA.rarity] || 0;
            const rarityB = rarityOrder[achievementB.rarity] || 0;
            if (rarityB !== rarityA) return rarityB - rarityA;

            const tierA = tierOrder[achievementA.tiers[a.tier]?.name] || 0;
            const tierB = tierOrder[achievementB.tiers[b.tier]?.name] || 0;
            return tierB - tierA;
        });

        return sorted.slice(0, 3);
    }, [profile]);
    
    if (topAchievements.length === 0) return null;

    return (
        <TooltipProvider>
            <div className="flex items-center gap-1.5">
                {topAchievements.map(earned => {
                    const achievement = allAchievements.find(ach => ach.id === earned.achievementId);
                    if (!achievement) return null;
                    const tier = achievement.tiers[earned.tier];
                    return (
                        <Tooltip key={achievement.id}>
                            <TooltipTrigger>
                                <Icon name={achievement.icon} className={getTierColor(tier.name)} />
                            </TooltipTrigger>
                            <TooltipContent>
                                <p className="font-bold">{achievement.name}</p>
                                <p className="text-sm text-muted-foreground">{tier.name} - {tier.description}</p>
                            </TooltipContent>
                        </Tooltip>
                    )
                })}
            </div>
        </TooltipProvider>
    );
}
