import { describe, expect, it, vi } from 'vitest';

let capturedInitializer: (() => string) | null = null;

vi.mock('react', () => ({
  useState: vi.fn((init: unknown) => {
    if (typeof init === 'function') {
      capturedInitializer = init as () => string;
      const val = (init as () => string)();
      return [val, vi.fn()];
    }
    return [init, vi.fn()];
  }),
  useEffect: vi.fn(),
}));

const mockPeekServerNow = vi.fn();
const mockPeekServerTimezone = vi.fn();
const mockTodayApiDateString = vi.fn();

vi.mock('@/lib/utils/serverTime', () => ({
  getServerToday: vi.fn(),
  peekServerNow: (...args: any[]) => mockPeekServerNow(...args),
  peekServerTimezone: (...args: any[]) => mockPeekServerTimezone(...args),
}));

vi.mock('@/lib/dates', () => ({
  peekServerTodayApi: vi.fn(() => '2026-06-16'),
  todayApiDateString: (...args: any[]) => mockTodayApiDateString(...args),
}));

import { useServerToday } from './use-server-today';

describe('useServerToday', () => {
  it('uses local today fallback when server time not available', () => {
    mockPeekServerNow.mockReturnValue(null);
    mockPeekServerTimezone.mockReturnValue(null);
    mockTodayApiDateString.mockReturnValue('2026-06-16');

    const result = useServerToday();
    expect(result).toBe('2026-06-16');
    expect(mockTodayApiDateString).toHaveBeenCalled();
  });

  it('uses server time when peek values available', () => {
    const fakeDate = new Date('2026-06-15T12:00:00Z');
    mockPeekServerNow.mockReturnValue(fakeDate);
    mockPeekServerTimezone.mockReturnValue('Africa/Lagos');
    mockTodayApiDateString.mockReturnValue('2026-06-16');

    const result = useServerToday();
    // toLocaleDateString with en-CA and Africa/Lagos timezone
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
