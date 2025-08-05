

'use client';

import type { UserProfile, PlayerStats } from '@/lib/types';
import { allAchievements, Achievement, AchievementTier } from '@/lib/achievements';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Progress } from '@/components/ui/progress';
import * as LucideIcons from 'lucide-react';
import { cn } from '@/lib/utils';
import { Trophy, Gamepad2, Target, Shield, ShieldQuestion } from 'lucide-react';


const iconMap: { [key: string]: React.ElementType } = {
  Trophy,
  Gamepad2,
  Target,
  Shield,
};


// Helper to get the correct icon component from its string name
const Icon = ({ name, className }: { name: string, className?: string }) => {
    const LucideIcon = iconMap[name] || ShieldQuestion;
    return <LucideIcon className={className} />;
};


const getTierColor = (tierName: AchievementTier['name']) => {
    switch (tierName) {
        case 'Bronze': return 'text-amber-700 bg-amber-700/10 border-amber-700/20';
        case 'Silver': return 'text-slate-400 bg-slate-400/10 border-slate-400/20';
        case 'Gold': return 'text-amber-400 bg-amber-400/10 border-amber-400/20';
        case 'Platinum': return 'text-cyan-400 bg-cyan-400/10 border-cyan-400/20';
        case 'Diamond': return 'text-blue-400 bg-blue-400/10 border-blue-400/20';
        case 'Legendary': return 'text-purple-400 bg-purple-400/10 border-purple-400/20';
        default: return 'text-muted-foreground bg-muted';
    }
};

const AchievementCard = ({ achievement, userProfile, playerStats }: { achievement: Achievement; userProfile: UserProfile | null; playerStats: PlayerStats | null }) => {
    const earnedData = userProfile?.earnedAchievements?.[achievement.id];
    const currentTierIndex = earnedData?.tier ?? -1;
    const currentProgress = earnedData?.progress ?? (playerStats ? achievement.evaluator(userProfile || {} as UserProfile, playerStats) : 0);
    
    const nextTierIndex = currentTierIndex + 1;
    const nextTier = achievement.tiers[nextTierIndex];
    const progressPercentage = nextTier ? Math.min((currentProgress / nextTier.value) * 100, 100) : 100;

    const displayedTier = currentTierIndex >= 0 ? achievement.tiers[currentTierIndex] : null;

    return (
        <Card className={cn("flex flex-col", displayedTier ? getTierColor(displayedTier.name) : 'bg-card/50')}>
            <CardHeader>
                <div className="flex items-center gap-3">
                    <Icon name={achievement.icon} className="h-8 w-8" />
                    <div>
                        <CardTitle className="text-base font-semibold">{achievement.name}</CardTitle>
                        <CardDescription className={cn(displayedTier ? 'text-inherit/80' : '')}>
                            {displayedTier ? `Unlocked: ${displayedTier.name}` : `Next Tier: ${nextTier?.name || 'Maxed Out'}`}
                        </CardDescription>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="flex-grow flex flex-col justify-end">
                <p className="text-xs mb-2 h-8">{nextTier?.description || displayedTier?.description || 'You are a legend!'}</p>
                <TooltipProvider>
                    <Tooltip>
                        <TooltipTrigger asChild>
                             <Progress value={progressPercentage} className="h-2" />
                        </TooltipTrigger>
                        <TooltipContent>
                            <p>{currentProgress} / {nextTier?.value ?? '---'}</p>
                        </TooltipContent>
                    </Tooltip>
                </TooltipProvider>
            </CardContent>
        </Card>
    );
};


export const AchievementsDisplay = ({ userProfile, playerStats }: { userProfile: UserProfile | null, playerStats: PlayerStats | null }) => {
  const categories = ['Competitive', 'Participation', 'Mastery', 'Community'];
  
  return (
    <div className="space-y-8">
      {categories.map(category => {
          const achievementsInCategory = allAchievements.filter(ach => ach.category === category);
          if (achievementsInCategory.length === 0) return null;

          return (
              <div key={category}>
                  <h3 className="text-xl font-headline font-semibold mb-4">{category} Achievements</h3>
                  <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {achievementsInCategory.map(ach => (
                          <AchievementCard 
                            key={ach.id} 
                            achievement={ach}
                            userProfile={userProfile}
                            playerStats={playerStats}
                           />
                      ))}
                  </div>
              </div>
          )
      })}
    </div>
  );
};
