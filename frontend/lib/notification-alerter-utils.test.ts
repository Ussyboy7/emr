import { describe, expect, it } from 'vitest';
import {
  buildCoalesceKey,
  buildCoalescedToastCopy,
  isHigherPriority,
  shouldBypassCoalescing,
  shouldPlayNotificationSound,
  tabIsFocused,
  toastDurationForPriority,
} from './notification-alerter-utils';

describe('notification-alerter-utils', () => {
  it('buildCoalesceKey groups by type and action URL', () => {
    expect(
      buildCoalesceKey({
        notification_type: 'prescription',
        actionUrl: '/pharmacy/prescriptions',
      }),
    ).toBe('prescription|/pharmacy/prescriptions');
    expect(
      buildCoalesceKey({ notification_type: 'workflow', actionUrl: undefined }),
    ).toBe('workflow|');
  });

  it('isHigherPriority ranks urgent above high', () => {
    expect(isHigherPriority('urgent', 'high')).toBe(true);
    expect(isHigherPriority('low', 'normal')).toBe(false);
  });

  it('shouldBypassCoalescing only for urgent', () => {
    expect(shouldBypassCoalescing('urgent')).toBe(true);
    expect(shouldBypassCoalescing('high')).toBe(false);
  });

  it('buildCoalescedToastCopy pluralizes burst titles', () => {
    const single = buildCoalescedToastCopy(1, {
      title: 'New lab result',
      message: 'CBC ready',
      notification_type: 'lab_result',
    });
    expect(single.title).toBe('New lab result');
    expect(single.description).toBe('CBC ready');

    const burst = buildCoalescedToastCopy(3, {
      title: 'Rx for Patient A',
      message: 'ignored for burst',
      notification_type: 'prescription',
    });
    expect(burst.title).toBe('3 new prescriptions');
    expect(burst.description).toBe('Rx for Patient A');
  });

  it('shouldPlayNotificationSound respects prefs, focus, and throttle', () => {
    const prefs = { soundEnabled: true, soundUrgentOnly: false };
    expect(shouldPlayNotificationSound('normal', prefs, true, 0)).toBe(false);
    expect(shouldPlayNotificationSound('low', prefs, false, 0)).toBe(false);
    expect(shouldPlayNotificationSound('normal', { ...prefs, soundEnabled: false }, false, 0)).toBe(
      false,
    );
    expect(
      shouldPlayNotificationSound('high', { soundEnabled: true, soundUrgentOnly: true }, false, 0),
    ).toBe(false);
    expect(shouldPlayNotificationSound('urgent', { soundEnabled: true, soundUrgentOnly: true }, false, 0)).toBe(
      true,
    );
    expect(shouldPlayNotificationSound('high', prefs, false, 0, 6000)).toBe(true);
    expect(shouldPlayNotificationSound('high', prefs, false, 0, 3000)).toBe(false);
  });

  it('toastDurationForPriority maps priorities', () => {
    expect(toastDurationForPriority('urgent')).toBe(Infinity);
    expect(toastDurationForPriority('high')).toBe(8000);
    expect(toastDurationForPriority('low')).toBe(3000);
    expect(toastDurationForPriority('normal')).toBe(4000);
  });

  it('tabIsFocused requires visible and focused document', () => {
    expect(tabIsFocused('visible', true)).toBe(true);
    expect(tabIsFocused('hidden', true)).toBe(false);
    expect(tabIsFocused('visible', false)).toBe(false);
  });
});
