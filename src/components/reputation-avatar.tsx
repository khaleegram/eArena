
"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import type { UserProfile, Player } from "@/lib/types";
import { cn } from "@/lib/utils";

const getReputationClasses = (warnings: number = 0): string => {
    // These thresholds can be adjusted
    if (warnings >= 15) return "ring-destructive/80"; // Red
    if (warnings >= 10) return "ring-yellow-500/90";  // Deeper Yellow
    if (warnings >= 5) return "ring-yellow-400/90";   // Yellow
    if (warnings >= 2) return "ring-green-500/70";    // Slightly dimmer green
    return "ring-green-500";                         // Full green
};

export function ReputationAvatar({ profile, className }: { profile: Partial<UserProfile & Player> | null, className?: string }) {
    if (!profile) {
        return (
            <Avatar className={cn("ring-2 ring-offset-1 ring-offset-background ring-muted", className)}>
                <AvatarFallback>?</AvatarFallback>
            </Avatar>
        );
    }
    
    const ringClass = getReputationClasses(profile.warnings);
    const fallback = profile.username ? profile.username.charAt(0).toUpperCase() : (profile.email ? profile.email.charAt(0).toUpperCase() : 'U');

    return (
        <Avatar className={cn("ring-2 ring-offset-1 ring-offset-background", ringClass, className)}>
            <AvatarImage src={profile.photoURL} alt={profile.username || 'User'} />
            <AvatarFallback>{fallback}</AvatarFallback>
        </Avatar>
    )
}
