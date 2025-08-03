
'use client';

import { useState, useEffect, useRef } from 'react';
import { Volume2, VolumeX, Play, Pause } from 'lucide-react';
import { Button } from './ui/button';
import { Slider } from './ui/slider';

const musicTracks = [
    '/audio/track1.mp3',
    '/audio/track2.mp3',
    '/audio/track3.mp3',
    '/audio/track4.mp3',
    '/audio/track5.mp3',
];

export function BackgroundMusicPlayer() {
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [isMuted, setIsMuted] = useState(false);
    const [volume, setVolume] = useState(0.05); // Default to 5% volume
    const [currentTrackIndex, setCurrentTrackIndex] = useState(0);

    useEffect(() => {
        // We only want to create the audio element once on the client
        if (!audioRef.current && typeof window !== 'undefined') {
            audioRef.current = new Audio(musicTracks[currentTrackIndex]);
            audioRef.current.volume = volume;
            audioRef.current.loop = false; // We will handle looping manually
        }
    }, [volume, currentTrackIndex]);

    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) return;

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
        
        // When track changes, update src and try to play if already playing
        audio.src = musicTracks[currentTrackIndex];
        if(isPlaying) {
            audio.play().catch(error => console.error("Playback failed after track change:", error));
        }

        return () => {
            audio.removeEventListener('ended', handleTrackEnd);
            audio.removeEventListener('canplaythrough', handleCanPlayThrough);
        };
    }, [currentTrackIndex, isPlaying]);

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
