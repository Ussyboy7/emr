"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Activity,
  Droplets,
  Edit,
  Eye,
  Heart,
  Scale,
  Thermometer,
  Wind,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  displayBmiFromVitals,
  formatVitalTileValue,
  vitalFieldToString,
} from "@/lib/vitals-display";

interface VitalsDetail {
  id?: string | number;
  date?: string;
  time?: string;
  recordedAt?: string;
  recordedBy?: string;
  bloodPressureSystolic?: string;
  bloodPressureDiastolic?: string;
  pulse?: string;
  temperature?: string;
  respiratoryRate?: string;
  oxygenSaturation?: string;
  weight?: string;
  height?: string;
  bmi?: string;
  painScale?: string;
  bloodSugar?: string;
  randomBloodSugar?: string;
  notes?: string;
  bp?: string;
  temp?: string;
  spo2?: string;
  heartRate?: string | number;
  systolic?: string | number;
  diastolic?: string | number;
  recorded_at?: string;
  recorded_by_name?: string;
}

export interface VitalsDetailModalProps {
  vitals: VitalsDetail | null;
  patientName?: string;
  /** Shown in subtitle before "Recorded:" (e.g. R-9999). */
  patientId?: string;
  isOpen: boolean;
  onClose: () => void;
  /** When set, shows "Edit Vitals" like nursing pool queue. */
  onEdit?: () => void;
}

export function VitalsDetailModal({
  vitals,
  patientName,
  patientId,
  isOpen,
  onClose,
  onEdit,
}: VitalsDetailModalProps) {
  if (!vitals) return null;

  const sysFromBp = vitals.bp ? String(vitals.bp).split("/")[0]?.trim() : "";
  const diaFromBp = vitals.bp ? String(vitals.bp).split("/")[1]?.trim() : "";

  const normalized = {
    temperature: vitalFieldToString(vitals.temperature ?? vitals.temp),
    pulse: vitalFieldToString(vitals.pulse ?? vitals.heartRate),
    bloodPressureSystolic: vitalFieldToString(
      vitals.bloodPressureSystolic ?? vitals.systolic ?? sysFromBp
    ),
    bloodPressureDiastolic: vitalFieldToString(
      vitals.bloodPressureDiastolic ?? vitals.diastolic ?? diaFromBp
    ),
    respiratoryRate: vitalFieldToString(vitals.respiratoryRate),
    oxygenSaturation: vitalFieldToString(vitals.oxygenSaturation ?? vitals.spo2),
    weight: vitalFieldToString(vitals.weight),
    height: vitalFieldToString(vitals.height),
    bmi: vitalFieldToString(vitals.bmi),
    painScale: vitalFieldToString(vitals.painScale),
    bloodSugar: vitalFieldToString(vitals.bloodSugar),
    randomBloodSugar: vitalFieldToString(vitals.randomBloodSugar),
    notes: vitals.notes != null ? String(vitals.notes).trim() : "",
  };

  const recordedRaw = vitals.recordedAt ?? vitals.recorded_at;
  const recordedAtStr = recordedRaw
    ? new Date(recordedRaw as string).toLocaleString()
    : [vitals.date, vitals.time].filter(Boolean).join(", ") || "N/A";

  const sysS = normalized.bloodPressureSystolic;
  const diaS = normalized.bloodPressureDiastolic;
  const bpValue =
    sysS && diaS
      ? `${formatVitalTileValue(sysS)}/${formatVitalTileValue(diaS)}`
      : "—";
  const bmiStr = displayBmiFromVitals(normalized);

  const rows: { label: string; value: string; unit: string; icon?: LucideIcon }[] = [
    {
      label: "Temperature",
      value: formatVitalTileValue(normalized.temperature),
      unit: "°C",
      icon: Thermometer,
    },
    { label: "Pulse", value: formatVitalTileValue(normalized.pulse), unit: "bpm", icon: Heart },
    {
      label: "Blood Pressure",
      value: bpValue,
      unit: "mmHg",
      icon: Activity,
    },
    {
      label: "Respiratory Rate",
      value: formatVitalTileValue(normalized.respiratoryRate),
      unit: "/min",
      icon: Wind,
    },
    {
      label: "SpO2",
      value: formatVitalTileValue(normalized.oxygenSaturation),
      unit: "%",
      icon: Droplets,
    },
    { label: "Weight", value: formatVitalTileValue(normalized.weight), unit: "kg", icon: Scale },
    { label: "Height", value: formatVitalTileValue(normalized.height), unit: "cm" },
    {
      label: "BMI",
      value: bmiStr ? formatVitalTileValue(bmiStr) : "—",
      unit: bmiStr ? "kg/m²" : "",
    },
    { label: "Pain Scale", value: formatVitalTileValue(normalized.painScale), unit: "/10" },
    {
      label: "Blood sugar",
      value: formatVitalTileValue(normalized.bloodSugar),
      unit: "mg/dL",
    },
    { label: "RBS", value: formatVitalTileValue(normalized.randomBloodSugar), unit: "mg/dL" },
  ];

  const name = patientName?.trim() || "Patient";
  const pid = patientId?.trim();

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="w-[95vw] sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Eye className="h-5 w-5 text-rose-500" />
            Vitals - {name}
          </DialogTitle>
          <DialogDescription>
            {pid ? `${pid} | ` : ""}
            Recorded: {recordedAtStr}
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {rows.map((item, i) => (
              <div key={i} className="p-3 rounded-lg bg-muted/50 text-center">
                <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                  {item.icon && <item.icon className="h-3 w-3" />}
                  {item.label}
                </p>
                <p className="text-lg font-semibold">
                  {item.value}{" "}
                  {item.unit ? (
                    <span className="text-sm font-normal text-muted-foreground">{item.unit}</span>
                  ) : null}
                </p>
              </div>
            ))}
          </div>
          {normalized.notes ? (
            <div className="mt-4 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
              <p className="text-sm font-medium text-blue-700 dark:text-blue-300">Notes</p>
              <p className="text-sm text-foreground mt-1 whitespace-pre-wrap">{normalized.notes}</p>
            </div>
          ) : null}
          <p className="text-xs text-muted-foreground mt-4">
            Recorded by:{" "}
            {vitalFieldToString(vitals.recordedBy ?? vitals.recorded_by_name) || "Unknown"}
          </p>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Close
          </Button>
          {onEdit ? (
            <Button type="button" onClick={onEdit}>
              <Edit className="h-4 w-4 mr-2" />
              Edit Vitals
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
