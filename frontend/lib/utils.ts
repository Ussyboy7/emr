import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Generate a UUID v4-compatible string with fallback for environments without crypto.randomUUID
 * This is safe to use in both browser and server-side contexts
 */
export function generateUUID(): string {
  // Check if crypto.randomUUID is available (browser with secure context or Node.js 19+)
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    try {
      return crypto.randomUUID();
    } catch (e) {
      // Fall through to fallback if randomUUID fails (e.g., insecure context)
    }
  }
  
  // Fallback: generate a UUID v4-like string
  // This works in all environments including SSR and older browsers
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
