/**
 * Polyfill for crypto.randomUUID to ensure it's available in all environments
 * This prevents errors when third-party libraries try to use crypto.randomUUID
 * in environments where it's not available (SSR, older browsers, insecure contexts)
 * 
 * This must run immediately, before any other code executes
 */

(function() {
  'use strict';
  
  // Generate UUID v4 fallback function
  function generateUUIDFallback(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  // Browser environment
  if (typeof window !== 'undefined') {
    try {
      // Check if crypto exists and has randomUUID
      if (typeof window.crypto !== 'undefined' && typeof window.crypto.randomUUID === 'function') {
        // Test if it actually works (might throw in insecure contexts)
        try {
          window.crypto.randomUUID();
          // If we get here, it works, no polyfill needed
          return;
        } catch (e) {
          // randomUUID exists but doesn't work, need polyfill
        }
      }
      
      // Ensure crypto object exists
      if (typeof window.crypto === 'undefined') {
        (window as any).crypto = {};
      }
      
      // Polyfill randomUUID
      if (typeof window.crypto.randomUUID !== 'function') {
        (window.crypto as any).randomUUID = generateUUIDFallback;
      }
    } catch (e) {
      // Fallback: ensure crypto exists and has randomUUID
      if (typeof (window as any).crypto === 'undefined') {
        (window as any).crypto = {};
      }
      (window as any).crypto.randomUUID = generateUUIDFallback;
    }
  }
  
  // Node.js environment (SSR)
  if (typeof global !== 'undefined') {
    try {
      const globalCrypto = (global as any).crypto;
      if (typeof globalCrypto === 'undefined' || typeof globalCrypto?.randomUUID !== 'function') {
        if (typeof (global as any).crypto === 'undefined') {
          (global as any).crypto = {};
        }
        (global as any).crypto.randomUUID = generateUUIDFallback;
      }
    } catch (e) {
      // Ensure crypto exists
      if (typeof (global as any).crypto === 'undefined') {
        (global as any).crypto = {};
      }
      (global as any).crypto.randomUUID = generateUUIDFallback;
    }
  }
})();

