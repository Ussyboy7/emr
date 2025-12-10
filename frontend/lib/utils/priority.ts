/**
 * Priority utility functions for consultation queue
 * 
 * IMPORTANT: Priority is automatically derived from visit_type - users do NOT select priority manually.
 * When creating a visit, users only select visit_type (emergency, consultation, follow_up, routine).
 * Priority is automatically calculated when adding the patient to the consultation queue.
 * 
 * Priority is an integer where lower number = higher priority:
 * - 0 = Emergency (highest priority)
 * - 1 = High
 * - 2 = Medium
 * - 3 = Low (lowest priority)
 * 
 * This ensures consistent queue ordering based on visit urgency without requiring
 * users to manually set priority, which could lead to inconsistencies.
 */

export type PriorityLevel = 'Emergency' | 'High' | 'Medium' | 'Low';
export type VisitType = 'emergency' | 'consultation' | 'follow_up' | 'routine';

/**
 * Map visit type to priority number
 * 
 * This function automatically converts visit_type (selected at visit creation) to
 * a numeric priority for the consultation queue. No manual priority selection needed.
 * 
 * Lower number = higher priority
 * 
 * @param visitType - The visit type from the Visit model (emergency, consultation, follow_up, routine)
 * @returns Priority number (0-3) for consultation queue ordering
 */
export function getPriorityFromVisitType(visitType: string): number {
  const normalizedType = visitType.toLowerCase();
  
  switch (normalizedType) {
    case 'emergency':
      return 0; // Highest priority
    case 'follow_up':
    case 'follow-up':
      return 1; // High priority
    case 'consultation':
      return 2; // Medium priority (default)
    case 'routine':
    default:
      return 3; // Low priority
  }
}

/**
 * Map priority number to display string
 */
export function getPriorityLabel(priorityNum: number): PriorityLevel {
  if (priorityNum === 0) return 'Emergency';
  if (priorityNum === 1) return 'High';
  if (priorityNum === 2) return 'Medium';
  return 'Low';
}

/**
 * Get priority color classes for badges
 */
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

