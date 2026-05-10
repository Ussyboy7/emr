/**
 * Shared helpers for rendering and classifying lab test results from the canonical
 * `normal_range` template (seeded by `laboratory/management/commands/seed_lab_templates.py`).
 *
 * A single source of truth used by:
 *  - Result entry (`app/laboratory/orders/page.tsx`)
 *  - Result verification (`app/laboratory/verification/page.tsx`)
 *  - Completed lab report (`lib/laboratory/completedLabReport.ts`)
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
}

const toNumber = (value: unknown): number | undefined => {
  if (value === undefined || value === null) return undefined;
  const s = String(value).trim();
  if (!s) return undefined;
  const n = Number(s);
  return Number.isNaN(n) ? undefined : n;
};

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

/** Worst-of: Critical > Abnormal > Normal. */
export const deriveOverallStatus = (
  rows: { status: ResultStatus }[]
): ResultStatus => {
  if (rows.some((r) => r.status === 'Critical')) return 'Critical';
  if (rows.some((r) => r.status === 'Abnormal')) return 'Abnormal';
  return 'Normal';
};
