
'use client';

import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { Button } from './ui/button';
import { X } from 'lucide-react';

const isIos = () => {
    if (typeof window === 'undefined') return false;
    // Standard check for iOS devices
    return /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
};

const isInStandaloneMode = () =>
    (window.matchMedia('(display-mode: standalone)').matches) || ((window.navigator as any).standalone);


export function IosInstallPrompt() {
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        // Show prompt only if on iOS, not in standalone mode, and not previously dismissed
        const showPrompt = isIos() && !isInStandaloneMode() && !localStorage.getItem('iosInstallPromptDismissed');
        
        if (showPrompt) {
            const timer = setTimeout(() => {
                setIsVisible(true);
            }, 5000); // Show after a 5-second delay
            
            return () => clearTimeout(timer);
        }
    }, []);

    const handleDismiss = () => {
        localStorage.setItem('iosInstallPromptDismissed', 'true');
        setIsVisible(false);
    };

    if (!isVisible) {
        return null;
    }

    return (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-full max-w-sm rounded-lg bg-card shadow-lg border p-4 transition-all animate-in slide-in-from-bottom-10 fade-in-50">
            <div className="flex items-start gap-4">
                <div className="flex-shrink-0 pt-0.5">
                    {/* iOS Share Icon SVG */}
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6 text-primary">
                        <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                        <polyline points="16 6 12 2 8 6" />
                        <line x1="12" x2="12" y1="2" y2="15" />
                    </svg>
                </div>
                <div className="flex-grow">
                    <h3 className="font-semibold">Install eArena</h3>
                    <p className="text-sm text-muted-foreground">For the best experience, add this app to your Home Screen.</p>
                </div>
                 <button onClick={handleDismiss} className="absolute top-2 right-2 p-1 rounded-full hover:bg-muted">
                    <X className="h-4 w-4" />
                    <span className="sr-only">Dismiss</span>
                </button>
            </div>
            <div className="mt-4 flex flex-col gap-2 text-sm text-center">
               <p>Tap the <span className="font-bold">Share</span> button, then scroll down and tap <span className="font-bold">'Add to Home Screen'</span>.</p>
            </div>
        </div>
    );
}
