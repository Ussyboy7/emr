/** Human-readable visit type label for UI badges and biodata. */
export function formatVisitTypeLabel(type: string | null | undefined): string {
  if (!type) return '';
  const typeMap: Record<string, string> = {
    consultation: 'Consultation',
    follow_up: 'Follow-up',
    emergency: 'Emergency',
    routine: 'Routine Checkup',
    annual_checkup: 'Annual Check-up',
    nursing_procedure: 'Nursing Procedure',
    responsility_form: 'Responsility Form',
    responsibility_form: 'Responsibility Form',
  };
  return (
    typeMap[type] ||
    type.charAt(0).toUpperCase() + type.slice(1).replace(/_/g, '-')
  );
}

/** Tailwind classes for visit type outline badges. */
export function getVisitTypeBadgeClass(type: string | null | undefined): string {
  const styles: Record<string, string> = {
    consultation: 'border-teal-500/50 text-teal-600 dark:text-teal-400',
    follow_up: 'border-blue-500/50 text-blue-600 dark:text-blue-400',
    emergency: 'border-rose-500/50 text-rose-600 dark:text-rose-400',
    routine: 'border-violet-500/50 text-violet-600 dark:text-violet-400',
    annual_checkup: 'border-amber-500/50 text-amber-600 dark:text-amber-400',
    nursing_procedure: 'border-rose-500/50 text-rose-600 dark:text-rose-400',
    responsility_form: 'border-yellow-500/50 text-yellow-600 dark:text-yellow-400',
    responsibility_form: 'border-yellow-500/50 text-yellow-600 dark:text-yellow-400',
  };
  return styles[type || ''] || 'border-muted-foreground/50 text-muted-foreground';
}
