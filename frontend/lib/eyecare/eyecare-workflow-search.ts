export type EyecareOrdersTab = 'pending' | 'in_progress' | 'cancelled' | 'completed' | 'all';

export const EYECARE_ORDERS_TAB_ORDER: EyecareOrdersTab[] = [
  'pending',
  'in_progress',
  'cancelled',
  'completed',
  'all',
];

export const EYECARE_ORDERS_TAB_LABELS: Record<EyecareOrdersTab, string> = {
  pending: 'Pending',
  in_progress: 'In Progress',
  cancelled: 'Cancelled',
  completed: 'Completed',
  all: 'All',
};

export type EyecareOrderLike = {
  status?: string;
};

export function orderMatchesEyecareOrdersTab(order: EyecareOrderLike, tab: EyecareOrdersTab): boolean {
  const status = order.status || '';
  if (tab === 'all') return true;
  if (tab === 'pending') return status === 'pending' || status === 'scheduled';
  if (tab === 'in_progress') return status === 'in_progress';
  if (tab === 'cancelled') return status === 'cancelled';
  if (tab === 'completed') return status === 'completed';
  return false;
}

export function findEyecareOrdersTabForOrders(orders: EyecareOrderLike[]): EyecareOrdersTab | null {
  for (const tab of EYECARE_ORDERS_TAB_ORDER) {
    if (orders.some((o) => orderMatchesEyecareOrdersTab(o, tab))) {
      return tab;
    }
  }
  return null;
}

export function isValidEyecareOrdersTab(value: string | null): value is EyecareOrdersTab {
  return value != null && EYECARE_ORDERS_TAB_ORDER.includes(value as EyecareOrdersTab);
}

export function buildEyecareOrdersHref(search?: string, tab?: EyecareOrdersTab): string {
  const params = new URLSearchParams();
  if (search?.trim()) params.set('search', search.trim());
  if (tab && tab !== 'pending') params.set('tab', tab);
  const qs = params.toString();
  return qs ? `/eyecare/orders?${qs}` : '/eyecare/orders';
}

export function buildEyecareCompletedHref(search?: string): string {
  const params = new URLSearchParams();
  if (search?.trim()) params.set('search', search.trim());
  params.set('date', 'all');
  const qs = params.toString();
  return `/eyecare/completed?${qs}`;
}

/** Search token for orders workflow (patient ID or EYE-######). */
export function eyecareSearchTermForOrder(order: { id: number; patient_id?: string | null }): string {
  const patientId = order.patient_id?.trim();
  if (patientId) return patientId;
  return `EYE-${String(order.id).padStart(6, '0')}`;
}

export function eyecareOrdersTabForStatus(status?: string): EyecareOrdersTab {
  if (status === 'in_progress') return 'in_progress';
  if (status === 'cancelled') return 'cancelled';
  if (status === 'completed') return 'completed';
  return 'pending';
}

/** Deep link to the orders or completed view for a specific order row. */
export function buildEyecareOrderHref(
  order: EyecareOrderLike & { id: number; patient_id?: string | null },
): string {
  const search = eyecareSearchTermForOrder(order);
  if (order.status === 'completed') {
    return buildEyecareCompletedHref(search);
  }
  return buildEyecareOrdersHref(search, eyecareOrdersTabForStatus(order.status));
}

/** Deep link for a session row (in-progress → orders; completed → completed). */
export function buildEyecareSessionHref(session: {
  status?: string;
  order?: number;
  order_details?: { id?: number; patient_id?: string | null; status?: string } | null;
}): string {
  const orderId = session.order_details?.id ?? (typeof session.order === 'number' ? session.order : undefined);
  const patientId = session.order_details?.patient_id?.trim();
  const search = patientId || (orderId != null ? `EYE-${String(orderId).padStart(6, '0')}` : '');
  if (session.status === 'completed') {
    return buildEyecareCompletedHref(search);
  }
  return buildEyecareOrdersHref(search, 'in_progress');
}
