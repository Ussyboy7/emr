/**
 * Consultation queue ordering and visit-type display.
 *
 * Queue order: FIFO by time sent to room (`queued_at`). Only emergency visits
 * may jump ahead. Visit type is shown as an informational badge — not as
 * High/Medium/Low queue priority.
 */

export type PriorityLevel = 'Emergency' | 'High' | 'Medium' | 'Low';

export type QueueSortable = {
  priority?: number | string;
  queued_at: string;
  visit_type?: string | null;
};

const VISIT_TYPE_LABELS: Record<string, string> = {
  consultation: 'Consultation',
  follow_up: 'Follow-up',
  emergency: 'Emergency',
  routine: 'Routine checkup',
  annual_checkup: 'Annual check-up',
  nursing_procedure: 'Nursing procedure',
  responsibility_form: 'Responsibility form',
};

export function normalizeVisitTypeKey(visitType?: string | null): string {
  return (visitType || 'consultation').toLowerCase().replace(/-/g, '_');
}

export function isEmergencyVisitType(visitType?: string | null): boolean {
  return normalizeVisitTypeKey(visitType) === 'emergency';
}

/** True when the row should be treated as emergency in queue ordering. */
export function isEmergencyQueueEntry(item: QueueSortable): boolean {
  if (isEmergencyVisitType(item.visit_type)) return true;
  const p =
    typeof item.priority === 'number'
      ? item.priority
      : parseInt(String(item.priority ?? ''), 10);
  return p === 0;
}

/**
 * Sort: emergency first (by queued_at), then everyone else FIFO by queued_at.
 * Ignores legacy follow-up / consultation priority numbers on existing rows.
 */
export function compareConsultationQueueEntries(a: QueueSortable, b: QueueSortable): number {
  const aEmer = isEmergencyQueueEntry(a);
  const bEmer = isEmergencyQueueEntry(b);
  if (aEmer !== bEmer) return aEmer ? -1 : 1;
  return new Date(a.queued_at).getTime() - new Date(b.queued_at).getTime();
}

/** Priority stored on new queue rows: 0 = emergency, 1 = normal FIFO tier. */
export function getQueuePriorityFromVisitType(visitType: string): number {
  return isEmergencyVisitType(visitType) ? 0 : 1;
}

/** @deprecated Use getQueuePriorityFromVisitType */
export function getPriorityFromVisitType(visitType: string): number {
  return getQueuePriorityFromVisitType(visitType);
}

export function getVisitTypeLabel(visitType?: string | null): string {
  const key = normalizeVisitTypeKey(visitType);
  if (VISIT_TYPE_LABELS[key]) return VISIT_TYPE_LABELS[key];
  return key
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export function getVisitTypeBadgeClass(visitType?: string | null): string {
  const key = normalizeVisitTypeKey(visitType);
  switch (key) {
    case 'emergency':
      return 'border-rose-500/50 text-rose-600 dark:text-rose-400 bg-rose-500/10';
    case 'follow_up':
      return 'border-blue-500/50 text-blue-600 dark:text-blue-400 bg-blue-500/10';
    case 'routine':
    case 'annual_checkup':
      return 'border-violet-500/50 text-violet-600 dark:text-violet-400 bg-violet-500/10';
    case 'consultation':
      return 'border-teal-500/50 text-teal-600 dark:text-teal-400 bg-teal-500/10';
    default:
      return 'border-muted-foreground/50 text-muted-foreground bg-muted/30';
  }
}

/** @deprecated Display visit type instead. Kept for legacy rows / other modules. */
export function getPriorityLabel(priorityNum: number): PriorityLevel {
  if (priorityNum === 0) return 'Emergency';
  if (priorityNum === 1) return 'High';
  if (priorityNum === 2) return 'Medium';
  return 'Low';
}

/** @deprecated Use getVisitTypeBadgeClass for consultation queue UI. */
export function getPriorityColor(priority: PriorityLevel | number): string {
  const priorityLabel = typeof priority === 'number' ? getPriorityLabel(priority) : priority;

  switch (priorityLabel) {
    case 'Emergency':
      return 'bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-400';
    case 'High':
      return 'bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-900/30 dark:text-orange-400';
    case 'Medium':
      return 'bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-400';
    case 'Low':
      return 'bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-400';
    default:
      return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300';
  }
}
