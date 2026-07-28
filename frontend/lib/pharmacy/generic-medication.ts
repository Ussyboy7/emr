import {
  normalizePrescriptionDoseUnit,
  PRESCRIPTION_DOSE_UNITS,
} from '@/lib/pharmacy/infer-dose-unit';
import {
  DEFAULT_INJECTION_ROUTE,
  INJECTION_ROUTES,
  WARD_MEDICATION_ROUTES,
} from '@/lib/constants/medical-data';

/** Same catalogue as pharmacy prescriptions — use for nursing/injection dose units. */
export const PROCEDURE_DOSE_UNITS = PRESCRIPTION_DOSE_UNITS;

export {
  DEFAULT_INJECTION_ROUTE,
  INJECTION_ROUTES,
  WARD_MEDICATION_ROUTES,
};

/** Shape returned by `/pharmacy/generics/for_prescription/`. */
export type GenericMedicationLike = {
  id: number | string;
  name?: string;
  active_ingredient?: string;
  category?: string;
  form?: string;
  dosage_form?: string;
  strength?: string;
  route?: string;
  unit?: string;
};

export type MedicationConfigState = {
  dosage: string;
  frequency: string;
  durationDays: number | '' | string;
  route: string;
  unit: string;
  strength: string;
  form: string;
  quantity?: number;
  instructions: string;
  name?: string;
  generic_name?: string;
};

export const MEDICATION_FREQUENCY_OPTIONS = [
  'Once daily (OD)',
  'Twice daily (BD)',
  'Three times daily (TDS)',
  'Four times daily (QDS)',
  'Every 6 hours (Q6H)',
  'Every 8 hours (Q8H)',
  'Every 12 hours (Q12H)',
  'At bedtime (Nocte)',
  'As needed (PRN)',
  'STAT (Single dose)',
  'Weekly',
] as const;

export const frequencyToDailyDoses: Record<string, number> = {
  'Once daily (OD)': 1,
  'Twice daily (BD)': 2,
  'Three times daily (TDS)': 3,
  'Four times daily (QDS)': 4,
  'Every 6 hours (Q6H)': 4,
  'Every 8 hours (Q8H)': 3,
  'Every 12 hours (Q12H)': 2,
  'At bedtime (Nocte)': 1,
  'As needed (PRN)': 2,
  Weekly: 1 / 7,
  'STAT (Single dose)': 0,
};

/** Match consultation room: "Name (strength, form)" */
export function formatGenericMedicationLabel(
  med: Pick<GenericMedicationLike, 'name' | 'strength' | 'form' | 'dosage_form'>,
): string {
  const name = med?.name || '';
  const strength = (med?.strength || '').toString().trim();
  const form = (med?.dosage_form || med?.form || '').toString().trim();
  if (strength && form) return `${name} (${strength}, ${form})`;
  if (strength) return `${name} (${strength})`;
  if (form) return `${name} (${form})`;
  return name;
}

export function normalizeGenericMedicationId(id: number | string | undefined): number | null {
  if (id == null) return null;
  const n = typeof id === 'number' ? id : parseInt(String(id), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function genericMedicationKey(g: GenericMedicationLike): string {
  return `g:${String(g.id)}`;
}

export function parseDoseNumberFromString(dose?: string): string {
  if (!dose) return '1';
  const trimmed = String(dose).trim();
  const m = trimmed.match(/^([\d.]+)/);
  return m ? m[1] : trimmed;
}

export function parseDurationDaysFromString(duration?: string): number | '' {
  if (!duration) return '';
  const m = String(duration).match(/(\d+)\s*day/i);
  if (m) return parseInt(m[1], 10);
  return '';
}

/** Maps free-text generic route onto fixed Select options. */
export function mapGenericRouteToOption(route: string | undefined, fallback: string): string {
  const r = (route || '').trim().toLowerCase();
  if (!r) return fallback;
  if (r.includes('iv') || r.includes('intraven')) return 'Intravenous (IV)';
  if (r.includes('im') || r.includes('intramus')) return 'Intramuscular (IM)';
  if (r.includes('sc') || r.includes('subcut')) return 'Subcutaneous (SC)';
  if (r.includes('topic') || r.includes('skin')) return 'Topical';
  if (r.includes('oral')) return 'Oral';
  return fallback;
}

export function defaultMedicationConfigForGeneric(
  g: GenericMedicationLike,
  options?: { defaultRoute?: string },
): MedicationConfigState {
  const form = (g.dosage_form || g.form || '').trim();
  const route = mapGenericRouteToOption(g.route, options?.defaultRoute || 'Oral');
  return {
    dosage: parseDoseNumberFromString(g.strength),
    frequency: 'Once daily (OD)',
    durationDays: '',
    route,
    unit: normalizePrescriptionDoseUnit(g.unit, form),
    strength: (g.strength || '').trim(),
    form,
    instructions: '',
    name: g.name,
    generic_name: g.name,
  };
}

export function genericMedicationSubline(g: GenericMedicationLike): string {
  return [g.active_ingredient, g.category, g.route]
    .map((v) => (v || '').trim())
    .filter(Boolean)
    .join(' · ');
}
