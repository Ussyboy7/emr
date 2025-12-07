import { useEffect, useRef } from 'react';

interface UsePollingOptions {
  enabled?: boolean;
  runImmediately?: boolean;
}

/**
 * Consistent polling hook to reduce duplicated setInterval logic.
 */
export const usePolling = (
  callback: () => void | Promise<void>,
  intervalMs: number,
  options: UsePollingOptions = {}
) => {
  const { enabled = true, runImmediately = false } = options;
  const savedCallback = useRef(callback);

  useEffect(() => {
    savedCallback.current = callback;
  }, [callback]);

  useEffect(() => {
    if (!enabled || intervalMs <= 0) {
      return;
    }

    if (runImmediately) {
      void savedCallback.current();
    }

    const id = setInterval(() => {
      void savedCallback.current();
    }, intervalMs);

    return () => clearInterval(id);
  }, [enabled, intervalMs, runImmediately]);
};

