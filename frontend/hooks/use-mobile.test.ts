import { describe, expect, it, vi } from 'vitest';

vi.mock('react', async () => {
  const actual: any = {};
  return {
    ...actual,
    useState: vi.fn((init: unknown) => [init, vi.fn()]),
    useEffect: vi.fn(),
  };
});

import { useIsMobile } from './use-mobile';

describe('useIsMobile', () => {
  it('returns false initially (undefined coerced to false)', () => {
    const result = useIsMobile();
    expect(result).toBe(false);
  });

  it('returns a boolean', () => {
    const result = useIsMobile();
    expect(typeof result).toBe('boolean');
  });
});
