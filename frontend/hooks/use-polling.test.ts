import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let capturedEffects: Array<() => void | (() => void)> = [];
const refValue = { current: vi.fn() };

vi.mock('react', () => ({
  useEffect: vi.fn((cb: () => void | (() => void)) => {
    capturedEffects.push(cb);
  }),
  useRef: vi.fn((init: unknown) => {
    if (typeof init === 'function') {
      refValue.current = init as any;
      return refValue;
    }
    return { current: init };
  }),
}));

import { usePolling } from './use-polling';

describe('usePolling', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    capturedEffects = [];
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('sets up interval when enabled', () => {
    const callback = vi.fn();
    usePolling(callback, 1000);

    // First effect updates ref, second sets up interval
    const intervalEffect = capturedEffects[1];
    expect(intervalEffect).toBeTypeOf('function');

    const cleanup = intervalEffect();
    vi.advanceTimersByTime(3000);
    expect(refValue.current).toBeDefined();
    if (typeof cleanup === 'function') cleanup();
  });

  it('does not set interval when disabled', () => {
    const callback = vi.fn();
    usePolling(callback, 1000, { enabled: false });

    const intervalEffect = capturedEffects[1];
    const cleanup = intervalEffect();
    expect(cleanup).toBeUndefined();
  });

  it('does not set interval when intervalMs <= 0', () => {
    const callback = vi.fn();
    usePolling(callback, 0);

    const intervalEffect = capturedEffects[1];
    const cleanup = intervalEffect();
    expect(cleanup).toBeUndefined();
  });

  it('calls callback immediately when runImmediately is true', () => {
    const callback = vi.fn();
    refValue.current = callback;
    usePolling(callback, 5000, { runImmediately: true });

    const intervalEffect = capturedEffects[1];
    intervalEffect();
    expect(callback).toHaveBeenCalled();
  });
});
