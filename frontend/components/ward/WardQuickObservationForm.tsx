'use client';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Bell, Loader2, Thermometer } from 'lucide-react';
import type { PatientAdmission } from '@/lib/services/ward-service';
import { VitalsEntryFields } from '@/components/nursing/VitalsEntryFields';
import {
  emptyVitalsEntry,
  hasAnyVitalsEntry,
  type VitalsEntryFormData,
} from '@/lib/vitals-entry-form';

export const WARD_CONDITION_PRESETS = [
  { value: 'Stable', label: 'Stable' },
  { value: 'Improving', label: 'Improving' },
  { value: 'Guarded', label: 'Guarded' },
  { value: 'Deteriorating', label: 'Deteriorating' },
  { value: 'Critical', label: 'Critical' },
  { value: 'Needs Doctor Review', label: '⚠️ Needs Doctor Review' },
] as const;

export type WardObservationFormData = {
  current_condition: string;
  vitals: VitalsEntryFormData;
  /** Short note saved on the vitals row only (not handover log). */
  vitals_notes: string;
  escalate: boolean;
};

export const emptyWardObservationForm = (): WardObservationFormData => ({
  current_condition: '',
  vitals: emptyVitalsEntry(),
  vitals_notes: '',
  escalate: false,
});

type Props = {
  admission: PatientAdmission;
  value: WardObservationFormData;
  onChange: (next: WardObservationFormData) => void;
  onSubmit: () => void;
  isSaving: boolean;
};

export function WardQuickObservationForm({ admission, value, onChange, onSubmit, isSaving }: Props) {
  const hasVitals = hasAnyVitalsEntry(value.vitals);
  const hasContent =
    !!value.current_condition ||
    !!value.vitals_notes.trim() ||
    value.escalate ||
    hasVitals;

  const showLastCondition =
    admission.current_condition &&
    !value.current_condition &&
    !value.escalate;

  const saveButton = (
    <Button
      type="submit"
      size="sm"
      disabled={isSaving || !hasContent}
      className={value.escalate ? 'bg-orange-600 hover:bg-orange-700 shrink-0' : 'shrink-0'}
    >
      {isSaving ? (
        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
      ) : value.escalate ? (
        <Bell className="h-4 w-4 mr-2" />
      ) : (
        <Thermometer className="h-4 w-4 mr-2" />
      )}
      {value.escalate ? 'Escalate & save' : 'Save'}
    </Button>
  );

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!hasContent || isSaving) return;
        onSubmit();
      }}
      className="rounded-lg border border-border/80 bg-card p-4 space-y-3"
    >
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-medium flex items-center gap-1.5 min-w-0">
          <Thermometer className="h-4 w-4 text-teal-500 shrink-0" />
          Record observation
        </h3>
        {saveButton}
      </div>

      <div className="space-y-2">
        <div className="space-y-1.5">
          <div className="flex items-baseline justify-between gap-2">
            <Label className="text-xs text-muted-foreground">Condition</Label>
            {showLastCondition && (
              <span className="text-[11px] text-muted-foreground truncate">
                Last: <span className="font-medium text-foreground">{admission.current_condition}</span>
              </span>
            )}
          </div>
          <Select
            value={value.current_condition || undefined}
            onValueChange={(v) => onChange({
              ...value,
              current_condition: v,
              escalate: v === 'Needs Doctor Review',
            })}
          >
            <SelectTrigger className="h-9">
              <SelectValue placeholder={admission.current_condition ? `Update (was ${admission.current_condition})` : 'Select condition'} />
            </SelectTrigger>
            <SelectContent>
              {WARD_CONDITION_PRESETS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div
          className={`flex items-start gap-3 rounded-md border px-3 py-2.5 ${
            value.escalate
              ? 'bg-orange-50 dark:bg-orange-950/30 border-orange-300 dark:border-orange-700'
              : 'bg-muted/30 border-border'
          }`}
        >
          <Checkbox
            id={`escalate-${admission.id}`}
            className="mt-0.5"
            checked={value.escalate}
            onCheckedChange={(checked) => onChange({
              ...value,
              escalate: !!checked,
              current_condition: checked
                ? 'Needs Doctor Review'
                : value.current_condition === 'Needs Doctor Review' ? '' : value.current_condition,
            })}
          />
          <div className="min-w-0 space-y-0.5">
            <Label htmlFor={`escalate-${admission.id}`} className="text-sm font-medium cursor-pointer leading-none">
              {value.escalate ? '⚠️ Escalate to doctor' : 'Escalate to doctor'}
            </Label>
            <p className="text-[11px] text-muted-foreground leading-snug">
              Flags this patient on Ward Rounds for urgent review.
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-md border border-border/70 bg-muted/10 p-3 space-y-3">
        <Label className="text-xs text-muted-foreground">Vitals</Label>
        <VitalsEntryFields
          value={value.vitals}
          onChange={(vitals) => onChange({ ...value, vitals })}
          compact
        />
        <div className="space-y-1.5 pt-1 border-t border-border/60">
          <div className="flex items-baseline justify-between gap-2">
            <Label className="text-xs text-muted-foreground">Vitals note</Label>
            <span className="text-[10px] text-muted-foreground">
              {hasVitals ? 'Saved on this reading' : 'Enter vitals first'}
            </span>
          </div>
          <Textarea
            value={value.vitals_notes}
            onChange={(e) => onChange({ ...value, vitals_notes: e.target.value })}
            placeholder="Optional note for this vitals reading (complaints, response, etc.)…"
            rows={2}
            className="min-h-[3.5rem] resize-y bg-background"
            disabled={!hasVitals}
          />
        </div>
      </div>
    </form>
  );
}
