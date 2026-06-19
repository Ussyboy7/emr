import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AUTH_REFRESH_SESSION_MAX_AGE_SECONDS,
  buildQueryString,
  getBaseUrl,
  getReadableApiError,
} from './api-client';
import { getJwtRefreshHours } from './auth-session-config';

describe('getBaseUrl', () => {
  const original = process.env.NEXT_PUBLIC_API_URL;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.NEXT_PUBLIC_API_URL;
    } else {
      process.env.NEXT_PUBLIC_API_URL = original;
    }
  });

  it('throws when NEXT_PUBLIC_API_URL is missing', () => {
    delete process.env.NEXT_PUBLIC_API_URL;
    expect(() => getBaseUrl()).toThrow(/NEXT_PUBLIC_API_URL/);
  });

  it('returns versioned API root unchanged', () => {
    process.env.NEXT_PUBLIC_API_URL = 'http://localhost:8001/api/v1/';
    expect(getBaseUrl()).toBe('http://localhost:8001/api/v1');
  });

  it('appends /api when host has no API suffix', () => {
    process.env.NEXT_PUBLIC_API_URL = 'http://localhost:8001';
    expect(getBaseUrl()).toBe('http://localhost:8001/api');
  });
});

describe('buildQueryString', () => {
  it('omits undefined and empty values', () => {
    expect(buildQueryString({ a: '1', b: undefined, c: '' })).toBe('?a=1');
  });

  it('returns empty string when no params remain', () => {
    expect(buildQueryString({})).toBe('');
    expect(buildQueryString({ skip: undefined })).toBe('');
  });

  it('serializes numbers and booleans', () => {
    expect(buildQueryString({ page: 2, active: true })).toBe('?page=2&active=true');
  });
});

describe('getReadableApiError', () => {
  it('prefers apiMessage then message', () => {
    expect(getReadableApiError({ apiMessage: 'From API', message: 'Generic' })).toBe('From API');
    expect(getReadableApiError({ message: 'Generic only' })).toBe('Generic only');
  });

  it('maps auth and not-found statuses', () => {
    expect(getReadableApiError({ status: 404 })).toMatch(/not found/i);
    expect(getReadableApiError({ status: 401 })).toMatch(/sign in again/i);
    expect(getReadableApiError({ status: 403 })).toMatch(/sign in again/i);
  });

  it('falls back to generic message', () => {
    expect(getReadableApiError({})).toBe('Something went wrong. Please try again.');
  });
});

describe('AUTH_REFRESH_SESSION_MAX_AGE_SECONDS', () => {
  it('defaults to eight-hour refresh window when env unset', () => {
    expect(getJwtRefreshHours()).toBe(8);
    expect(AUTH_REFRESH_SESSION_MAX_AGE_SECONDS).toBe(60 * 60 * 8);
  });
});

describe('apiFetch auth guard', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://localhost:8001/api/v1');
    vi.stubGlobal('window', undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('throws AuthenticationError when no token is available', async () => {
    const { apiFetch } = await import('./api-client');
    const { AuthenticationError } = await import('./auth-errors');
    await expect(apiFetch('/patients/')).rejects.toBeInstanceOf(AuthenticationError);
  });
});
