'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  type GenericMedicationLike,
  formatGenericMedicationLabel,
  MEDICATION_FREQUENCY_OPTIONS,
} from '@/lib/pharmacy/generic-medication';
import { X } from 'lucide-react';

export type MedicationSelectionConfig = {
  dose: string;
  doseUnit: string;
  frequency: string;
  durationDays: number | '';
  route: string;
  instructions: string;
};

type Props = {
  selectedIds: string[];
  getMedication: (id: string) => GenericMedicationLike | undefined;
  configs: Map<string, MedicationSelectionConfig>;
  onUpdateConfig: (id: string, patch: Partial<MedicationSelectionConfig>) => void;
  onRemove: (id: string) => void;
  doseUnitOptions: readonly string[];
  routeOptions: readonly string[];
};

export function MedicationSelectionConfigList({
  selectedIds,
  getMedication,
  configs,
  onUpdateConfig,
  onRemove,
  doseUnitOptions,
  routeOptions,
}: Props) {
  if (selectedIds.length === 0) return null;

  return (
    <div className="space-y-4 border-t pt-4 mt-4">
      <div className="flex items-center justify-between">
        <div>
          <Label className="text-sm font-semibold">Configure Prescriptions</Label>
          <p className="text-xs text-muted-foreground mt-1">
            Set dose, frequency, duration, route, and instructions for each selected medication
          </p>
        </div>
        <Badge variant="outline" className="text-xs">
          {selectedIds.length} medication{selectedIds.length > 1 ? 's' : ''} selected
        </Badge>
      </div>

      <div className="space-y-3">
        {selectedIds.map((id) => {
          const med = getMedication(id);
          const cfg = configs.get(id);
          if (!cfg) return null;
          const label = med ? formatGenericMedicationLabel(med) : 'Medication';
          const subline = med?.active_ingredient || '';

          return (
            <div key={id} className="rounded-lg border border-l-4 border-l-cyan-500 p-4">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="font-medium text-sm">{label}</div>
                  {subline ? <div className="text-xs text-muted-foreground">{subline}</div> : null}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onRemove(id)}
                  className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>

              <div className="space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                  <div className="space-y-1 md:col-span-4">
                    <Label className="text-xs">Dose per administration</Label>
                    <Input
                      type="text"
                      inputMode="decimal"
                      min={0.1}
                      step={0.1}
                      placeholder="e.g., 1, 5"
                      className="h-8 text-xs"
                      value={cfg.dose}
                      onChange={(e) => onUpdateConfig(id, { dose: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1 md:col-span-3">
                    <Label className="text-xs">Dose unit <span className="text-red-500">*</span></Label>
                    <Select value={cfg.doseUnit} onValueChange={(v) => onUpdateConfig(id, { doseUnit: v })}>
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {doseUnitOptions.map((u) => (
                          <SelectItem key={u} value={u}>
                            {u}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1 md:col-span-5">
                    <Label className="text-xs">Frequency <span className="text-red-500">*</span></Label>
                    <Select value={cfg.frequency} onValueChange={(v) => onUpdateConfig(id, { frequency: v })}>
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {MEDICATION_FREQUENCY_OPTIONS.map((f) => (
                          <SelectItem key={f} value={f}>
                            {f}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Duration (days)</Label>
                    <Input
                      type="number"
                      min={1}
                      placeholder="e.g., 7"
                      className="h-8 text-xs"
                      value={cfg.durationDays === '' ? '' : String(cfg.durationDays)}
                      onChange={(e) => {
                        const value = e.target.value;
                        onUpdateConfig(id, {
                          durationDays: value === '' ? '' : parseInt(value, 10) || '',
                        });
                      }}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Route</Label>
                    <Select value={cfg.route} onValueChange={(v) => onUpdateConfig(id, { route: v })}>
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {routeOptions.map((r) => (
                          <SelectItem key={r} value={r}>
                            {r}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Instructions</Label>
                  <Textarea
                    placeholder="e.g., Administer slowly; monitor for adverse reactions"
                    className="min-h-[72px] text-xs resize-y"
                    value={cfg.instructions}
                    onChange={(e) => onUpdateConfig(id, { instructions: e.target.value })}
                    rows={3}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

