import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let capturedEffect: (() => void | (() => void)) | null = null;
let currentState: unknown = undefined;
const mockSetState = vi.fn((v: unknown) => { currentState = v; });

vi.mock('react', () => ({
  useState: vi.fn((init: unknown) => [currentState ?? init, mockSetState]),
  useEffect: vi.fn((cb: () => void | (() => void)) => { capturedEffect = cb; }),
}));

import { useDebouncedValue } from './use-debounced-value';

describe('useDebouncedValue', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    currentState = undefined;
    capturedEffect = null;
    mockSetState.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('returns the initial value immediately', () => {
    const result = useDebouncedValue('hello', 300);
    expect(result).toBe('hello');
  });

  it('schedules a timer via setTimeout in useEffect', () => {
    useDebouncedValue('test', 500);
    expect(capturedEffect).toBeTypeOf('function');

    const cleanup = capturedEffect!();
    expect(cleanup).toBeTypeOf('function');
  });

  it('calls setState after the delay elapses', () => {
    useDebouncedValue('delayed', 200);
    capturedEffect!();
    vi.advanceTimersByTime(200);
    expect(mockSetState).toHaveBeenCalledWith('delayed');
  });

  it('cleanup cancels pending timer', () => {
    useDebouncedValue('cancel', 300);
    const cleanup = capturedEffect!() as () => void;
    cleanup();
    vi.advanceTimersByTime(300);
    expect(mockSetState).not.toHaveBeenCalled();
  });
});
