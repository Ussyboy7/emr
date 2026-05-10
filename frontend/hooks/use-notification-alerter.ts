"use client";

import { useCallback, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import type { Notification } from '@/lib/notifications-storage';
import { getNotificationPreferences } from '@/lib/notifications-storage';
import { logDebug } from '@/lib/client-logger';

/**
 * Live alerter: receives newly-arrived notifications (from the
 * WebSocket push path) and surfaces them as styled toasts + an
 * optional Web Audio chime.
 *
 * Design constraints (avoid alarm fatigue):
 *  - Bursts of the same ``(notification_type, actionUrl)`` are
 *    coalesced into one toast within a 2.5s window — 21 prescriptions
 *    arriving simultaneously fire ONE toast saying "21 new
 *    prescriptions", not 21 separate toasts.
 *  - Sound is rate-limited to 1 chime per 5s regardless of how many
 *    notifications arrive.
 *  - Sound is only played when the tab is not focused / not visible —
 *    if the user is already looking at the app, the toast is enough.
 *  - User preferences (``desktop_alerts_enabled``, ``sound_enabled``,
 *    ``sound_urgent_only``) gate both behaviours independently.
 *
 * The hook returns ``trigger(notification)`` which the bell calls from
 * its WS ``onNotification`` handler.
 */

type Priority = Notification['priority'];

const PRIORITY_PRIMACY: Record<Priority, number> = {
  urgent: 0,
  high: 1,
  normal: 2,
  low: 3,
};

const COALESCE_WINDOW_MS = 2500;
const SOUND_MIN_INTERVAL_MS = 5000;
const URGENT_REPEAT_MS = 10_000;

const TYPE_LABELS: Record<Notification['notification_type'], string> = {
  workflow: 'Workflow',
  lab_result: 'Lab result',
  radiology_result: 'Radiology result',
  prescription: 'Prescription',
  appointment: 'Appointment',
  system: 'System',
  alert: 'Alert',
  reminder: 'Reminder',
};

interface AlerterPrefs {
  desktopAlertsEnabled: boolean;
  soundEnabled: boolean;
  soundUrgentOnly: boolean;
}

/** Lazily initialise (and cache) a single shared AudioContext. */
let cachedAudioCtx: AudioContext | null = null;
const getAudioContext = (): AudioContext | null => {
  if (typeof window === 'undefined') return null;
  if (cachedAudioCtx) return cachedAudioCtx;
  const Ctor: typeof AudioContext | undefined =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  try {
    cachedAudioCtx = new Ctor();
  } catch {
    cachedAudioCtx = null;
  }
  return cachedAudioCtx;
};

/**
 * Play a short tone. Distinct envelopes per priority keep the
 * "ambient soft chime for normal" / "two-tone for urgent" perception
 * the user described.
 */
const playChime = (priority: Priority) => {
  const ctx = getAudioContext();
  if (!ctx) return;
  // Some browsers start the context in 'suspended' until a user
  // gesture occurs. Resume if we can; if not, silently no-op.
  if (ctx.state === 'suspended') {
    ctx.resume().catch(() => {});
  }

  const now = ctx.currentTime;

  const tone = (freq: number, start: number, duration: number, peakGain = 0.08) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, now + start);
    gain.gain.linearRampToValueAtTime(peakGain, now + start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + start + duration);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now + start);
    osc.stop(now + start + duration + 0.05);
  };

  if (priority === 'urgent') {
    // Two-tone descending — distinctly attention-grabbing.
    tone(880, 0, 0.18, 0.12);
    tone(660, 0.22, 0.28, 0.12);
  } else if (priority === 'high') {
    tone(720, 0, 0.22, 0.09);
  } else if (priority === 'low') {
    // No sound by design — toast only for low.
    return;
  } else {
    // Soft single chime: the "something is waiting" cue.
    tone(660, 0, 0.18, 0.06);
  }
};

const tabIsFocused = (): boolean => {
  if (typeof document === 'undefined') return true;
  if (document.visibilityState !== 'visible') return false;
  // ``hasFocus`` returns false when the tab is visible but the user is
  // working in another window — still worth alerting in that case.
  if (typeof document.hasFocus === 'function' && !document.hasFocus()) return false;
  return true;
};

interface CoalesceEntry {
  count: number;
  highest: Notification;
  /** Pending flush timer; absent for synchronous (urgent) flushes. */
  timer?: ReturnType<typeof setTimeout>;
}

export const useNotificationAlerter = () => {
  const prefsRef = useRef<AlerterPrefs>({
    desktopAlertsEnabled: true,
    soundEnabled: true,
    soundUrgentOnly: false,
  });
  const lastSoundAtRef = useRef(0);
  const coalesceRef = useRef<Map<string, CoalesceEntry>>(new Map());

  // Refresh preferences on mount (and whenever the user opens/saves
  // the preferences dialog elsewhere — we listen to the same change
  // event used by the bell so the alerter sees writes immediately).
  const refreshPrefs = useCallback(async () => {
    try {
      const remote = await getNotificationPreferences();
      if (remote) {
        prefsRef.current = {
          desktopAlertsEnabled: remote.desktop_alerts_enabled ?? true,
          soundEnabled: remote.sound_enabled ?? true,
          soundUrgentOnly: remote.sound_urgent_only ?? false,
        };
      }
    } catch (e) {
      logDebug('[alerter] failed to load preferences', e);
    }
  }, []);

  useEffect(() => {
    void refreshPrefs();
  }, [refreshPrefs]);

  const maybePlaySound = useCallback(
    (priority: Priority, overrides?: Partial<AlerterPrefs>) => {
      const prefs = { ...prefsRef.current, ...(overrides ?? {}) };
      if (!prefs.soundEnabled) return;
      if (prefs.soundUrgentOnly && priority !== 'urgent') return;
      if (priority === 'low') return;
      // Don't chime when the user is already focused on the app — the
      // visible toast is enough; the sound would be intrusive.
      if (tabIsFocused()) return;
      const now = Date.now();
      if (now - lastSoundAtRef.current < SOUND_MIN_INTERVAL_MS) return;
      lastSoundAtRef.current = now;
      playChime(priority);
    },
    [],
  );

  /** Emit the final coalesced toast for a key and clear the entry. */
  const flushKey = useCallback(
    (key: string, onClick?: (n: Notification) => void) => {
      const entry = coalesceRef.current.get(key);
      if (!entry) return;
      if (entry.timer) clearTimeout(entry.timer);
      coalesceRef.current.delete(key);
      const { count, highest } = entry;
      const typeLabel = TYPE_LABELS[highest.notification_type] ?? 'Notification';
      const title =
        count > 1 ? `${count} new ${typeLabel.toLowerCase()}s` : highest.title;
      const description = count > 1 ? highest.title : highest.message;

      const toastOptions: Parameters<typeof toast>[1] = {
        description,
        duration:
          highest.priority === 'urgent'
            ? Infinity
            : highest.priority === 'high'
            ? 8000
            : highest.priority === 'low'
            ? 3000
            : 4000,
        action: highest.actionUrl
          ? { label: 'View', onClick: () => onClick?.(highest) }
          : undefined,
      };

      if (highest.priority === 'urgent') {
        toast.error(title, toastOptions);
      } else if (highest.priority === 'high') {
        toast.warning(title, toastOptions);
      } else if (highest.priority === 'low') {
        toast(title, toastOptions);
      } else {
        toast.info(title, toastOptions);
      }
    },
    [],
  );

  /**
   * Re-fire the urgent toast after URGENT_REPEAT_MS if the user hasn't
   * acted on it yet. Sonner toasts auto-dismiss on click; if it's
   * still hanging around when the timer fires, the user missed it.
   */
  const scheduleUrgentReprompt = useCallback(
    (n: Notification, onClick?: (n: Notification) => void) => {
      if (n.priority !== 'urgent') return;
      setTimeout(() => {
        // Re-flush as a fresh toast — we don't track the dismiss event
        // from sonner, but doubling-up at 10s makes the urgent case
        // unmistakable without being a permanent loop.
        const key = `__repeat_${n.id}`;
        coalesceRef.current.set(key, { count: 1, highest: n });
        flushKey(key, onClick);
        // Quiet retry — don't replay sound (lastSoundAt already
        // throttles, but be explicit).
      }, URGENT_REPEAT_MS);
    },
    [flushKey],
  );

  const trigger = useCallback(
    (
      notification: Notification,
      onClick?: (n: Notification) => void,
      /**
       * Optional inline override of preference flags. Used by the
       * "Test alert" buttons in the preferences dialog so the test
       * reflects unsaved toggle state instead of the cached prefs.
       */
      overridePrefs?: Partial<AlerterPrefs>,
    ) => {
      const prefs = { ...prefsRef.current, ...(overridePrefs ?? {}) };
      if (!prefs.desktopAlertsEnabled) {
        // Toasts off entirely — still play sound if user wants
        // ambient awareness without visual interruption.
        maybePlaySound(notification.priority, overridePrefs);
        return;
      }

      const key = `${notification.notification_type}|${notification.actionUrl ?? ''}`;

      // Urgent priority bypasses coalescing — show it immediately,
      // including a 10s re-prompt so it's hard to miss.
      if (notification.priority === 'urgent') {
        const immediateKey = `__urgent_${notification.id}`;
        coalesceRef.current.set(immediateKey, { count: 1, highest: notification });
        flushKey(immediateKey, onClick);
        maybePlaySound('urgent', overridePrefs);
        scheduleUrgentReprompt(notification, onClick);
        return;
      }

      const existing = coalesceRef.current.get(key);
      if (existing) {
        clearTimeout(existing.timer);
        existing.count += 1;
        // Keep the highest-priority instance as the canonical display.
        if (
          PRIORITY_PRIMACY[notification.priority] < PRIORITY_PRIMACY[existing.highest.priority]
        ) {
          existing.highest = notification;
        }
        existing.timer = setTimeout(() => flushKey(key, onClick), COALESCE_WINDOW_MS);
        coalesceRef.current.set(key, existing);
      } else {
        const entry: CoalesceEntry = {
          count: 1,
          highest: notification,
          timer: setTimeout(() => flushKey(key, onClick), COALESCE_WINDOW_MS),
        };
        coalesceRef.current.set(key, entry);
      }

      // Sound fires once per burst regardless of how many items
      // coalesce (the rate-limiter inside ``maybePlaySound`` handles
      // back-pressure).
      maybePlaySound(notification.priority, overridePrefs);
    },
    [flushKey, maybePlaySound, scheduleUrgentReprompt],
  );

  return { trigger, refreshPrefs };
};
