/**
 * Annual employee check-up API service (P1 — clinical workflow).
 */
import { apiFetch, buildQueryString } from '../api-client';

export type FitnessOutcome =
  | 'fit'
  | 'fit_with_conditions'
  | 'temporarily_unfit'
  | 'unfit';

export type CapturedVia =
  | 'vitals'
  | 'laboratory'
  | 'radiology'
  | 'eyecare'
  | 'consultation'
  | 'medical_history'
  | 'patient_record'
  | 'annual_checkup';

export interface CatalogItem {
  code: string;
  label: string;
  captured_via: CapturedVia;
  tier: string;
  sort_order?: number;
  skippable: boolean;
  is_active?: boolean;
  lab_template_codes?: string[];
  radiology_template_codes?: string[];
  name_aliases?: string[];
  selected?: boolean;
  done?: boolean;
  override_reason?: string | null;
}

export interface ChecklistItem extends CatalogItem {
  done: boolean;
}

export interface AnnualCheckup {
  id: number;
  visit: number;
  visit_id: string;
  visit_date: string;
  visit_status: string;
  patient: number;
  patient_id: string;
  patient_name: string;
  programme_year: number;
  status: 'in_progress' | 'completed' | 'cancelled';
  fitness_outcome: FitnessOutcome | '';
  fitness_outcome_display: string;
  outcome_notes: string;
  signed_off_by: number | null;
  signed_off_by_name: string | null;
  signed_off_at: string | null;
  sign_off_override_reason: string;
  components_required: string[];
  components_completed: string[];
  component_overrides: Record<string, string>;
  checklist: ChecklistItem[];
  catalog: CatalogItem[];
  incomplete_components: string[];
  has_report_pdf: boolean;
  created_at: string;
  updated_at: string;
}

export interface AnnualCheckupProgramme {
  programme_year: number;
  catalog: CatalogItem[];
  default_selected_codes: string[];
}

export interface AnnualCheckupFilters {
  patient?: number;
  visit?: number;
  status?: string;
  programme_year?: number;
  page?: number;
  page_size?: number;
}

export const FITNESS_OUTCOME_OPTIONS: { value: FitnessOutcome; label: string }[] = [
  { value: 'fit', label: 'Fit for duty' },
  { value: 'fit_with_conditions', label: 'Fit with conditions' },
  { value: 'temporarily_unfit', label: 'Temporarily unfit' },
  { value: 'unfit', label: 'Unfit for duty' },
];

export const OUTCOME_NOTE_TEMPLATES = [
  'Fit for duty without restrictions.',
  'Fit for duty with recommendation for lifestyle modification.',
  'Fit for desk duties; avoid strenuous physical activity pending review.',
  'Temporarily unfit — follow-up required before resuming full duties.',
  'Referred for specialist review; HR to note pending outcome.',
];

const CAPTURED_VIA_LABELS: Record<string, string> = {
  vitals: 'Vitals',
  laboratory: 'Lab',
  radiology: 'Radiology',
  eyecare: 'Eye',
  consultation: 'Consultation',
  medical_history: 'History',
  patient_record: 'Record',
  annual_checkup: 'Sign-off',
};

export function capturedViaLabel(via?: string): string {
  if (!via) return '';
  return CAPTURED_VIA_LABELS[via] || via;
}

export const CAPTURED_VIA_OPTIONS: { value: CapturedVia; label: string }[] = [
  { value: 'vitals', label: 'Vitals' },
  { value: 'laboratory', label: 'Laboratory' },
  { value: 'radiology', label: 'Radiology' },
  { value: 'eyecare', label: 'Eye care' },
  { value: 'consultation', label: 'Consultation' },
  { value: 'medical_history', label: 'Medical history' },
  { value: 'patient_record', label: 'Patient record' },
  { value: 'annual_checkup', label: 'Annual check-up sign-off' },
];

class AnnualCheckupService {
  async list(
    params?: AnnualCheckupFilters
  ): Promise<{ results: AnnualCheckup[]; count: number }> {
    const query = buildQueryString((params || {}) as Record<string, string | number | undefined>);
    return apiFetch<{ results: AnnualCheckup[]; count: number }>(`/annual-checkups/${query}`);
  }

  async resolve(params: {
    patient?: number;
    visit?: number;
    programme_year?: number;
  }): Promise<AnnualCheckup> {
    const query = buildQueryString(params as Record<string, string | number | undefined>);
    return apiFetch<AnnualCheckup>(`/annual-checkups/resolve/${query}`);
  }

  async getById(id: number): Promise<AnnualCheckup> {
    return apiFetch<AnnualCheckup>(`/annual-checkups/${id}/`);
  }

  async getByVisit(visitId: number): Promise<AnnualCheckup | null> {
    try {
      const summary = await this.resolve({ visit: visitId });
      if (!summary?.id) return null;
      // Retrieve re-evaluates completion (blood group, genotype on chart, labs, etc.).
      return this.getById(summary.id);
    } catch {
      return null;
    }
  }

  async getProgramme(programmeYear?: number): Promise<AnnualCheckupProgramme> {
    const query = buildQueryString({
      programme_year: programmeYear,
    } as Record<string, number | undefined>);
    return apiFetch<AnnualCheckupProgramme>(`/annual-checkups/programme/${query}`);
  }

  async updateProgramme(
    data: {
      default_selected_codes?: string[];
      catalog_creates?: Array<
        Partial<CatalogItem> & { code: string; label: string; captured_via: CapturedVia }
      >;
      catalog_updates?: Array<
        Partial<CatalogItem> & { code: string }
      >;
    },
    programmeYear?: number
  ): Promise<AnnualCheckupProgramme> {
    const query = buildQueryString({
      programme_year: programmeYear,
    } as Record<string, number | undefined>);
    return apiFetch<AnnualCheckupProgramme>(`/annual-checkups/programme/${query}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async ensureForVisit(visitId: number): Promise<AnnualCheckup> {
    return apiFetch<AnnualCheckup>('/annual-checkups/ensure-for-visit/', {
      method: 'POST',
      body: JSON.stringify({ visit: visitId }),
    });
  }

  async refreshComponents(id: number): Promise<AnnualCheckup> {
    return apiFetch<AnnualCheckup>(`/annual-checkups/${id}/refresh-components/`, {
      method: 'POST',
    });
  }

  async update(
    id: number,
    data: Partial<
      Pick<
        AnnualCheckup,
        'fitness_outcome' | 'outcome_notes' | 'component_overrides' | 'components_required'
      >
    >
  ): Promise<AnnualCheckup> {
    return apiFetch<AnnualCheckup>(`/annual-checkups/${id}/`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async orderInvestigations(
    id: number,
    data?: {
      consultation_session?: number;
      component_codes?: string[];
      priority?: 'routine' | 'urgent' | 'stat';
    }
  ): Promise<{
    lab_order_id: number | null;
    radiology_order_id: number | null;
    ordered: string[];
    skipped: string[];
    lab_tests_count: number;
    radiology_studies_count: number;
    checkup: AnnualCheckup;
  }> {
    return apiFetch(`/annual-checkups/${id}/order-investigations/`, {
      method: 'POST',
      body: JSON.stringify(data || {}),
    });
  }

  async signOff(
    id: number,
    data: {
      fitness_outcome: FitnessOutcome;
      outcome_notes?: string;
      override_reason?: string;
    }
  ): Promise<AnnualCheckup> {
    return apiFetch<AnnualCheckup>(`/annual-checkups/${id}/sign-off/`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async fetchReportPdf(id: number): Promise<Blob> {
    return apiFetch<Blob>(`/annual-checkups/${id}/report-pdf/`, {
      responseType: 'blob',
    });
  }

  downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }
}

export const annualCheckupService = new AnnualCheckupService();
export default annualCheckupService;
