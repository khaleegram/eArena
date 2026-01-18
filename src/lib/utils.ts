import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import type { UnifiedTimestamp } from "./types";

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

// Helper function to convert Firestore Timestamps to ISO strings recursively
export function serializeData(data: any): any {
  if (data === null || data === undefined || typeof data !== 'object') {
    return data;
  }

  // This check works for both client and admin Timestamps without importing them.
  if (data && typeof data.toDate === 'function' && !(data instanceof Date)) {
    return data.toDate().toISOString();
  }
  
  if (data instanceof Date) {
      return data.toISOString();
  }

  if (Array.isArray(data)) {
    return data.map(serializeData);
  }

  // This handles plain objects
  const serializedObject: { [key: string]: any } = {};
  for (const key in data) {
    if (Object.prototype.hasOwnProperty.call(data, key)) {
      serializedObject[key] = serializeData(data[key]);
    }
  }
  return serializedObject;
}
