import { describe, expect, it } from 'vitest';
import {
  AUTH_REFRESH_SESSION_MAX_AGE_SECONDS,
  getJwtRefreshHours,
  IDLE_WARNING_LEAD_MS,
} from './auth-session-config';
import { DEFAULT_IDLE_TIMEOUT_MINUTES } from './auth-session-settings';

describe('auth-session-config', () => {
  it('uses eight-hour refresh default when env unset', () => {
    expect(getJwtRefreshHours()).toBe(8);
    expect(AUTH_REFRESH_SESSION_MAX_AGE_SECONDS).toBe(8 * 60 * 60);
  });

  it('idle warning fires five minutes before logout', () => {
    expect(IDLE_WARNING_LEAD_MS).toBe(5 * 60 * 1000);
    expect(DEFAULT_IDLE_TIMEOUT_MINUTES * 60 * 1000 - IDLE_WARNING_LEAD_MS).toBe(25 * 60 * 1000);
  });
});
