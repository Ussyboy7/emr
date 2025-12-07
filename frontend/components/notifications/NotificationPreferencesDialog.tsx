"use client";

import { logError } from '@/lib/client-logger';
import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import {
  getNotificationPreferences,
  updateNotificationPreferences,
  type NotificationPreferences,
} from '@/lib/notifications-storage';
import { toast } from 'sonner';

interface NotificationPreferencesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const NotificationPreferencesDialog = ({
  open,
  onOpenChange,
}: NotificationPreferencesDialogProps) => {
  const [preferences, setPreferences] = useState<NotificationPreferences | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      loadPreferences();
    }
  }, [open]);

  const loadPreferences = async () => {
    try {
      setLoading(true);
      const prefs = await getNotificationPreferences();
      if (prefs) {
        setPreferences(prefs);
      } else {
        // Create default preferences
        setPreferences({
          id: '',
          user: '',
          inAppEnabled: true,
          inAppUrgentOnly: false,
          emailEnabled: true,
          emailUrgentOnly: false,
          emailDigest: false,
          emailDigestTime: '09:00',
          moduleDms: true,
          moduleCorrespondence: true,
          moduleWorkflow: true,
          moduleSystem: true,
          priorityLow: true,
          priorityNormal: true,
          priorityHigh: true,
          priorityUrgent: true,
          typeWorkflow: true,
          typeDocument: true,
          typeCorrespondence: true,
          typeSystem: true,
          typeAlert: true,
          typeReminder: true,
          quietHoursEnabled: false,
          quietHoursStart: '22:00',
          quietHoursEnd: '07:00',
          autoArchiveDays: 30,
          createdAt: '',
          updatedAt: '',
        });
      }
    } catch (error) {
      logError('Failed to load preferences', error);
      toast.error('Failed to load preferences');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!preferences) return;

    try {
      setSaving(true);
      await updateNotificationPreferences(preferences);
      toast.success('Preferences saved');
      onOpenChange(false);
    } catch (error) {
      logError('Failed to save preferences', error);
      toast.error('Failed to save preferences');
    } finally {
      setSaving(false);
    }
  };

  const updatePreference = (key: keyof NotificationPreferences, value: any) => {
    if (!preferences) return;
    setPreferences({ ...preferences, [key]: value });
  };

  if (loading || !preferences) {
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
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Notification Preferences</DialogTitle>
          <DialogDescription>
            Configure how and when you receive notifications
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* In-App Notifications */}
          <div className="space-y-4">
            <h3 className="font-semibold">In-App Notifications</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label htmlFor="in-app-enabled">Enable in-app notifications</Label>
                <Switch
                  id="in-app-enabled"
                  checked={preferences.inAppEnabled}
                  onCheckedChange={(checked) => updatePreference('inAppEnabled', checked)}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="in-app-urgent-only">Urgent notifications only</Label>
                <Switch
                  id="in-app-urgent-only"
                  checked={preferences.inAppUrgentOnly}
                  onCheckedChange={(checked) => updatePreference('inAppUrgentOnly', checked)}
                  disabled={!preferences.inAppEnabled}
                />
              </div>
            </div>
          </div>

          <Separator />

          {/* Email Notifications */}
          <div className="space-y-4">
            <h3 className="font-semibold">Email Notifications</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label htmlFor="email-enabled">Enable email notifications</Label>
                <Switch
                  id="email-enabled"
                  checked={preferences.emailEnabled}
                  onCheckedChange={(checked) => updatePreference('emailEnabled', checked)}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="email-urgent-only">Urgent emails only</Label>
                <Switch
                  id="email-urgent-only"
                  checked={preferences.emailUrgentOnly}
                  onCheckedChange={(checked) => updatePreference('emailUrgentOnly', checked)}
                  disabled={!preferences.emailEnabled}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="email-digest">Daily email digest</Label>
                <Switch
                  id="email-digest"
                  checked={preferences.emailDigest}
                  onCheckedChange={(checked) => updatePreference('emailDigest', checked)}
                  disabled={!preferences.emailEnabled}
                />
              </div>
              {preferences.emailDigest && (
                <div className="space-y-2">
                  <Label htmlFor="digest-time">Digest time</Label>
                  <Input
                    id="digest-time"
                    type="time"
                    value={preferences.emailDigestTime || '09:00'}
                    onChange={(e) => updatePreference('emailDigestTime', e.target.value)}
                  />
                </div>
              )}
            </div>
          </div>

          <Separator />

          {/* Module Filters */}
          <div className="space-y-4">
            <h3 className="font-semibold">Module Filters</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex items-center justify-between">
                <Label htmlFor="module-dms">DMS</Label>
                <Switch
                  id="module-dms"
                  checked={preferences.moduleDms}
                  onCheckedChange={(checked) => updatePreference('moduleDms', checked)}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="module-correspondence">Correspondence</Label>
                <Switch
                  id="module-correspondence"
                  checked={preferences.moduleCorrespondence}
                  onCheckedChange={(checked) => updatePreference('moduleCorrespondence', checked)}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="module-workflow">Workflow</Label>
                <Switch
                  id="module-workflow"
                  checked={preferences.moduleWorkflow}
                  onCheckedChange={(checked) => updatePreference('moduleWorkflow', checked)}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="module-system">System</Label>
                <Switch
                  id="module-system"
                  checked={preferences.moduleSystem}
                  onCheckedChange={(checked) => updatePreference('moduleSystem', checked)}
                />
              </div>
            </div>
          </div>

          <Separator />

          {/* Priority Filters */}
          <div className="space-y-4">
            <h3 className="font-semibold">Priority Filters</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex items-center justify-between">
                <Label htmlFor="priority-low">Low</Label>
                <Switch
                  id="priority-low"
                  checked={preferences.priorityLow}
                  onCheckedChange={(checked) => updatePreference('priorityLow', checked)}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="priority-normal">Normal</Label>
                <Switch
                  id="priority-normal"
                  checked={preferences.priorityNormal}
                  onCheckedChange={(checked) => updatePreference('priorityNormal', checked)}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="priority-high">High</Label>
                <Switch
                  id="priority-high"
                  checked={preferences.priorityHigh}
                  onCheckedChange={(checked) => updatePreference('priorityHigh', checked)}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="priority-urgent">Urgent</Label>
                <Switch
                  id="priority-urgent"
                  checked={preferences.priorityUrgent}
                  onCheckedChange={(checked) => updatePreference('priorityUrgent', checked)}
                />
              </div>
            </div>
          </div>

          <Separator />

          {/* Quiet Hours */}
          <div className="space-y-4">
            <h3 className="font-semibold">Quiet Hours</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label htmlFor="quiet-hours-enabled">Enable quiet hours</Label>
                <Switch
                  id="quiet-hours-enabled"
                  checked={preferences.quietHoursEnabled}
                  onCheckedChange={(checked) => updatePreference('quietHoursEnabled', checked)}
                />
              </div>
              {preferences.quietHoursEnabled && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="quiet-start">Start time</Label>
                    <Input
                      id="quiet-start"
                      type="time"
                      value={preferences.quietHoursStart || '22:00'}
                      onChange={(e) => updatePreference('quietHoursStart', e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="quiet-end">End time</Label>
                    <Input
                      id="quiet-end"
                      type="time"
                      value={preferences.quietHoursEnd || '07:00'}
                      onChange={(e) => updatePreference('quietHoursEnd', e.target.value)}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save Preferences'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
