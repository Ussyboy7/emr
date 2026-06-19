import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/api-client', () => ({
  apiFetch: vi.fn(),
}));

import { apiFetch } from '@/lib/api-client';
import {
  applyOrgIdleTimeoutMinutes,
  clampIdleTimeoutMinutes,
  DEFAULT_IDLE_TIMEOUT_MINUTES,
  fetchOrgIdleTimeoutMinutes,
  getIdleTimeoutMinutes,
  getLoginRedirectToastMessage,
  updateOrgIdleTimeoutMinutes,
} from './auth-session-settings';

const mockedApiFetch = vi.mocked(apiFetch);

describe('auth-session-settings', () => {
  afterEach(() => {
    vi.clearAllMocks();
    applyOrgIdleTimeoutMinutes(DEFAULT_IDLE_TIMEOUT_MINUTES);
  });

  it('defaults to 30 minutes before fetch', () => {
    expect(getIdleTimeoutMinutes()).toBe(DEFAULT_IDLE_TIMEOUT_MINUTES);
  });

  it('fetches org idle timeout from API', async () => {
    mockedApiFetch.mockResolvedValueOnce({ idle_session_timeout_minutes: 45 });
    await expect(fetchOrgIdleTimeoutMinutes()).resolves.toBe(45);
    expect(getIdleTimeoutMinutes()).toBe(45);
  });

  it('updates org idle timeout via API', async () => {
    mockedApiFetch.mockResolvedValueOnce({ idle_session_timeout_minutes: 20 });
    await expect(updateOrgIdleTimeoutMinutes(20)).resolves.toBe(20);
    expect(getIdleTimeoutMinutes()).toBe(20);
  });

  it('maps login redirect reasons to toast messages', () => {
    applyOrgIdleTimeoutMinutes(30);
    expect(getLoginRedirectToastMessage('permissions_stale')).toMatch(/permissions changed/i);
    expect(getLoginRedirectToastMessage('idle_timeout')).toMatch(/30 minutes/);
    expect(getLoginRedirectToastMessage(null)).toBeNull();
  });

  it('clampIdleTimeoutMinutes handles invalid input', () => {
    expect(clampIdleTimeoutMinutes(Number.NaN)).toBe(DEFAULT_IDLE_TIMEOUT_MINUTES);
    expect(clampIdleTimeoutMinutes(999)).toBe(240);
  });
});
