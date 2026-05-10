"use client";

import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { MODAL_SIZES } from '@/components/ui/modal-sizes';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import {
  getNotificationPreferences,
  updateNotificationPreferences,
  type Notification,
  type NotificationPreferences,
} from '@/lib/notifications-storage';
import { logError } from '@/lib/client-logger';
import { useNotificationAlerter } from '@/hooks/use-notification-alerter';
import { toast } from 'sonner';

interface NotificationPreferencesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type EditablePrefs = Omit<NotificationPreferences, 'id' | 'user' | 'updated_at'>;

const DEFAULTS: EditablePrefs = {
  in_app_enabled: true,
  email_enabled: false,
  sms_enabled: false,
  lab_results_enabled: true,
  radiology_results_enabled: true,
  prescriptions_enabled: true,
  appointments_enabled: true,
  system_alerts_enabled: true,
  low_priority_enabled: true,
  normal_priority_enabled: true,
  high_priority_enabled: true,
  urgent_priority_enabled: true,
  quiet_hours_enabled: false,
  quiet_hours_start: '22:00',
  quiet_hours_end: '07:00',
  desktop_alerts_enabled: true,
  sound_enabled: true,
  sound_urgent_only: false,
  auto_archive_days: 30,
};

export const NotificationPreferencesDialog = ({
  open,
  onOpenChange,
}: NotificationPreferencesDialogProps) => {
  const [prefs, setPrefs] = useState<EditablePrefs>(DEFAULTS);
  const [prefsId, setPrefsId] = useState<number | string | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { trigger: triggerAlert } = useNotificationAlerter();

  const fireTest = (priority: Notification['priority']) => {
    // Tests use a unique ``actionUrl`` per click so the coalescer
    // doesn't merge them — operators want to *hear* each test.
    const now = Date.now();
    const fake: Notification = {
      id: `test-${now}`,
      title: `Test alert (${priority})`,
      message:
        priority === 'urgent'
          ? 'This is what a STAT / critical alert will look and sound like.'
          : priority === 'high'
          ? 'This is what a high-priority notification looks like.'
          : priority === 'normal'
          ? 'This is the default in-app alert.'
          : 'This is a low-priority (silent) notification.',
      notification_type: 'alert',
      priority,
      status: 'unread',
      createdAt: new Date().toISOString(),
      actionUrl: `/notifications#test-${now}`,
    };
    // Pass the *current dialog state* as an inline override so tests
    // reflect toggles flipped in this session, even before Save.
    triggerAlert(fake, undefined, {
      desktopAlertsEnabled: prefs.desktop_alerts_enabled,
      soundEnabled: prefs.sound_enabled,
      soundUrgentOnly: prefs.sound_urgent_only,
    });
  };

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const remote = await getNotificationPreferences();
        if (cancelled) return;
        if (remote) {
          setPrefsId(remote.id);
          setPrefs({
            in_app_enabled: remote.in_app_enabled ?? true,
            email_enabled: remote.email_enabled ?? false,
            sms_enabled: remote.sms_enabled ?? false,
            lab_results_enabled: remote.lab_results_enabled ?? true,
            radiology_results_enabled: remote.radiology_results_enabled ?? true,
            prescriptions_enabled: remote.prescriptions_enabled ?? true,
            appointments_enabled: remote.appointments_enabled ?? true,
            system_alerts_enabled: remote.system_alerts_enabled ?? true,
            low_priority_enabled: remote.low_priority_enabled ?? true,
            normal_priority_enabled: remote.normal_priority_enabled ?? true,
            high_priority_enabled: remote.high_priority_enabled ?? true,
            urgent_priority_enabled: remote.urgent_priority_enabled ?? true,
            quiet_hours_enabled: remote.quiet_hours_enabled ?? false,
            quiet_hours_start: remote.quiet_hours_start ?? '22:00',
            quiet_hours_end: remote.quiet_hours_end ?? '07:00',
            desktop_alerts_enabled: remote.desktop_alerts_enabled ?? true,
            sound_enabled: remote.sound_enabled ?? true,
            sound_urgent_only: remote.sound_urgent_only ?? false,
            auto_archive_days: remote.auto_archive_days ?? 30,
          });
        }
      } catch (error) {
        logError('Failed to load preferences', error);
        toast.error('Failed to load preferences');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  const set = <K extends keyof EditablePrefs>(key: K, value: EditablePrefs[K]) => {
    setPrefs((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      await updateNotificationPreferences({ ...prefs, id: prefsId });
      toast.success('Preferences saved');
      onOpenChange(false);
    } catch (error) {
      logError('Failed to save preferences', error);
      toast.error('Failed to save preferences');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <div className="p-8 text-center">Loading preferences...</div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={MODAL_SIZES.lg}>
        <DialogHeader>
          <DialogTitle>Notification preferences</DialogTitle>
          <DialogDescription>
            Choose how, when, and which notifications reach you. Saved per-user.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4 max-h-[60vh] overflow-y-auto pr-1">
          {/* Pop-up alerts */}
          <section className="space-y-3">
            <h3 className="font-semibold text-sm">Pop-up alerts &amp; sound</h3>
            <p className="text-xs text-muted-foreground">
              Toasts appear when a notification arrives. A soft chime plays when
              you&apos;re away from this tab so you don&apos;t miss anything.
            </p>
            <Row
              id="desktop_alerts_enabled"
              label="Show pop-up toasts"
              hint="Bursts of the same kind are grouped into one toast."
              checked={prefs.desktop_alerts_enabled}
              onChange={(v) => set('desktop_alerts_enabled', v)}
            />
            <Row
              id="sound_enabled"
              label="Play a chime"
              hint="Only when the tab isn't focused. Throttled to once every 5 seconds."
              checked={prefs.sound_enabled}
              onChange={(v) => set('sound_enabled', v)}
            />
            <Row
              id="sound_urgent_only"
              label="Sound only for urgent"
              hint="Stay silent for normal & high; chime only when something is critical."
              checked={prefs.sound_urgent_only}
              onChange={(v) => set('sound_urgent_only', v)}
            />

            <div className="pt-2 space-y-2">
              <Label className="text-xs">Preview alert</Label>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => fireTest('urgent')}
                >
                  Urgent
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs border-amber-500 text-amber-700 dark:text-amber-300"
                  onClick={() => fireTest('high')}
                >
                  High
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => fireTest('normal')}
                >
                  Normal
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => fireTest('low')}
                >
                  Low (silent)
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Tests use your current toggles above (even before saving).
                Chime only plays when this tab is not focused — switch tabs
                briefly to hear it.
              </p>
            </div>
          </section>

          <Separator />

          {/* Channels */}
          <section className="space-y-3">
            <h3 className="font-semibold text-sm">Delivery channels</h3>
            <div className="space-y-2">
              <Row
                id="in_app_enabled"
                label="In-app notifications"
                hint="Bell badge and dropdown."
                checked={prefs.in_app_enabled}
                onChange={(v) => set('in_app_enabled', v)}
              />
              <Row
                id="email_enabled"
                label="Email notifications"
                hint="Send a copy to your registered email."
                checked={prefs.email_enabled}
                onChange={(v) => set('email_enabled', v)}
              />
              <Row
                id="sms_enabled"
                label="SMS notifications"
                hint="Carrier rates apply."
                checked={prefs.sms_enabled}
                onChange={(v) => set('sms_enabled', v)}
              />
            </div>
          </section>

          <Separator />

          {/* Module filters */}
          <section className="space-y-3">
            <h3 className="font-semibold text-sm">Which categories?</h3>
            <p className="text-xs text-muted-foreground">
              Turn off categories you don&apos;t need. Affects both channels above.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <Row
                id="lab_results_enabled"
                label="Lab results"
                checked={prefs.lab_results_enabled}
                onChange={(v) => set('lab_results_enabled', v)}
              />
              <Row
                id="radiology_results_enabled"
                label="Radiology results"
                checked={prefs.radiology_results_enabled}
                onChange={(v) => set('radiology_results_enabled', v)}
              />
              <Row
                id="prescriptions_enabled"
                label="Prescriptions"
                checked={prefs.prescriptions_enabled}
                onChange={(v) => set('prescriptions_enabled', v)}
              />
              <Row
                id="appointments_enabled"
                label="Appointments"
                checked={prefs.appointments_enabled}
                onChange={(v) => set('appointments_enabled', v)}
              />
              <Row
                id="system_alerts_enabled"
                label="System alerts"
                checked={prefs.system_alerts_enabled}
                onChange={(v) => set('system_alerts_enabled', v)}
              />
            </div>
          </section>

          <Separator />

          {/* Priority filters */}
          <section className="space-y-3">
            <h3 className="font-semibold text-sm">Priority filters</h3>
            <p className="text-xs text-muted-foreground">
              Quickly silence noise. Urgent stays on by default.
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <Row
                id="low_priority_enabled"
                label="Low"
                checked={prefs.low_priority_enabled}
                onChange={(v) => set('low_priority_enabled', v)}
                compact
              />
              <Row
                id="normal_priority_enabled"
                label="Normal"
                checked={prefs.normal_priority_enabled}
                onChange={(v) => set('normal_priority_enabled', v)}
                compact
              />
              <Row
                id="high_priority_enabled"
                label="High"
                checked={prefs.high_priority_enabled}
                onChange={(v) => set('high_priority_enabled', v)}
                compact
              />
              <Row
                id="urgent_priority_enabled"
                label="Urgent"
                checked={prefs.urgent_priority_enabled}
                onChange={(v) => set('urgent_priority_enabled', v)}
                compact
              />
            </div>
          </section>

          <Separator />

          {/* Quiet hours */}
          <section className="space-y-3">
            <h3 className="font-semibold text-sm">Quiet hours</h3>
            <Row
              id="quiet_hours_enabled"
              label="Mute non-urgent notifications overnight"
              checked={prefs.quiet_hours_enabled}
              onChange={(v) => set('quiet_hours_enabled', v)}
            />
            {prefs.quiet_hours_enabled && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="quiet-start" className="text-xs">Start</Label>
                  <Input
                    id="quiet-start"
                    type="time"
                    value={prefs.quiet_hours_start || '22:00'}
                    onChange={(e) => set('quiet_hours_start', e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="quiet-end" className="text-xs">End</Label>
                  <Input
                    id="quiet-end"
                    type="time"
                    value={prefs.quiet_hours_end || '07:00'}
                    onChange={(e) => set('quiet_hours_end', e.target.value)}
                  />
                </div>
              </div>
            )}
          </section>

          <Separator />

          {/* Auto-archive */}
          <section className="space-y-3">
            <h3 className="font-semibold text-sm">Auto-archive</h3>
            <p className="text-xs text-muted-foreground">
              Read notifications older than this are auto-archived so the
              inbox stays manageable. Archived items aren&apos;t deleted —
              they just stop showing in the list. Set to 0 to disable.
            </p>
            <div className="flex items-center gap-3">
              <Input
                id="auto_archive_days"
                type="number"
                min={0}
                max={365}
                step={1}
                value={prefs.auto_archive_days}
                onChange={(e) =>
                  set(
                    'auto_archive_days',
                    Math.max(0, Math.min(365, Number(e.target.value) || 0)),
                  )
                }
                className="w-24"
              />
              <span className="text-sm text-muted-foreground">days</span>
              {prefs.auto_archive_days === 0 && (
                <span className="text-xs text-amber-600 dark:text-amber-400">
                  Disabled — inbox will keep growing.
                </span>
              )}
            </div>
          </section>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save preferences'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

interface RowProps {
  id: string;
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  compact?: boolean;
}

const Row = ({ id, label, hint, checked, onChange, compact }: RowProps) => (
  <div className={`flex items-center justify-between gap-3 ${compact ? '' : 'py-1'}`}>
    <div className="min-w-0">
      <Label htmlFor={id} className="text-sm">{label}</Label>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
    <Switch id={id} checked={checked} onCheckedChange={onChange} />
  </div>
);
