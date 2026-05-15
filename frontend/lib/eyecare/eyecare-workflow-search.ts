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
