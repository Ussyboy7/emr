"use client";

import { Icd10DiagnosesBlock } from '@/components/medical/Icd10DiagnosesBlock';
import {
  orderDiagnosesToIcd10Rows,
  parseOrderDiagnosisTextToRows,
  type OrderDiagnosisEntry,
} from '@/lib/consultation/order-diagnoses';

type OrderDiagnosesBlockProps = {
  diagnosisText?: string | null;
  diagnoses?: OrderDiagnosisEntry[];
  compact?: boolean;
  className?: string;
  onRemove?: (index: number) => void;
  emptyMessage?: string;
};

export function OrderDiagnosesBlock({
  diagnosisText,
  diagnoses,
  compact,
  className,
  onRemove,
  emptyMessage,
}: OrderDiagnosesBlockProps) {
  const rows = diagnoses?.length
    ? orderDiagnosesToIcd10Rows(diagnoses)
    : parseOrderDiagnosisTextToRows(diagnosisText || '');

  return (
    <Icd10DiagnosesBlock
      diagnoses={rows}
      compact={compact}
      className={className}
      onRemove={onRemove}
      emptyMessage={emptyMessage}
    />
  );
}
