import { describe, expect, it, vi } from 'vitest';

vi.mock('react', () => ({
  useEffect: vi.fn(),
  useRef: vi.fn((init: unknown) => ({ current: init })),
}));

import { DEFAULT_CLINIC_DASHBOARD_POLL_MS } from './use-reload-on-focus';

describe('useReloadOnFocus exports', () => {
  it('exports DEFAULT_CLINIC_DASHBOARD_POLL_MS as 30_000', () => {
    expect(DEFAULT_CLINIC_DASHBOARD_POLL_MS).toBe(30_000);
  });

  it('DEFAULT_CLINIC_DASHBOARD_POLL_MS is a positive number', () => {
    expect(typeof DEFAULT_CLINIC_DASHBOARD_POLL_MS).toBe('number');
    expect(DEFAULT_CLINIC_DASHBOARD_POLL_MS).toBeGreaterThan(0);
  });
});
