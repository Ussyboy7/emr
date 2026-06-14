import { apiFetch } from '@/lib/api-client';
import { formatLocalYmd } from '@/lib/laboratory/constants';
import { RECENT_LIST_PAGE_SIZE } from '@/lib/pagination-constants';
import { visitService } from '@/lib/services';
import type { NursingOrderSubmitInput } from '@/components/consultation/orders/NursingOrderModal';

export type RecentNursingOrderRow = {
  id: number;
  order_type: string;
  description: string;
  ordered_by?: number | null;
  ordered_by_name?: string;
  ordered_at?: string;
};

const PRIORITY_MAP: Record<string, 'low' | 'medium' | 'high' | 'urgent'> = {
  Routine: 'low',
  Urgent: 'high',
  STAT: 'urgent',
};

export function buildNursingOrderPayload(
  payload: NursingOrderSubmitInput,
  opts: { repeatPrefix?: string } = {}
) {
  const prefix = opts.repeatPrefix?.trim() ? `${opts.repeatPrefix.trim()} ` : '';
  let orderTypeForApi = payload.type;
  let description = payload.instructions;

  if (payload.type === 'Injection' && payload.medication) {
    description = `${prefix}${payload.medication} - ${payload.dosage || ''} via ${payload.route || ''}. ${payload.instructions}`.trim();
  } else if (payload.type === 'Dressing') {
    orderTypeForApi = 'Dressing';
    description = `${prefix}${payload.woundType || 'Wound'} dressing at ${payload.woundLocation || 'site'}. ${payload.instructions}`.trim();
  }

  return {
    orderTypeForApi,
    description,
    priority: PRIORITY_MAP[payload.priority] || 'medium',
    frequency: payload.type === 'Injection' ? 'As ordered' : '',
  };
}

export async function fetchRecentPatientNursingOrders(patientDbId: number): Promise<RecentNursingOrderRow[]> {
  const qs = new URLSearchParams({
    patient: String(patientDbId),
    procedures_queue: '1',
    ordering: '-ordered_at',
    page_size: String(RECENT_LIST_PAGE_SIZE),
  });
  const res = await apiFetch<{ results: RecentNursingOrderRow[] }>(`/nursing/orders/?${qs.toString()}`);
  const allowed = new Set(['injection', 'dressing', 'wound care']);
  return (res.results || []).filter((row) => allowed.has(String(row.order_type || '').toLowerCase()));
}

/**
 * Resolve visit for a nurse-initiated repeat procedure.
 * Links to today's in-progress visit when present; otherwise creates a nursing_procedure visit.
 */
export async function resolveNursingProcedureVisit(
  patientDbId: number,
  recordAsVisit: boolean,
  clinicalNotes: string
): Promise<{ visitId: number | undefined; createdNursingVisit: boolean }> {
  if (!recordAsVisit) {
    return { visitId: undefined, createdNursingVisit: false };
  }

  const today = formatLocalYmd(new Date());
  const inProgress = await visitService.resolveVisit({
    patient: patientDbId,
    status: 'in_progress',
    date: today,
  });
  if (inProgress?.id) {
    return { visitId: inProgress.id, createdNursingVisit: false };
  }

  const now = new Date();
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const visit = await visitService.createVisit({
    patient: patientDbId,
    visit_type: 'nursing_procedure',
    status: 'in_progress',
    date: today,
    time: `${hh}:${mm}:00`,
    clinic: 'Nursing',
    clinics: ['Nursing'],
    clinical_notes: clinicalNotes.slice(0, 2000),
  } as Parameters<typeof visitService.createVisit>[0]);

  return { visitId: visit.id, createdNursingVisit: true };
}

export async function completeNursingProcedureVisit(visitId: number) {
  await visitService.updateVisit(visitId, {
    status: 'completed',
    clinics: ['Nursing'],
    completed_clinics: ['Nursing'],
  } as Parameters<typeof visitService.updateVisit>[1]);
}

export function recentOrderToFormInput(order: RecentNursingOrderRow): Partial<NursingOrderSubmitInput> {
  const typeLower = String(order.order_type || '').toLowerCase();
  const type: NursingOrderSubmitInput['type'] = typeLower.includes('dress') ? 'Dressing' : 'Injection';
  const d = String(order.description || '').replace(/^\[Nursing repeat\]\s*/i, '').trim();
  const out: Partial<NursingOrderSubmitInput> = {
    type,
    priority: 'Routine',
    instructions: '',
  };

  if (type === 'Dressing') {
    const at = d.match(/^(.+?)\s+dressing\s+at\s+([^.]+?)(?:\.|\s*$)/i);
    if (at) {
      out.woundType = at[1].trim();
      out.woundLocation = at[2].trim();
      const rest = d.slice(at[0].length).replace(/^\.\s*/, '').trim();
      if (rest) out.instructions = rest;
    } else {
      out.instructions = d;
    }
    return out;
  }

  const hy = d.indexOf(' - ');
  if (hy > 0 && /\bvia\b/i.test(d)) {
    out.medication = d.slice(0, hy).trim();
    const afterHy = d.slice(hy + 3);
    const vi = afterHy.split(/\bvia\b/i);
    out.dosage = (vi[0] || '').replace(/[.,]\s*$/, '').trim();
    out.route = vi[1] ? vi[1].replace(/^\s+/i, '').replace(/[.,]\s*$/, '').trim().split(/\./)[0] : '';
    const dot = afterHy.indexOf('.');
    if (dot >= 0) out.instructions = afterHy.slice(dot + 1).trim();
  } else {
    out.instructions = d;
  }
  return out;
}

export async function createNursingQueueOrder(input: {
  patientDbId: number;
  payload: NursingOrderSubmitInput;
  visitId?: number;
  orderedByUserId?: number | null;
  repeatPrefix?: string;
}) {
  const built = buildNursingOrderPayload(input.payload, { repeatPrefix: input.repeatPrefix });
  const body: Record<string, unknown> = {
    patient: input.patientDbId,
    order_type: built.orderTypeForApi,
    description: built.description,
    frequency: built.frequency,
    duration: '',
    status: 'pending',
    priority: built.priority,
  };
  if (input.visitId) body.visit = input.visitId;
  if (input.orderedByUserId) body.ordered_by = input.orderedByUserId;

  return apiFetch<Record<string, unknown>>('/nursing/orders/', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}
