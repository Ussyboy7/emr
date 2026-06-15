import { formatDisplayDate, formatDisplayTime } from '@/lib/dates';
import type { VitalReading } from '@/lib/services/patient-service';

export const debugConsultationRoom = (...args: unknown[]) => {
  if (typeof window === 'undefined') return;
  try {
    if (window.localStorage?.getItem('debug_consultation_room') === '1') {
      console.log(...args);
    }
  } catch {
    // ignore
  }
};

/** Queue card avatar: skip honorifics so names like "Mr EMENIKE …" do not render as "ME". */
export function initialsFromQueueDisplayName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const skip = new Set(['mr', 'mrs', 'ms', 'miss', 'dr', 'prof', 'sir', 'madam', 'master', 'mx']);
  const sig = parts.filter((w) => !skip.has(w.replace(/\.$/i, '').toLowerCase()));
  const words = sig.length > 0 ? sig : parts;
  const first = words[0] || '';
  const secondWord = words[1] || '';
  const c1 = first.match(/[A-Za-z]/)?.[0]?.toUpperCase() ?? '';
  const c2 = secondWord
    ? (secondWord.match(/[A-Za-z]/)?.[0]?.toUpperCase() ?? '')
    : (first.length > 1 && /[A-Za-z]/i.test(first[1]) ? first[1].toUpperCase() : '');
  const out = `${c1}${c2}`.trim();
  return out.length ? out : '?';
}

export const formatRoomDate = (dateString: string | undefined): string => {
  if (!dateString) return 'N/A';
  const formatted = formatDisplayDate(dateString);
  return formatted === '—' ? 'Invalid Date' : formatted;
};

export const formatRoomTime = (dateString: string | undefined): string => {
  if (!dateString) return 'N/A';
  const formatted = formatDisplayTime(dateString);
  return formatted === '—' ? 'Invalid Time' : formatted;
};

export const formatPriority = (p: string | undefined): string => {
  if (p == null || p === '') return '';
  const s = String(p).toLowerCase();
  if (s === 'stat') return 'STAT';
  if (s === 'urgent') return 'Urgent';
  if (s === 'routine') return 'Routine';
  return String(p);
};

export const splitPresentationComplaintLines = (value: string): string[] =>
  value.split('\n').map((line) => line.replace(/\r/g, ''));

export const joinPresentationComplaintLines = (selected: string[], customText: string): string => {
  const customLines = customText
    .split('\n')
    .map((line) => line.replace(/\r/g, ''))
    .filter((line) => line.trim().length > 0);

  return [...selected, ...customLines].join('\n');
};

export const parsePresentationComplaintValue = (
  value: string,
  optionLabelMap: Map<string, string>,
  optionSet: Set<string>,
): { selected: string[]; customText: string } => {
  const selectedNormalized = new Set<string>();
  const selected: string[] = [];
  const custom: string[] = [];

  for (const line of splitPresentationComplaintLines(value)) {
    const normalized = line.trim().toLowerCase();
    if (!normalized) continue;
    if (optionSet.has(normalized)) {
      if (!selectedNormalized.has(normalized)) {
        selectedNormalized.add(normalized);
        selected.push(optionLabelMap.get(normalized) ?? line);
      }
      continue;
    }
    custom.push(line);
  }

  return {
    selected,
    customText: custom.join('\n'),
  };
};

export const normalizeGenderLabel = (value: unknown): string => {
  if (value == null) return '';
  const normalized = String(value).trim().toLowerCase();
  if (normalized === 'male' || normalized === 'm') return 'Male';
  if (normalized === 'female' || normalized === 'f') return 'Female';
  return '';
};

export const processVitals = (vitalsData: VitalReading | Record<string, unknown> | null | undefined) => {
  if (!vitalsData) return undefined;

  debugConsultationRoom('🩺 Processing vitals data:', vitalsData);

  const bloodPressure = (() => {
    const systolic = vitalsData.blood_pressure_systolic?.toString() || '';
    const diastolic = vitalsData.blood_pressure_diastolic?.toString() || '';
    return systolic && diastolic ? `${systolic}/${diastolic}` : '';
  })();

  const processedVitals = {
    temperature: vitalsData.temperature?.toString() || '',
    bloodPressure,
    heartRate: vitalsData.heart_rate?.toString() || '',
    respiratoryRate: vitalsData.respiratory_rate?.toString() || '',
    oxygenSaturation: vitalsData.oxygen_saturation?.toString() || '',
    weight: vitalsData.weight?.toString() || '',
    height: vitalsData.height?.toString() || '',
    bmi: vitalsData.bmi != null && vitalsData.bmi !== '' ? String(vitalsData.bmi) : '',
    painScale:
      vitalsData.pain_scale != null && vitalsData.pain_scale !== ''
        ? String(vitalsData.pain_scale)
        : '',
    bloodSugar:
      vitalsData.blood_sugar != null && vitalsData.blood_sugar !== ''
        ? String(vitalsData.blood_sugar)
        : '',
    randomBloodSugar:
      vitalsData.random_blood_sugar != null && vitalsData.random_blood_sugar !== ''
        ? String(vitalsData.random_blood_sugar)
        : '',
    notes: vitalsData.notes ? String(vitalsData.notes) : '',
    recordedAt: String(vitalsData.recorded_at || new Date().toISOString()),
  };

  debugConsultationRoom('✅ Processed vitals result:', processedVitals);
  return processedVitals;
};
