// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

const mockRouter = { replace: vi.fn() };
const mockSearchParams = new URLSearchParams();
const mockPathname = '/lab';

vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  usePathname: () => mockPathname,
  useSearchParams: () => mockSearchParams,
}));

import { useLabUrlSync } from './use-lab-url-sync';

describe('useLabUrlSync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchParams.delete('search');
    mockSearchParams.delete('tab');
  });

  it('hydrates search from URL on first render', () => {
    mockSearchParams.set('search', 'blood');
    const onSearchFromUrl = vi.fn();
    const onTabFromUrl = vi.fn();
    renderHook(() =>
      useLabUrlSync({
        search: '',
        tab: 'pending',
        defaultTab: 'pending',
        onSearchFromUrl,
        onTabFromUrl,
        isValidTab: () => true,
      })
    );
    expect(onSearchFromUrl).toHaveBeenCalledWith('blood');
  });

  it('hydrates tab from URL on first render if valid', () => {
    mockSearchParams.set('tab', 'pending');
    const onSearchFromUrl = vi.fn();
    const onTabFromUrl = vi.fn();
    renderHook(() =>
      useLabUrlSync({
        search: '',
        tab: 'pending',
        defaultTab: 'pending',
        onSearchFromUrl,
        onTabFromUrl,
        isValidTab: (v) => v === 'pending',
      })
    );
    expect(onTabFromUrl).toHaveBeenCalledWith('pending');
  });

  it('does not hydrate tab if invalid', () => {
    mockSearchParams.set('tab', 'bogus');
    const onTabFromUrl = vi.fn();
    renderHook(() =>
      useLabUrlSync({
        search: '',
        tab: 'pending',
        defaultTab: 'pending',
        onSearchFromUrl: vi.fn(),
        onTabFromUrl,
        isValidTab: (v) => v === 'pending',
      })
    );
    expect(onTabFromUrl).not.toHaveBeenCalled();
  });
});
