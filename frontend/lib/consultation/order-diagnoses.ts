export type OrderDiagnosisType = 'Primary' | 'Secondary' | 'Differential';

export type OrderDiagnosisEntry = {
  type: OrderDiagnosisType;
  code: string;
  description: string;
};

const TYPE_PREFIX_RE = /^\[(Primary|Secondary|Differential)\]\s*/i;

export function formatOrderDiagnosisEntry(entry: OrderDiagnosisEntry): string {
  return `[${entry.type}] ${entry.code} - ${entry.description}`;
}

export function formatOrderDiagnoses(entries: OrderDiagnosisEntry[]): string {
  return entries.map(formatOrderDiagnosisEntry).join('\n');
}

export function orderDiagnosesToIcd10Rows(
  entries: OrderDiagnosisEntry[],
): { code: string; name: string; type: string }[] {
  return entries.map((e) => ({
    code: e.code,
    name: e.description,
    type: e.type,
  }));
}

export function parseOrderDiagnosisTextToRows(raw: string): { code: string; name: string; type: string }[] {
  return orderDiagnosesToIcd10Rows(parseOrderDiagnoses(raw));
}

function splitDiagnosisChunks(text: string): string[] {
  if (text.includes('\n')) {
    return text.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  }
  if (/\[(?:Primary|Secondary|Differential)\]/i.test(text)) {
    return text
      .split(/(?=\[(?:Primary|Secondary|Differential)\]\s*)/i)
      .map((l) => l.trim())
      .filter(Boolean);
  }
  return [text];
}

export function parseOrderDiagnoses(raw: string): OrderDiagnosisEntry[] {
  const text = (raw || '').trim();
  if (!text) return [];

  const lines = splitDiagnosisChunks(text);
  const parsed: OrderDiagnosisEntry[] = [];

  for (const line of lines) {
    const typeMatch = line.match(TYPE_PREFIX_RE);
    if (typeMatch) {
      const type = typeMatch[1] as OrderDiagnosisType;
      const rest = line.slice(typeMatch[0].length).trim();
      const dashIdx = rest.indexOf(' - ');
      if (dashIdx > 0) {
        parsed.push({
          type,
          code: rest.slice(0, dashIdx).trim(),
          description: rest.slice(dashIdx + 3).trim(),
        });
        continue;
      }
      parsed.push({ type, code: '', description: rest });
      continue;
    }

    const dashIdx = line.indexOf(' - ');
    if (dashIdx > 0) {
      parsed.push({
        type: 'Primary',
        code: line.slice(0, dashIdx).trim(),
        description: line.slice(dashIdx + 3).trim(),
      });
      continue;
    }

    parsed.push({ type: 'Primary', code: '', description: line });
  }

  return parsed;
}

export function orderDiagnosisEntryKey(entry: OrderDiagnosisEntry): string {
  return `${entry.type}:${entry.code}:${entry.description}`;
}

export function getOrderDiagnosisSummary(input: {
  diagnosisText?: string | null;
  diagnoses?: OrderDiagnosisEntry[];
  fallbackTitle?: string;
}): { title: string; extraCount: number } {
  const count = countOrderDiagnoses(input);
  if (count === 0) {
    return { title: input.fallbackTitle || 'Clinical order', extraCount: 0 };
  }
  const entries = input.diagnoses?.length
    ? input.diagnoses
    : parseOrderDiagnoses(input.diagnosisText || '');
  const primary = entries.find((e) => e.type === 'Primary') || entries[0];
  const title = primary.code
    ? `${primary.code} — ${primary.description}`
    : primary.description || input.fallbackTitle || 'Clinical order';
  return { title, extraCount: Math.max(0, entries.length - 1) };
}

export function countOrderDiagnoses(input: {
  diagnosisText?: string | null;
  diagnoses?: OrderDiagnosisEntry[];
}): number {
  if (input.diagnoses?.length) return input.diagnoses.length;
  return parseOrderDiagnoses(input.diagnosisText || '').length;
}

export function validateOrderDiagnoses(entries: OrderDiagnosisEntry[]): string | null {
  if (entries.length === 0) {
    return 'Add at least one ICD-10 diagnosis';
  }
  if (!entries.some((e) => e.type === 'Primary')) {
    return 'At least one Primary diagnosis is required';
  }
  return null;
}

export const ORDER_DIAGNOSIS_TYPE_OPTIONS: {
  value: OrderDiagnosisType;
  label: string;
  dotClass: string;
}[] = [
  { value: 'Primary', label: 'Primary - Main diagnosis', dotClass: 'bg-rose-500' },
  { value: 'Secondary', label: 'Secondary - Contributing condition', dotClass: 'bg-amber-500' },
  { value: 'Differential', label: 'Differential - Possible diagnosis', dotClass: 'bg-blue-500' },
];
