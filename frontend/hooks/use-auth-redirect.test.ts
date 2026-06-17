import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getStoredRedirectPath } from './use-auth-redirect';

describe('getStoredRedirectPath', () => {
  let mockSessionStorage: Record<string, string>;
  const origWindow = globalThis.window;

  beforeEach(() => {
    mockSessionStorage = {};

    const ssProxy = {
      getItem: vi.fn((key: string) => mockSessionStorage[key] ?? null),
      setItem: vi.fn((key: string, value: string) => { mockSessionStorage[key] = value; }),
      removeItem: vi.fn((key: string) => { delete mockSessionStorage[key]; }),
      clear: vi.fn(),
      length: 0,
      key: vi.fn(() => null),
    };

    vi.stubGlobal('window', { location: { pathname: '/' } });
    vi.stubGlobal('sessionStorage', ssProxy);
    vi.stubGlobal('document', { cookie: '' });
  });

  afterEach(() => {
    if (origWindow === undefined) {
      // @ts-expect-error restore
      delete globalThis.window;
    } else {
      vi.stubGlobal('window', origWindow);
    }
    vi.restoreAllMocks();
  });

  it('returns null when no stored path', () => {
    expect(getStoredRedirectPath()).toBeNull();
  });

  it('returns and clears session storage redirect path', () => {
    mockSessionStorage['redirect_after_login'] = '/medical-records/patients';

    const path = getStoredRedirectPath();
    expect(path).toBe('/medical-records/patients');
    expect(sessionStorage.removeItem).toHaveBeenCalledWith('redirect_after_login');
  });

  it('prefers session storage over cookies', () => {
    mockSessionStorage['redirect_after_login'] = '/dashboard';
    (globalThis as any).document = { cookie: 'auth_next_redirect=%2Fconsultation' };

    const path = getStoredRedirectPath();
    expect(path).toBe('/dashboard');
  });
});
