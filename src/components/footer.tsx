
'use client';

import Link from 'next/link';
import { Trophy } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { SocialIcons } from './social-icons';
import { BackgroundMusicPlayer } from './background-music-player';

export function Footer() {
  const { settings } = useAuth();
  const currentYear = new Date().getFullYear();

  const socialLinks = {
    whatsapp: settings?.whatsappUrl,
    facebook: settings?.facebookUrl,
    instagram: settings?.instagramUrl,
    youtube: settings?.youtubeUrl,
  };

  const hasSocialLinks = Object.values(socialLinks).some(link => link);
  const supportEmail = process.env.NEXT_PUBLIC_PLATFORM_EMAIL;

  return (
    <footer className="border-t border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex flex-col items-center justify-between gap-6 py-4 md:h-24 md:flex-row">
        <div className="flex flex-col items-center gap-4 px-8 md:flex-row md:gap-2 md:px-0">
          <Trophy className="h-6 w-6 text-primary" />
          <p className="text-center text-sm leading-loose text-muted-foreground md:text-left">
            &copy; {currentYear} eArena. All rights reserved.
          </p>
        </div>
        <div className="flex items-center gap-4">
            <BackgroundMusicPlayer musicTracks={settings?.backgroundMusic || []} />
            <div className="hidden md:flex items-center gap-4">
                {hasSocialLinks && <SocialIcons links={socialLinks} />}
                {supportEmail && (
                    <a href={`mailto:${supportEmail}`} className="text-sm font-medium text-muted-foreground hover:text-primary">Help</a>
                )}
                <Link href="/terms" className="text-sm font-medium text-muted-foreground hover:text-primary">Terms</Link>
                <Link href="/privacy" className="text-sm font-medium text-muted-foreground hover:text-primary">Privacy</Link>
            </div>
        </div>
      </div>
    </footer>
  );
}
