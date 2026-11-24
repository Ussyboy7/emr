/** Session statuses surfaced by consultation history, detail and report views. */
export type ConsultationDisplayStatus = 'Completed' | 'In Progress' | 'Paused' | 'Cancelled';

/**
 * Map an API session status to the label shown in consultation views.
 *
 * Paused and cancelled sessions are real states; collapsing them into
 * "In Progress" both misreports the record and re-enables edit / complete
 * actions that would reactivate the session.
 */
export function consultationDisplayStatus(
  status: string | null | undefined,
): ConsultationDisplayStatus {
  switch (String(status ?? '').trim().toLowerCase()) {
    case 'completed':
      return 'Completed';
    case 'cancelled':
      return 'Cancelled';
    case 'paused':
      return 'Paused';
    default:
      return 'In Progress';
  }
}
