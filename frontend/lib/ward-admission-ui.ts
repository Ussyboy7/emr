import type { PatientAdmission } from '@/lib/services/ward-service';

export type WardDetailsTab = 'overview' | 'orders' | 'nursing';

export type WardDoctorDetailsTab = 'overview' | 'orders' | 'notes' | 'patient';

export function isObservationAdmission(admission: Pick<PatientAdmission, 'admission_type'>): boolean {
  const t = (admission.admission_type || '').toLowerCase().replace(/_/g, ' ');
  return t.includes('observation') || t.includes('day care') || t === 'daycare';
}

export function isEscalatedCondition(condition: string | null | undefined): boolean {
  return /needs doctor review/i.test(condition || '');
}

const isInstructionOrderType = (orderType: string) => {
  const t = String(orderType || '').toLowerCase();
  return t === 'ward instruction' || t === 'observation admission';
};

/** Admission / consultation handoff instructions are informational, not tasks. */
export function isAdmissionHandoffOrder(order: {
  order_type: string;
  description?: string | null;
}): boolean {
  const t = String(order.order_type || '').toLowerCase();
  if (t === 'observation admission') return true;

  if (t !== 'ward instruction') return false;
  const desc = (order.description || '').toLowerCase();
  return (
    desc.includes('observation admission') ||
    desc.includes('ward admission') ||
    desc.includes('day care') ||
    (desc.includes('presenting complaint') && desc.includes('diagnos'))
  );
}

/** API flag or legacy heuristics — exclude from active task lists. */
export function isWardHandoffOrder(order: {
  order_type: string;
  description?: string | null;
  is_informational?: boolean;
}): boolean {
  if (order.is_informational) return true;
  return isAdmissionHandoffOrder(order);
}

/** Short nursing-order description — clinical detail lives on the admission record. */
export function buildObservationAdmissionOrderDescription(params: {
  ward: string | undefined;
  instructions?: string | null;
}): string {
  const ward = (params.ward || '').trim() || 'ward';
  const instr = params.instructions?.trim();
  if (instr) {
    return `Observation admission to ${ward}. Instructions: ${instr}`;
  }
  return `Observation admission to ${ward}. Clinical details are on the ward admission record.`;
}

/** Prepend a structured nursing note (matches doctor progress-note format). */
export function buildNurseObservationNotePayload(params: {
  authorName: string;
  timestamp: string;
  bodyLines: string[];
  existingNotes?: string | null;
}): string {
  const body = params.bodyLines.filter(Boolean).join('\n').trim();
  if (!body) return params.existingNotes?.trim() || '';
  const block = `[${params.timestamp} — N. ${params.authorName}]\n${body}`;
  const existing = params.existingNotes?.trim();
  return existing ? `${block}\n\n---\n\n${existing}` : block;
}

export function formatAdmissionTypeLabel(type: string | null | undefined): string | null {
  if (!type) return null;
  const normalized = type.replace(/_/g, ' ').trim();
  if (!normalized) return null;
  return normalized.replace(/\b\w/g, (c) => c.toUpperCase());
}

/** System note written to admission_notes at consultation handoff. */
export function isHandoffNoteBody(body: string): boolean {
  const lower = body.toLowerCase();
  return (
    lower.includes('consultation handoff') ||
    (lower.includes('observation ward') && lower.includes('diagnos'))
  );
}

/** Extract trailing "Instructions: …" from a nursing-order or admission_notes block. */
export function parseInstructionsFromText(raw: string | null | undefined): string | null {
  const text = raw?.trim();
  if (!text) return null;
  const match = text.match(/Instructions:\s*([\s\S]+)$/i);
  return match?.[1]?.trim() || null;
}

/** Consultation-room handoff stores instructions on admission_notes; history flow may use the nursing order. */
export function resolveWardHandoffInstructions(params: {
  admissionNotes?: string | null;
  orderDescription?: string | null;
}): string | null {
  const fromOrder = parseInstructionsFromText(params.orderDescription);
  if (fromOrder) return fromOrder;

  const notes = params.admissionNotes?.trim();
  if (!notes) return null;

  const blocks = notes.split(/\n\n---\n\n/);
  for (const block of blocks) {
    if (isHandoffNoteBody(block)) {
      const instr = parseInstructionsFromText(block);
      if (instr) return instr;
    }
  }
  for (const block of blocks) {
    const instr = parseInstructionsFromText(block);
    if (instr) return instr;
  }
  return null;
}
