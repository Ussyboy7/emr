import type { ComplianceStatus } from '@/lib/services/hr-service';

export function formatComplianceStatus(status: string): string {
  return String(status || '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function complianceStatusBadgeClass(status: ComplianceStatus | string): string {
  const styles: Record<string, string> = {
    completed: 'border-emerald-500/50 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10',
    in_progress: 'border-blue-500/50 text-blue-600 dark:text-blue-400 bg-blue-500/10',
    exempt: 'border-slate-500/50 text-slate-600 dark:text-slate-400 bg-slate-500/10',
    due: 'border-amber-500/50 text-amber-600 dark:text-amber-400 bg-amber-500/10',
    overdue: 'border-rose-500/50 text-rose-600 dark:text-rose-400 bg-rose-500/10',
  };
  return styles[status] || 'border-violet-500/50 text-violet-600 dark:text-violet-400 bg-violet-500/10';
}

export function complianceStatusBorderClass(status: ComplianceStatus | string): string {
  switch (status) {
    case 'completed':
      return 'border-l-emerald-500';
    case 'in_progress':
      return 'border-l-blue-500';
    case 'exempt':
      return 'border-l-slate-500';
    case 'due':
      return 'border-l-amber-500';
    case 'overdue':
      return 'border-l-rose-500';
    default:
      return 'border-l-violet-500';
  }
}

export function exemptionReasonBadgeClass(_reason?: string): string {
  return 'border-violet-500/50 text-violet-600 dark:text-violet-400 bg-violet-500/10';
}

export function employeeInitials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

export function complianceAvatarClasses(
  status: ComplianceStatus | string
): { bg: string; text: string } {
  switch (status) {
    case 'completed':
      return {
        bg: 'bg-emerald-100 dark:bg-emerald-900/30',
        text: 'text-emerald-600 dark:text-emerald-400',
      };
    case 'in_progress':
      return {
        bg: 'bg-blue-100 dark:bg-blue-900/30',
        text: 'text-blue-600 dark:text-blue-400',
      };
    case 'exempt':
      return {
        bg: 'bg-slate-100 dark:bg-slate-900/30',
        text: 'text-slate-600 dark:text-slate-400',
      };
    case 'due':
      return {
        bg: 'bg-amber-100 dark:bg-amber-900/30',
        text: 'text-amber-600 dark:text-amber-400',
      };
    case 'overdue':
      return {
        bg: 'bg-rose-100 dark:bg-rose-900/30',
        text: 'text-rose-600 dark:text-rose-400',
      };
    default:
      return {
        bg: 'bg-violet-100 dark:bg-violet-900/30',
        text: 'text-violet-600 dark:text-violet-400',
      };
  }
}

export function complianceOutcomeBadgeClass(status: ComplianceStatus | string): string {
  if (status === 'completed') {
    return 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400';
  }
  if (status === 'exempt') {
    return 'bg-slate-500/10 border-slate-500/30 text-slate-600 dark:text-slate-400';
  }
  return 'bg-violet-500/10 border-violet-500/30 text-violet-600 dark:text-violet-400';
}
