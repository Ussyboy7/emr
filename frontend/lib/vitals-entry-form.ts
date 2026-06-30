/** Shared vitals field shape (pool queue + ward observation). */
export type VitalsEntryFormData = {
  temperature: string;
  pulse: string;
  respiratoryRate: string;
  bloodPressureSystolic: string;
  bloodPressureDiastolic: string;
  oxygenSaturation: string;
};

export const emptyVitalsEntry = (): VitalsEntryFormData => ({
  temperature: '',
  pulse: '',
  respiratoryRate: '',
  bloodPressureSystolic: '',
  bloodPressureDiastolic: '',
  oxygenSaturation: '',
});

export const hasAnyVitalsEntry = (v: VitalsEntryFormData): boolean =>
  !!v.temperature.trim() ||
  !!v.pulse.trim() ||
  !!v.respiratoryRate.trim() ||
  !!v.bloodPressureSystolic.trim() ||
  !!v.bloodPressureDiastolic.trim() ||
  !!v.oxygenSaturation.trim();

export const formatVitalsSummaryLine = (v: VitalsEntryFormData): string => {
  const parts: string[] = [];
  if (v.bloodPressureSystolic.trim() && v.bloodPressureDiastolic.trim()) {
    parts.push(`BP: ${v.bloodPressureSystolic}/${v.bloodPressureDiastolic}`);
  }
  if (v.temperature.trim()) parts.push(`Temp: ${v.temperature}°C`);
  if (v.pulse.trim()) parts.push(`Pulse: ${v.pulse} bpm`);
  if (v.respiratoryRate.trim()) parts.push(`RR: ${v.respiratoryRate}`);
  if (v.oxygenSaturation.trim()) parts.push(`SpO2: ${v.oxygenSaturation}%`);
  return parts.join(' | ');
};

export const parseOptionalInt = (s: string): number | undefined => {
  const n = parseInt(s.trim(), 10);
  return Number.isFinite(n) ? n : undefined;
};

export const parseOptionalFloat = (s: string): number | undefined => {
  const n = parseFloat(s.trim());
  return Number.isFinite(n) ? n : undefined;
};
