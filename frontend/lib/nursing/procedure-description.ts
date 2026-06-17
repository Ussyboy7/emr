/**
 * Shared parsers/formatters for nursing procedure order descriptions.
 * Keeps Procedures queue, perform-complete, and Procedures History aligned.
 */

export type ProcedureDetailFields = {
  medication?: string;
  dosage?: string;
  route?: string;
  frequency?: string;
  woundType?: string;
  woundLocation?: string;
  instructions?: string;
  admissionDiagnosis?: string;
  presentingComplaint?: string;
};

export type ProcedureKind = 'injection' | 'dressing' | 'medication' | 'ward_admission';

export const WOUND_INTERVENTION_LABELS: Record<string, string> = {
  dressing: 'Dressing',
  sutures: 'Suturing',
  suture_removal: 'Suture removal',
  i_and_d: 'Incision and drainage',
};

/** Parse nursing order descriptions (consultation room + legacy). */
export function parseProcedureDetails(
  procedureType: ProcedureKind,
  description: string,
  orderFrequency = '',
): ProcedureDetailFields {
  const details: ProcedureDetailFields = {};
  const d = (description || '').trim();
  if (!d) return details;

  if (procedureType === 'dressing') {
    const at = d.match(/^(.+?)\s+dressing\s+at\s+([^.]+?)(?:\.|\s*$)/i);
    if (at) {
      details.woundType = at[1].trim();
      details.woundLocation = at[2].trim();
    } else {
      const dash = d.match(/^(.+?)\s*[-–—]\s*(.+)$/);
      if (dash && dash[1].length > 1) {
        details.woundType = dash[1].trim();
        details.woundLocation = dash[2].trim();
      }
    }
    details.instructions = d;
    return details;
  }

  if (procedureType === 'injection' || procedureType === 'medication') {
    if (/^IV\s+Infusion:/i.test(d)) {
      const body = d.replace(/^IV\s+Infusion:\s*/i, '').trim();
      const parts = body.split(/\s+[—-]\s+/);
      details.medication = parts[0]?.replace(/[.,]\s*$/, '').trim() || body;
      if (parts[1]) details.dosage = parts[1].split(/\./)[0]?.trim() || parts[1].trim();
      if (orderFrequency) details.frequency = orderFrequency;
      return details;
    }
    const hy = d.indexOf(' - ');
    if (hy > 0 && /\bvia\b/i.test(d)) {
      const med = d.slice(0, hy).trim();
      const afterHy = d.slice(hy + 3);
      const vi = afterHy.split(/\bvia\b/i);
      const dosePart = (vi[0] || '').replace(/[.,]\s*$/, '').trim();
      const routePart = vi[1]
        ? vi[1].replace(/^\s+/i, '').replace(/[.,]\s*$/, '').trim().split(/\./)[0]
        : '';
      if (med.length >= 2) {
        details.medication = med;
        if (dosePart) details.dosage = dosePart;
        if (routePart) details.route = routePart;
        if (orderFrequency) details.frequency = orderFrequency;
        return details;
      }
    }
    const hyphen = d.match(/^(.{2,})\s*-\s+(.+)$/);
    if (hyphen) {
      details.medication = hyphen[1].trim();
      const rest = hyphen[2].trim();
      const viaIdx = rest.search(/\bvia\b/i);
      if (viaIdx >= 0) {
        details.dosage = rest.slice(0, viaIdx).replace(/[.,]\s*$/, '').trim();
        details.route =
          rest
            .slice(viaIdx)
            .replace(/^\s*via\s+/i, '')
            .replace(/[.,]\s*$/, '')
            .split(/\./)[0]
            ?.trim() || '';
      } else {
        details.dosage = rest.split(/[.•]/)[0]?.trim() || rest;
      }
      if (orderFrequency) details.frequency = orderFrequency;
      return details;
    }
    const firstSentence = d.split(/[.\n]/)[0]?.trim() || d;
    details.medication = firstSentence.length >= 2 ? firstSentence : d;
    if (orderFrequency) details.frequency = orderFrequency;
  }

  return details;
}

export function parseDressingDescription(description: string): {
  woundType?: string;
  woundLocation?: string;
  orderInstructions?: string;
} {
  const body = String(description || '').replace(/^Dressing:\s*/i, '').trim();
  if (!body) return {};

  const parts = body.split(/\s*•\s*/).map((s) => s.trim()).filter(Boolean);
  const out: { woundType?: string; woundLocation?: string; orderInstructions?: string } = {};
  let woundType = '';

  for (const part of parts) {
    const loc = part.match(/^Location:\s*(.+)$/i);
    const instr = part.match(/^Instructions:\s*(.+)$/i);
    if (loc) out.woundLocation = loc[1].trim();
    else if (instr) out.orderInstructions = instr[1].trim();
    else if (!woundType) woundType = part;
  }
  if (woundType) out.woundType = woundType;

  const at = body.match(/^(.+?)\s+dressing\s+at\s+([^.]+)/i);
  if (at && !out.woundType) {
    out.woundType = at[1].trim();
    out.woundLocation = at[2].trim();
  }

  const dash = body.match(/^(.+?)\s*[-–—]\s*(.+)$/);
  if (dash && !out.woundType && dash[1].length > 1) {
    out.woundType = dash[1].trim();
    out.woundLocation = dash[2].trim();
  }

  return out;
}

export function parseDressingNotes(notes: string): {
  dressingType?: string;
  woundCondition?: string;
  notes?: string;
} {
  const raw = String(notes || '').trim();
  if (!raw) return {};

  const dressingType = raw.match(/Type:\s*([^|]+)/i)?.[1]?.trim();
  const woundCondition = raw.match(/Condition:\s*([^|]+)/i)?.[1]?.trim();
  const observations = raw.match(/Observations:\s*(.+)$/i)?.[1]?.trim();

  if (!dressingType && !woundCondition && !observations) {
    return { notes: raw };
  }

  return { dressingType, woundCondition, notes: observations };
}

/** Order-compatible description when completing a procedure (matches consultation room format). */
export function formatCompletedProcedureDescription(
  type: ProcedureKind,
  details: ProcedureDetailFields,
  orderDescription?: string,
): string {
  if (type === 'injection' && details.medication) {
    const base = `${details.medication} - ${details.dosage || ''} via ${details.route || ''}`.trim();
    const instr = details.instructions?.trim();
    return instr && !base.includes(instr) ? `${base}. ${instr}` : base;
  }
  if (type === 'dressing') {
    const wt = details.woundType || 'Wound';
    const loc = details.woundLocation || 'site';
    const instr = details.instructions?.trim() || '';
    return `${wt} dressing at ${loc}.${instr ? ` ${instr}` : ''}`;
  }
  if (type === 'medication' && details.medication) {
    const route = details.route ? ` via ${details.route}` : '';
    return `${details.medication}${route}. ${details.instructions || ''}`.trim();
  }
  return (orderDescription || '').trim();
}

export type ApiProcedureRecord = {
  procedure_type?: string;
  description?: string;
  medication_name?: string;
  dosage?: string;
  route?: string;
  site?: string;
  notes?: string;
  wound_intervention?: string;
  ordered_by_name?: string;
};

/** Resolve display fields for history from API structured data + description fallback. */
export function resolveProcedureHistoryDetails(
  procedureType: ProcedureKind,
  proc: ApiProcedureRecord,
): {
  details: ProcedureDetailFields;
  orderInstructions?: string;
  record: { site?: string; dressingType?: string; woundCondition?: string; notes?: string };
} {
  const description = String(proc.description || '');
  const details: ProcedureDetailFields = {};
  const record: { site?: string; dressingType?: string; woundCondition?: string; notes?: string } = {
    site: proc.site || '',
    notes: proc.notes || '',
  };

  if (procedureType === 'injection' || procedureType === 'medication') {
    details.medication = proc.medication_name || undefined;
    details.dosage = proc.dosage || undefined;
    details.route = proc.route || undefined;
    if (!details.medication && description) {
      Object.assign(details, parseProcedureDetails(procedureType, description));
    }
  } else if (procedureType === 'dressing') {
    details.woundType = proc.medication_name || undefined;
    details.woundLocation = proc.site || undefined;
    let orderInstructions: string | undefined;
    if (description) {
      const parsed = parseDressingDescription(description);
      details.woundType = details.woundType || parsed.woundType;
      details.woundLocation = details.woundLocation || parsed.woundLocation;
      orderInstructions = parsed.orderInstructions;
    }
    const parsedNotes = parseDressingNotes(proc.notes || '');
    record.dressingType =
      WOUND_INTERVENTION_LABELS[String(proc.wound_intervention || '')] || parsedNotes.dressingType;
    record.woundCondition = parsedNotes.woundCondition;
    record.notes = parsedNotes.notes || record.notes || '';
    return { details, orderInstructions, record };
  }

  return { details, record };
}

export function resolveOrderedByName(proc: ApiProcedureRecord): string {
  return proc.ordered_by_name?.trim() || '';
}
