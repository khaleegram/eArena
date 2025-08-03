import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import type { UnifiedTimestamp } from "./types";
import { Timestamp } from "firebase-admin/firestore";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Utility to consistently convert various timestamp formats to a JS Date object
export const toDate = (timestamp: UnifiedTimestamp): Date => {
    if (timestamp instanceof Date) {
        return timestamp;
    }
    if (typeof timestamp === 'string') {
        return new Date(timestamp);
    }
    // Handle both client-side and admin-side Firestore Timestamps
    if (timestamp && typeof (timestamp as any).toDate === 'function') {
        return (timestamp as any).toDate();
    }
    // Fallback for any other case, though it should ideally not be reached
    return new Date();
};
