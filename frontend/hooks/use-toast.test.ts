import { describe, expect, it } from 'vitest';
import { reducer } from './use-toast';

const makeToast = (id: string, title = 'Test') =>
  ({ id, title, open: true } as any);

describe('toast reducer', () => {
  it('ADD_TOAST prepends toast and respects limit', () => {
    const state = { toasts: [] };
    const next = reducer(state, {
      type: 'ADD_TOAST',
      toast: makeToast('1', 'Hello'),
    });
    expect(next.toasts).toHaveLength(1);
    expect(next.toasts[0].id).toBe('1');
  });

  it('ADD_TOAST caps at TOAST_LIMIT (1)', () => {
    const state = { toasts: [makeToast('old')] };
    const next = reducer(state, {
      type: 'ADD_TOAST',
      toast: makeToast('new'),
    });
    expect(next.toasts).toHaveLength(1);
    expect(next.toasts[0].id).toBe('new');
  });

  it('UPDATE_TOAST merges into matching toast', () => {
    const state = { toasts: [makeToast('1', 'Before')] };
    const next = reducer(state, {
      type: 'UPDATE_TOAST',
      toast: { id: '1', title: 'After' },
    });
    expect(next.toasts[0].title).toBe('After');
    expect(next.toasts[0].open).toBe(true);
  });

  it('UPDATE_TOAST ignores non-matching ids', () => {
    const state = { toasts: [makeToast('1', 'Original')] };
    const next = reducer(state, {
      type: 'UPDATE_TOAST',
      toast: { id: 'missing', title: 'Changed' },
    });
    expect(next.toasts[0].title).toBe('Original');
  });

  it('DISMISS_TOAST sets open=false for target', () => {
    const state = { toasts: [makeToast('1')] };
    const next = reducer(state, { type: 'DISMISS_TOAST', toastId: '1' });
    expect(next.toasts[0].open).toBe(false);
  });

  it('DISMISS_TOAST without id dismisses all', () => {
    const state = {
      toasts: [makeToast('1'), makeToast('2')].slice(0, 1),
    };
    const next = reducer(state, { type: 'DISMISS_TOAST' });
    expect(next.toasts.every((t: any) => t.open === false)).toBe(true);
  });

  it('REMOVE_TOAST removes specific toast', () => {
    const state = { toasts: [makeToast('1')] };
    const next = reducer(state, { type: 'REMOVE_TOAST', toastId: '1' });
    expect(next.toasts).toHaveLength(0);
  });

  it('REMOVE_TOAST without id clears all', () => {
    const state = { toasts: [makeToast('1')] };
    const next = reducer(state, { type: 'REMOVE_TOAST', toastId: undefined });
    expect(next.toasts).toHaveLength(0);
  });
});
