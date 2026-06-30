'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Activity, Droplets, Heart, Thermometer, Wind } from 'lucide-react';
import type { VitalsEntryFormData } from '@/lib/vitals-entry-form';

type WarnKind = 'low' | 'high' | null;

type Props = {
  value: VitalsEntryFormData;
  onChange: (next: VitalsEntryFormData) => void;
  /** Pool queue marks temp + pulse required; ward observations keep all optional. */
  requireCore?: boolean;
  /** Ward form: single dense row, no wasted grid cells. */
  compact?: boolean;
};

const warnClass = (kind: WarnKind) =>
  kind === 'low'
    ? 'border-blue-300 dark:border-blue-700'
    : kind === 'high'
      ? 'border-orange-300 dark:border-orange-700'
      : '';

export function VitalsEntryFields({ value, onChange, requireCore = false, compact = false }: Props) {
  const tempVal = parseFloat(value.temperature);
  const tempWarn: WarnKind = Number.isFinite(tempVal)
    ? tempVal < 36 ? 'low' : tempVal > 37.5 ? 'high' : null
    : null;
  const pulseInt = parseInt(value.pulse, 10);
  const pulseWarn: WarnKind = Number.isFinite(pulseInt)
    ? pulseInt < 60 ? 'low' : pulseInt > 100 ? 'high' : null
    : null;
  const spo2Val = parseFloat(value.oxygenSaturation);
  const spo2Warn: WarnKind = Number.isFinite(spo2Val) && spo2Val < 94 ? 'low' : null;
  const sys = parseInt(value.bloodPressureSystolic, 10);
  const dia = parseInt(value.bloodPressureDiastolic, 10);
  const bpWarn: WarnKind =
    Number.isFinite(sys) && Number.isFinite(dia)
      ? sys < 90 || dia < 60
        ? 'low'
        : sys > 140 || dia > 90
          ? 'high'
          : null
      : null;

  const patch = (p: Partial<VitalsEntryFormData>) => onChange({ ...value, ...p });

  const tempField = (
    <div className="space-y-1.5 min-w-0">
      <Label className="text-xs flex items-center gap-1 truncate">
        <Thermometer className="h-3 w-3 shrink-0" />
        Temp (°C)
        {requireCore && <span className="text-rose-500">*</span>}
      </Label>
      <Input
        type="number"
        step="0.1"
        placeholder="36.5"
        value={value.temperature}
        onChange={(e) => patch({ temperature: e.target.value })}
        className={warnClass(tempWarn)}
        required={requireCore}
      />
    </div>
  );

  const pulseField = (
    <div className="space-y-1.5 min-w-0">
      <Label className="text-xs flex items-center gap-1 truncate">
        <Heart className="h-3 w-3 shrink-0" />
        Pulse
        {requireCore && <span className="text-rose-500">*</span>}
      </Label>
      <Input
        type="number"
        placeholder="72"
        value={value.pulse}
        onChange={(e) => patch({ pulse: e.target.value })}
        className={warnClass(pulseWarn)}
        required={requireCore}
      />
    </div>
  );

  const rrField = (
    <div className="space-y-1.5 min-w-0">
      <Label className="text-xs flex items-center gap-1 truncate">
        <Wind className="h-3 w-3 shrink-0" />
        RR (/min)
      </Label>
      <Input
        type="number"
        placeholder="16"
        value={value.respiratoryRate}
        onChange={(e) => patch({ respiratoryRate: e.target.value })}
      />
    </div>
  );

  const bpField = (
    <div className="space-y-1.5 min-w-0">
      <Label className="text-xs flex items-center gap-1 truncate">
        <Activity className="h-3 w-3 shrink-0" />
        BP (mmHg)
      </Label>
      <div className="flex items-center gap-1">
        <Input
          type="number"
          placeholder="120"
          value={value.bloodPressureSystolic}
          onChange={(e) => patch({ bloodPressureSystolic: e.target.value })}
          className={`min-w-[3.75rem] flex-1 px-2 ${warnClass(bpWarn)}`}
        />
        <span className="text-muted-foreground text-xs shrink-0">/</span>
        <Input
          type="number"
          placeholder="80"
          value={value.bloodPressureDiastolic}
          onChange={(e) => patch({ bloodPressureDiastolic: e.target.value })}
          className={`min-w-[3.75rem] flex-1 px-2 ${warnClass(bpWarn)}`}
        />
      </div>
    </div>
  );

  const spo2Field = (
    <div className="space-y-1.5 min-w-0">
      <Label className="text-xs flex items-center gap-1 truncate">
        <Droplets className="h-3 w-3 shrink-0" />
        SpO2 (%)
      </Label>
      <Input
        type="number"
        placeholder="98"
        value={value.oxygenSaturation}
        onChange={(e) => patch({ oxygenSaturation: e.target.value })}
        className={warnClass(spo2Warn)}
      />
    </div>
  );

  if (compact) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-12 gap-3 items-end">
        <div className="min-w-0 md:col-span-2">{tempField}</div>
        <div className="min-w-0 md:col-span-2">{pulseField}</div>
        <div className="min-w-0 md:col-span-2">{rrField}</div>
        <div className="min-w-0 md:col-span-2">{spo2Field}</div>
        <div className="col-span-2 md:col-span-4 min-w-0">{bpField}</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {tempField}
        {pulseField}
        {rrField}
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs flex items-center gap-1">
          <Activity className="h-3 w-3" />
          Blood pressure (mmHg)
        </Label>
        <div className="flex items-center gap-2">
          <Input
            type="number"
            placeholder="120"
            value={value.bloodPressureSystolic}
            onChange={(e) => patch({ bloodPressureSystolic: e.target.value })}
            className={`w-24 ${warnClass(bpWarn)}`}
          />
          <span className="text-muted-foreground">/</span>
          <Input
            type="number"
            placeholder="80"
            value={value.bloodPressureDiastolic}
            onChange={(e) => patch({ bloodPressureDiastolic: e.target.value })}
            className={`w-24 ${warnClass(bpWarn)}`}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {spo2Field}
      </div>
    </div>
  );
}
