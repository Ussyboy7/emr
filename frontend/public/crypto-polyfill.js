/**
 * Crypto.randomUUID polyfill - must be loaded as a script tag before any other code
 * This ensures crypto.randomUUID is available even in insecure contexts or older browsers
 */
(function() {
  'use strict';
  
  function generateUUIDFallback() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      var r = Math.random() * 16 | 0;
      var v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  // Browser environment
  if (typeof window !== 'undefined') {
    try {
      // Check if crypto exists and has randomUUID that works
      if (typeof window.crypto !== 'undefined' && typeof window.crypto.randomUUID === 'function') {
        try {
          window.crypto.randomUUID();
          return; // It works, no polyfill needed
        } catch (e) {
          // randomUUID exists but doesn't work, need polyfill
        }
      }
      
      // Ensure crypto object exists
      if (typeof window.crypto === 'undefined') {
        window.crypto = {};
      }
      
      // Polyfill randomUUID
      if (typeof window.crypto.randomUUID !== 'function') {
        window.crypto.randomUUID = generateUUIDFallback;
      }
    } catch (e) {
      // Fallback: ensure crypto exists and has randomUUID
      if (typeof window.crypto === 'undefined') {
        window.crypto = {};
      }
      window.crypto.randomUUID = generateUUIDFallback;
    }
  }
})();

