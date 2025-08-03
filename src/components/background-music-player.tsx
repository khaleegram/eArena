

'use client';

import { useState, useEffect, useRef } from 'react';
import { Volume2, VolumeX, Play, Pause } from 'lucide-react';
import { Button } from './ui/button';
import { Slider } from './ui/slider';

interface BackgroundMusicPlayerProps {
    musicTracks: string[];
}

export function BackgroundMusicPlayer({ musicTracks }: BackgroundMusicPlayerProps) {
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [isMuted, setIsMuted] = useState(false);
    const [volume, setVolume] = useState(0.05); // Default to 5% volume
    const [currentTrackIndex, setCurrentTrackIndex] = useState(0);

    useEffect(() => {
        if (musicTracks.length > 0 && !audioRef.current && typeof window !== 'undefined') {
            audioRef.current = new Audio(musicTracks[0]);
            audioRef.current.volume = volume;
            audioRef.current.loop = false;
        }
    }, [musicTracks, volume]);

    useEffect(() => {
        const audio = audioRef.current;
        if (!audio || musicTracks.length === 0) return;

        const handleTrackEnd = () => {
            setCurrentTrackIndex((prevIndex) => (prevIndex + 1) % musicTracks.length);
        };
        
        const handleCanPlayThrough = () => {
            if (isPlaying) {
                audio.play().catch(error => console.error("Autoplay was prevented:", error));
            }
        };

        audio.addEventListener('ended', handleTrackEnd);
        audio.addEventListener('canplaythrough', handleCanPlayThrough);
        
        audio.src = musicTracks[currentTrackIndex];
        if(isPlaying) {
            audio.play().catch(error => console.error("Playback failed after track change:", error));
        }

        return () => {
            audio.removeEventListener('ended', handleTrackEnd);
            audio.removeEventListener('canplaythrough', handleCanPlayThrough);
        };
    }, [currentTrackIndex, isPlaying, musicTracks]);

    const togglePlayPause = () => {
        const audio = audioRef.current;
        if (!audio) return;

        if (isPlaying) {
            audio.pause();
        } else {
            audio.play().catch(error => console.error("Playback was prevented:", error));
        }
        setIsPlaying(!isPlaying);
    };

    const toggleMute = () => {
        const audio = audioRef.current;
        if (!audio) return;
        audio.muted = !isMuted;
        setIsMuted(!isMuted);
    };

    const handleVolumeChange = (value: number[]) => {
        const newVolume = value[0];
        setVolume(newVolume);
        if (audioRef.current) {
            audioRef.current.volume = newVolume;
        }
    };
    
    if (musicTracks.length === 0) {
        return null; // Don't render the player if no tracks are set
    }

    return (
        <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={togglePlayPause}>
                {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            </Button>
            <Button variant="ghost" size="icon" onClick={toggleMute}>
                {isMuted || volume === 0 ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            </Button>
            <Slider
                value={[volume]}
                onValueChange={handleVolumeChange}
                max={0.2} // Max volume at 20% to keep it in the background
                step={0.01}
                className="w-24"
            />
        </div>
    );
}
