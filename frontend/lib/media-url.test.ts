import { describe, expect, it, vi, beforeEach } from 'vitest';
import { getMediaUrl, normalizeMediaRelativePath } from './media-url';

describe('normalizeMediaRelativePath', () => {
  it('strips /media/ prefix from relative paths', () => {
    expect(normalizeMediaRelativePath('/media/radiology/reports/foo.pdf')).toBe(
      'radiology/reports/foo.pdf',
    );
  });

  it('strips /media/ from absolute backend URLs', () => {
    expect(
      normalizeMediaRelativePath('https://api.example.com/media/radiology/reports/foo.pdf'),
    ).toBe('radiology/reports/foo.pdf');
  });

  it('strips /common/media/ from protected API URLs', () => {
    expect(
      normalizeMediaRelativePath('/api/v1/common/media/radiology/reports/foo.pdf'),
    ).toBe('radiology/reports/foo.pdf');
  });
});

describe('getMediaUrl', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://localhost:8000/api/v1');
  });

  it('builds protected URL from storage-relative path', () => {
    expect(getMediaUrl('radiology/reports/foo.pdf')).toBe(
      'http://localhost:8000/api/v1/common/media/radiology/reports/foo.pdf',
    );
  });

  it('rewrites legacy absolute /media/ URLs', () => {
    expect(getMediaUrl('https://api.example.com/media/radiology/reports/foo.pdf')).toBe(
      'http://localhost:8000/api/v1/common/media/radiology/reports/foo.pdf',
    );
  });

  it('passes through unrelated external URLs', () => {
    expect(getMediaUrl('https://cdn.example.com/assets/logo.png')).toBe(
      'https://cdn.example.com/assets/logo.png',
    );
  });
});
