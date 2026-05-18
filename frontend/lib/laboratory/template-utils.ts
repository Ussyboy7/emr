/**
 * Shared helpers for rendering and classifying lab test results from the canonical
 * `normal_range` template (seeded by `laboratory/management/commands/seed_lab_templates.py`).
 *
 * A single source of truth used by:
 *  - Result entry (`app/laboratory/orders/page.tsx`)
 *  - Result verification (`app/laboratory/verification/page.tsx`)
 *  - Completed lab report (`lib/laboratory/completedLabReport.ts`)
 *  - Patient chart / overview / consultation history (`buildOrderedLabResultViewRows`)
 *
 * Keeping ordering + classification here means the three screens never disagree
 * about whether a value is Normal/Abnormal/Critical, or about row order.
 */

export type ResultStatus = 'Normal' | 'Abnormal' | 'Critical';

/** Raw per-analyte metadata as stored in `LabTemplate.normal_range[<parameter>]`. */
export interface AnalyteMeta {
  unit?: string;
  range?: string;
  min?: string | number;
  max?: string | number;
  normalRangeMin?: string | number;
  normalRangeMax?: string | number;
  critical_min?: string | number;
  critical_max?: string | number;
  criticalMin?: string | number;
  criticalMax?: string | number;
  dataType?: string;
  required?: boolean;
  options?: string[];
}

/** Flattened/canonical field used by the result entry UI. */
export interface TemplateField {
  name: string;
  unit: string;
  normalRange: string;
  min?: number;
  max?: number;
  criticalMin?: number;
  criticalMax?: number;
  dataType?: string;
  required?: boolean;
  options?: string[];
}

const toNumber = (value: unknown): number | undefined => {
  if (value === undefined || value === null) return undefined;
  const s = String(value).trim();
  if (!s) return undefined;
  const n = Number(s);
  return Number.isNaN(n) ? undefined : n;
};

/** Unwrap a stored API cell: plain scalar or `{ value, unit?, ... }` shape. */
export function coerceStoredResultValue(raw: unknown): string {
  if (raw === undefined || raw === null) return '';
  if (typeof raw === 'string' || typeof raw === 'number' || typeof raw === 'boolean') {
    return String(raw);
  }
  if (typeof raw === 'object' && raw !== null && !Array.isArray(raw) && 'value' in raw) {
    const v = (raw as { value?: unknown }).value;
    if (v === undefined || v === null) return '';
    return String(v);
  }
  return '';
}

/** Extract the normal-range text (e.g. "11.0-18.0") from a template analyte meta. */
export const getNormalRangeText = (meta: AnalyteMeta | undefined | null): string => {
  if (!meta) return '';
  if (typeof meta.range === 'string' && meta.range.trim()) return meta.range.trim();
  const min = meta.min ?? meta.normalRangeMin;
  const max = meta.max ?? meta.normalRangeMax;
  if (min !== undefined && max !== undefined && String(min).trim() && String(max).trim()) {
    return `${min}-${max}`;
  }
  return '';
};

/**
 * Build the ordered list of fields to render for a given `normal_range` object.
 * Order rules:
 *   1. Keys listed in `_order` (in that exact order) — curated clinical sequence.
 *   2. Any remaining non-private keys appended alphabetically.
 *   3. Reserved keys starting with `_` are skipped.
 */
export const getOrderedTemplateFields = (
  normalRange: Record<string, any> | undefined | null
): TemplateField[] => {
  if (!normalRange || typeof normalRange !== 'object') return [];

  const explicitOrder: string[] = Array.isArray(normalRange._order)
    ? (normalRange._order as any[]).filter((k): k is string => typeof k === 'string')
    : [];

  const remaining = Object.keys(normalRange)
    .filter((k) => !k.startsWith('_') && !explicitOrder.includes(k))
    .sort((a, b) => a.localeCompare(b));

  const orderedKeys = [
    ...explicitOrder.filter((k) => normalRange[k] != null),
    ...remaining,
  ];

  return orderedKeys.map((name) => {
    const meta: AnalyteMeta = normalRange[name] || {};
    return {
      name,
      unit: String(meta.unit ?? '').trim(),
      normalRange: getNormalRangeText(meta),
      min: toNumber(meta.min ?? meta.normalRangeMin),
      max: toNumber(meta.max ?? meta.normalRangeMax),
      criticalMin: toNumber(meta.critical_min ?? meta.criticalMin),
      criticalMax: toNumber(meta.critical_max ?? meta.criticalMax),
      dataType: meta.dataType,
      required: meta.required,
      options: meta.options || undefined,
    };
  });
};

/**
 * Build a field template for result entry. Drops the generic "Result" alias row when
 * a single-analyte template also exposes its specific parameter (avoids duplicate rows).
 */
export const buildEntryTemplate = (
  code: string,
  normalRange: Record<string, any> | undefined | null
): { name: string; fields: TemplateField[] } | undefined => {
  const all = getOrderedTemplateFields(normalRange);
  if (!all.length) return undefined;

  const normalize = (f: TemplateField) =>
    JSON.stringify({ unit: f.unit.toLowerCase(), range: f.normalRange.toLowerCase() });

  const hasResult = all.some((f) => f.name === 'Result');
  let fields = all;
  if (hasResult && all.length > 1) {
    const resultKey = normalize(all.find((f) => f.name === 'Result')!);
    const aliasTarget = all.find((f) => f.name !== 'Result' && normalize(f) === resultKey);
    if (aliasTarget) {
      fields = all.filter((f) => f.name !== 'Result');
    }
  }
  return { name: code, fields };
};

/**
 * Classify a typed value against a template field.
 *
 *   value missing / blank / non-numeric / text-type → 'Normal' (no flag)
 *   value < critical_min or > critical_max          → 'Critical'
 *   value < min or > max                             → 'Abnormal'
 *   otherwise                                        → 'Normal'
 *
 * Templates without a critical tier simply never produce 'Critical'.
 */
export const classifyValue = (
  rawValue: string | number | undefined | null,
  field: Pick<TemplateField, 'min' | 'max' | 'criticalMin' | 'criticalMax' | 'dataType'>
): ResultStatus => {
  if (rawValue === null || rawValue === undefined) return 'Normal';
  const valueStr = String(rawValue).trim();
  if (!valueStr) return 'Normal';
  if (field.dataType && field.dataType.toLowerCase() === 'text') return 'Normal';

  // Use parseFloat (not Number) so trailing units/text like "140 mg/dL", "7.8 mmol/L"
  // still classify against the numeric portion. Number() would silently return NaN
  // and fall through to "Normal", masking out-of-range values when users append units.
  const numValue = parseFloat(valueStr);
  if (!Number.isFinite(numValue)) return 'Normal';

  if (
    (field.criticalMin !== undefined && numValue < field.criticalMin) ||
    (field.criticalMax !== undefined && numValue > field.criticalMax)
  ) {
    return 'Critical';
  }

  if (
    (field.min !== undefined && numValue < field.min) ||
    (field.max !== undefined && numValue > field.max)
  ) {
    return 'Abnormal';
  }

  return 'Normal';
};

/** Find the `AnalyteMeta` for a parameter key, case/whitespace-insensitive. */
export const resolveAnalyteMeta = (
  parameterName: string,
  normalRange: Record<string, any> | undefined | null
): { key: string; meta: AnalyteMeta } | null => {
  if (!normalRange || typeof normalRange !== 'object') return null;
  const normalizeKey = (s: string) => s.replace(/[\s\u00A0]+/g, ' ').trim().toLowerCase();
  const wanted = normalizeKey(String(parameterName || ''));
  if (!wanted) return null;
  for (const [k, v] of Object.entries(normalRange)) {
    if (k.startsWith('_')) continue;
    if (normalizeKey(k) === wanted) return { key: k, meta: v as AnalyteMeta };
  }
  return null;
};

/** Build a `TemplateField` for a specific saved-result key using the template metadata. */
export const fieldForParameter = (
  parameterName: string,
  normalRange: Record<string, any> | undefined | null
): TemplateField | null => {
  const resolved = resolveAnalyteMeta(parameterName, normalRange);
  if (!resolved) return null;
  return {
    name: resolved.key,
    unit: String(resolved.meta.unit ?? '').trim(),
    normalRange: getNormalRangeText(resolved.meta),
    min: toNumber(resolved.meta.min ?? resolved.meta.normalRangeMin),
    max: toNumber(resolved.meta.max ?? resolved.meta.normalRangeMax),
    criticalMin: toNumber(resolved.meta.critical_min ?? resolved.meta.criticalMin),
    criticalMax: toNumber(resolved.meta.critical_max ?? resolved.meta.criticalMax),
    dataType: resolved.meta.dataType,
    required: resolved.meta.required,
    options: resolved.meta.options || undefined,
  };
};

/**
 * Sort an array of result rows by the template `_order`. Unknown keys (legacy data,
 * free-text) are appended alphabetically at the end so they remain visible.
 */
export const orderResultRows = <T extends { parameter: string }>(
  rows: T[],
  normalRange: Record<string, any> | undefined | null
): T[] => {
  if (!rows.length) return rows;

  const explicitOrder: string[] = Array.isArray(normalRange?._order)
    ? ((normalRange as any)._order as any[]).filter((k): k is string => typeof k === 'string')
    : [];

  const normalize = (s: string) => s.replace(/[\s\u00A0]+/g, ' ').trim().toLowerCase();
  const orderIndex = new Map<string, number>();
  explicitOrder.forEach((k, i) => orderIndex.set(normalize(k), i));

  return [...rows].sort((a, b) => {
    const ai = orderIndex.get(normalize(a.parameter));
    const bi = orderIndex.get(normalize(b.parameter));
    if (ai !== undefined && bi !== undefined) return ai - bi;
    if (ai !== undefined) return -1;
    if (bi !== undefined) return 1;
    return a.parameter.localeCompare(b.parameter);
  });
};

/**
 * Return a list of dropdown options for a field, or null if the field should use a
 * free-text Input. Works for ALL template fields — matched by name, by range pattern,
 * or by explicit lookup in a curated map.
 */
const _nameOptions: Record<string, string[]> = {
  // Urinalysis
  'Colour': ['Amber', 'Deep Amber', 'Pale Amber', 'Straw'],
  'Appearance': ['Clear', 'Turbid', 'Slightly Turbid', 'Cloudy', 'Slightly Cloudy'],
  'pH': ['1.0','1.5','2.0','2.5','3.0','3.5','4.0','4.5','5.0','5.5','6.0','6.5','7.0','7.5','8.0'],
  'Specific Gravity': ['1.000','1.005','1.010','1.015','1.020','1.025','1.030'],
  'Nitrite': ['NEGATIVE', 'POSITIVE'],
  'Glucose': ['NORMAL','NEGATIVE','TRACE','+','++','+++','++++'],
  'Ketone': ['NORMAL','NEGATIVE','TRACE','+','++','+++','++++'],
  'Proteins': ['NORMAL','NEGATIVE','TRACE','+','++','+++','++++'],
  'Bilirubin': ['NORMAL','NEGATIVE','TRACE','+','++','+++','++++'],
  'Urobilinogen': ['NORMAL','NEGATIVE','TRACE','+','++','+++','++++'],
  'Blood': ['NORMAL','NEGATIVE','TRACE','+','++','+++','++++'],
  'Leucocytes': ['NORMAL','NEGATIVE','TRACE','+','++','+++','++++'],
  'Ascorbic Acid': ['NORMAL','NEGATIVE','TRACE','+','++','+++','++++'],
  // Blood group / genotype
  'Blood Group': ['A+','A-','B+','B-','O+','O-','AB+','AB-'],
  'Rhesus': ['POSITIVE', 'NEGATIVE'],
  'Genotype': ['AA', 'AS', 'SS', 'AC', 'SC'],
  // Microscopy / qualitative
  'Pus Cells': ['NONE', 'FEW', 'MODERATE', 'MANY'],
  'Epithelial Cell': ['NONE', 'FEW', 'MODERATE', 'MANY'],
  'RBCs': ['NONE', 'FEW', 'MODERATE', 'MANY'],
  'Mucus': ['NONE', 'TRACE', '+', '++', '+++'],
  'Bacteria': ['Not Seen', 'Few', 'Moderate', 'Many'],
  'Yeast Cells': ['Not Seen', 'Seen'],
  'Cast/Crystals': ['Not Seen', 'Seen'],
  'Fungal Elements': ['Not Seen', 'Seen'],
  'Ova': ['Not Seen', 'Seen'],
  'Cyst': ['Not Seen', 'Seen'],
  'Parasites': ['Not Seen', 'Seen'],
  'Other Parasites': ['Not Seen', 'Seen'],
  'Gram Stain': ['No Organisms Seen', 'Gram Positive Cocci', 'Gram Negative Bacilli', 'Gram Positive Bacilli', 'Gram Negative Cocci', 'Mixed Growth'],
  // Stool
  'Others': [], // free-text, explicitly empty
  // Noble Cup / Drug Screen (toxicology)
  'AMPHETAMINE (AMP)': ['NEGATIVE', 'POSITIVE'],
  'BARBITURATES (BAR)': ['NEGATIVE', 'POSITIVE'],
  'TRICYCLIC ANTIDEPRESANTS (TCA)': ['NEGATIVE', 'POSITIVE'],
  'COCAINE (COC)': ['NEGATIVE', 'POSITIVE'],
  'BENZODIAZEPINE (BZO)': ['NEGATIVE', 'POSITIVE'],
  'OPIATE (OPI)': ['NEGATIVE', 'POSITIVE'],
  'METHAMPHETAMINE (MET)': ['NEGATIVE', 'POSITIVE'],
  'MARIJUANA (THC)': ['NEGATIVE', 'POSITIVE'],
  'ECSTASY (MDMA)': ['NEGATIVE', 'POSITIVE'],
  'TRAMADOL (TML)': ['NEGATIVE', 'POSITIVE'],
  // Pregnancy
  'hCG': ['NEGATIVE', 'POSITIVE'],
  // H. Pylori
  'H. Pylori AB': ['NEGATIVE', 'POSITIVE'],
  'H. Pylori AG': ['NEGATIVE', 'POSITIVE'],
  // Serology
  'HBsAg': ['Non-Reactive', 'Reactive', 'Indeterminate'],
  'HCV': ['Non-Reactive', 'Reactive', 'Indeterminate'],
  'HIV 1/2': ['Non-Reactive', 'Reactive', 'Indeterminate'],
  'VDRL': ['Non-Reactive', 'Reactive', 'Indeterminate'],
  // Haemoglobin Genotype
  'HB Genotype': ['AA', 'AS', 'SS', 'AC', 'SC'],
};

const _rangePatterns: [RegExp, string[]][] = [
  [/S \/ I \/ R \/ NT/i, ['S', 'I', 'R', 'NT']],
  [/(POSITIVE|NEGATIVE)/i, ['NEGATIVE', 'POSITIVE']],
  [/(Non-Reactive|Non-reactive|Non reactive)/i, ['Non-Reactive', 'Reactive', 'Indeterminate']],
  [/(Negative\/Positive|Negative\/positive|neg.*pos)/i, ['NEGATIVE', 'POSITIVE']],
  [/(Detected|Not Detected|Not detected)/i, ['Not Detected', 'Detected']],
];

export function getFieldOptions(field: TemplateField): string[] | null {
  if (field.dataType && field.dataType.toLowerCase() !== 'text') return null;

  if (field.options) return field.options;

  const nameHit = _nameOptions[field.name];
  if (nameHit) return nameHit.length > 0 ? nameHit : null;

  const range = field.normalRange || '';
  for (const [pattern, options] of _rangePatterns) {
    if (pattern.test(range)) return options;
  }

  return null;
}

/** Worst-of: Critical > Abnormal > Normal. */
export const deriveOverallStatus = (
  rows: { status: ResultStatus }[]
): ResultStatus => {
  if (rows.some((r) => r.status === 'Critical')) return 'Critical';
  if (rows.some((r) => r.status === 'Abnormal')) return 'Abnormal';
  return 'Normal';
};

/** One row for lab report tables / history strings (matches CompletedTestResultRow / verification TestResult). */
export interface LabViewRow {
  parameter: string;
  value: string;
  unit: string;
  normalRange: string;
  status: ResultStatus;
  attachment?: { url: string; name: string } | null;
}

export interface BuildOrderedLabRowsOptions {
  resultAttachments?: any[];
  /** Turn a stored media path into an absolute URL (callers pass API/window origin logic). */
  resolveFileUrl?: (raw: string) => string;
  attachmentDisplayName?: (url: string) => string;
}

const defaultAttachmentDisplayName = (url: string): string => {
  try {
    return decodeURIComponent(url.split('?')[0].split('/').filter(Boolean).pop() || 'attachment');
  } catch {
    return 'attachment';
  }
};

/**
 * Canonical pipeline: same rules as backend `download_report` and PDF row builder —
 * non-empty `custom_results` → only those rows; otherwise all keys except `custom_results`;
 * unwrap `{ value }` cells; classify; dedupe `Result` alias; sort by template `_order`.
 */
export function buildOrderedLabResultViewRows(
  resultPayload: Record<string, any> | null | undefined,
  normalRange: Record<string, any> | null | undefined,
  options?: BuildOrderedLabRowsOptions
): LabViewRow[] {
  const nr = normalRange;
  const payload =
    resultPayload && typeof resultPayload === 'object' && !Array.isArray(resultPayload)
      ? resultPayload
      : {};

  const customList = payload.custom_results;
  const useCustomOnly = Array.isArray(customList) && customList.length > 0;

  const attachmentsByRowId = new Map<string, any>();
  const attachmentsByRowName = new Map<string, any>();
  (options?.resultAttachments || []).forEach((attachment: any) => {
    if (attachment?.row_id) attachmentsByRowId.set(String(attachment.row_id), attachment);
    if (attachment?.row_name) {
      attachmentsByRowName.set(String(attachment.row_name).trim().toLowerCase(), attachment);
    }
  });

  const toAbs = options?.resolveFileUrl ?? ((u: string) => u);
  const nameFromUrl = options?.attachmentDisplayName ?? defaultAttachmentDisplayName;

  let processed: LabViewRow[] = [];

  if (useCustomOnly) {
    processed = customList.flatMap((row: any) => {
      if (
        !row ||
        (!row.name && !row.value && !row.unit && !row.reference_range && !row.notes)
      ) {
        return [];
      }
      const rowId = String(row.id || '');
      const parameter = String(row.name || 'Custom Result');
      const attachment =
        attachmentsByRowId.get(rowId) ||
        attachmentsByRowName.get(parameter.trim().toLowerCase());
      const rawFile = attachment?.file ? String(attachment.file) : '';
      const attachmentUrl = rawFile ? toAbs(rawFile) : '';
      const noteSuffix = row.notes ? ` — ${String(row.notes)}` : '';
      const out: LabViewRow = {
        parameter,
        value: `${String(row.value || '')}${noteSuffix}`,
        unit: String(row.unit || ''),
        normalRange: String(row.reference_range || ''),
        status: 'Normal',
        attachment: attachmentUrl ? { url: attachmentUrl, name: nameFromUrl(attachmentUrl) } : null,
      };
      return [out];
    });
  } else {
    processed = Object.entries(payload)
      .filter(([key]) => key !== 'custom_results')
      .map(([key, value]) => {
        const valueStr = coerceStoredResultValue(value);
        const field = fieldForParameter(key, nr);

        let unit = '';
        let normalRange = '';
        let status: ResultStatus = 'Normal';

        if (field) {
          unit = field.unit;
          normalRange = field.normalRange;
          status = classifyValue(valueStr, field);
        } else if (valueStr.trim()) {
          const normalized = valueStr.toLowerCase();
          if (normalized.includes('critical')) status = 'Critical';
          else if (normalized.includes('abnormal')) status = 'Abnormal';
        }

        const out: LabViewRow = {
          parameter: key,
          value: valueStr,
          unit,
          normalRange,
          status,
          attachment: null,
        };
        return out;
      });
  }

  const deduped = (() => {
    const generic = processed.find((r) => String(r.parameter).trim().toLowerCase() === 'result');
    if (!generic) return processed;
    const hasEquivalentSpecific = processed.some(
      (r) =>
        String(r.parameter).trim().toLowerCase() !== 'result' &&
        String(r.value).trim() === String(generic.value).trim() &&
        String(r.unit).trim().toLowerCase() === String(generic.unit).trim().toLowerCase() &&
        String(r.normalRange).trim().toLowerCase() === String(generic.normalRange).trim().toLowerCase()
    );
    if (!hasEquivalentSpecific) return processed;
    return processed.filter((r) => String(r.parameter).trim().toLowerCase() !== 'result');
  })();

  return orderResultRows(deduped, nr);
}
