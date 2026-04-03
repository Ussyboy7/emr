'use client';

import { Badge } from '@/components/ui/badge';
import { Stethoscope } from 'lucide-react';

export interface Icd10DiagnosisRow {
  code: string;
  name: string;
  type: string;
  notes?: string;
}

export interface Icd10DiagnosesBlockProps {
  diagnoses?: Icd10DiagnosisRow[] | null;
  className?: string;
  /** Smaller padding for dense dialogs (lab/radiology manage order). */
  compact?: boolean;
}

export function Icd10DiagnosesBlock({ diagnoses, className = '', compact }: Icd10DiagnosesBlockProps) {
  const rows = (diagnoses || []).filter((d) => d && (d.code || d.name));
  if (rows.length === 0) return null;

  const cell = compact ? 'p-2' : 'p-3';

  return (
    <div
      className={`rounded-lg border border-red-200 dark:border-red-900/50 bg-red-50/80 dark:bg-red-950/25 ${className}`}
    >
      <div className={`flex items-center gap-2 ${compact ? 'px-2 pt-2' : 'px-3 pt-3'} pb-1`}>
        <Stethoscope className="h-4 w-4 text-red-600 dark:text-red-400 shrink-0" />
        <span className="text-xs font-semibold text-red-800 dark:text-red-300 uppercase tracking-wide">
          Diagnosis (ICD-10)
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-t border-red-200/80 dark:border-red-900/40 bg-red-100/50 dark:bg-red-950/40">
              <th className={`text-left ${cell} font-medium text-red-900 dark:text-red-200`}>ICD-10</th>
              <th className={`text-left ${cell} font-medium text-red-900 dark:text-red-200`}>Diagnosis</th>
              <th className={`text-center ${cell} font-medium text-red-900 dark:text-red-200`}>Type</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((d, i) => (
              <tr key={`${d.code}-${i}`} className="border-t border-red-200/60 dark:border-red-900/30">
                <td className={`${cell} font-mono text-xs text-red-900 dark:text-red-100`}>{d.code || ''}</td>
                <td className={`${cell} text-red-950 dark:text-red-50`}>
                  <div className="font-medium">{d.name || ''}</div>
                  {d.notes?.trim() ? (
                    <div className="text-xs text-muted-foreground mt-0.5">{d.notes}</div>
                  ) : null}
                </td>
                <td className={`${cell} text-center`}>
                  <Badge
                    variant="outline"
                    className={`text-[10px] ${
                      d.type === 'Primary'
                        ? 'bg-red-500/15 text-red-700 border-red-500/35 dark:text-red-300'
                        : d.type === 'Secondary'
                          ? 'bg-amber-500/15 text-amber-800 border-amber-500/35 dark:text-amber-300'
                          : 'bg-blue-500/15 text-blue-800 border-blue-500/35 dark:text-blue-300'
                    }`}
                  >
                    {d.type}
                  </Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
