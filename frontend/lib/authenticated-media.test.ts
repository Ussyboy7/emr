import { describe, expect, it, vi, afterEach } from 'vitest';

const apiFetch = vi.fn();

vi.mock('@/lib/api-client', () => ({
  apiFetch: (...args: unknown[]) => apiFetch(...args),
}));

import {
  clearAuthenticatedMediaCache,
  fetchAuthenticatedMediaBlob,
  isInlineMediaUrl,
} from './media-url';

describe('isInlineMediaUrl', () => {
  it('detects data and blob URLs', () => {
    expect(isInlineMediaUrl('data:image/png;base64,abc')).toBe(true);
    expect(isInlineMediaUrl('blob:http://localhost/abc')).toBe(true);
    expect(isInlineMediaUrl('/media/patients/photos/a.jpg')).toBe(false);
  });
});

describe('fetchAuthenticatedMediaBlob', () => {
  afterEach(() => {
    clearAuthenticatedMediaCache();
    apiFetch.mockReset();
  });

  it('returns inline URLs without fetching', async () => {
    const dataUrl = 'data:image/png;base64,abc';
    await expect(fetchAuthenticatedMediaBlob(dataUrl)).resolves.toBe(dataUrl);
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it('fetches protected media and caches blob URLs', async () => {
    apiFetch.mockResolvedValue(new Blob(['img'], { type: 'image/jpeg' }));

    const first = await fetchAuthenticatedMediaBlob('/media/patients/photos/a.jpg');
    const second = await fetchAuthenticatedMediaBlob('/media/patients/photos/a.jpg');

    expect(first).toMatch(/^blob:/);
    expect(second).toBe(first);
    expect(apiFetch).toHaveBeenCalledTimes(1);
    expect(apiFetch).toHaveBeenCalledWith('/common/media/patients/photos/a.jpg', {
      responseType: 'blob',
    });
  });

  it('returns null when fetch fails', async () => {
    apiFetch.mockRejectedValue(new Error('401'));

    await expect(
      fetchAuthenticatedMediaBlob('/media/patients/photos/missing.jpg'),
    ).resolves.toBeNull();
  });
});
