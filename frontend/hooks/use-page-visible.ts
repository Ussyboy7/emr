"use client";

import { useEffect, useState } from 'react';

/**
 * Returns true when the browser tab/window is visible (document.visibilityState === 'visible').
 * Polling intervals can use this to avoid background network calls when the user isn't watching.
 */
export const usePageVisible = (): boolean => {
  const [visible, setVisible] = useState(
    typeof document !== 'undefined' ? document.visibilityState === 'visible' : true
  );

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const handler = () => setVisible(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  }, []);

  return visible;
};
