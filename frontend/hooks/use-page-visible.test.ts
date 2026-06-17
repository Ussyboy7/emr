import { describe, expect, it, vi } from 'vitest';

let capturedEffect: (() => void | (() => void)) | null = null;
let currentVisible = true;
const mockSetVisible = vi.fn((v: boolean) => { currentVisible = v; });

vi.mock('react', () => ({
  useState: vi.fn((init: unknown) => {
    if (typeof init === 'boolean') {
      currentVisible = init;
      return [init, mockSetVisible];
    }
    const resolved = typeof init === 'function' ? (init as () => unknown)() : init;
    currentVisible = resolved as boolean;
    return [resolved, mockSetVisible];
  }),
  useEffect: vi.fn((cb: () => void | (() => void)) => {
    capturedEffect = cb;
  }),
}));

import { usePageVisible } from './use-page-visible';

describe('usePageVisible', () => {
  it('defaults to true when document is undefined', () => {
    const origDoc = globalThis.document;
    // @ts-expect-error testing undefined document
    delete globalThis.document;

    const result = usePageVisible();
    expect(result).toBe(true);

    globalThis.document = origDoc;
  });

  it('returns visibility state based on document.visibilityState', () => {
    vi.stubGlobal('document', {
      visibilityState: 'hidden',
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });

    const result = usePageVisible();
    expect(result).toBe(false);

    vi.unstubAllGlobals();
  });
});
