export type PhysioOrdersTab = 'pending' | 'scheduled' | 'in_progress' | 'cancelled' | 'completed' | 'all';

export const PHYSIO_ORDERS_TAB_ORDER: PhysioOrdersTab[] = [
  'pending',
  'scheduled',
  'in_progress',
  'cancelled',
  'completed',
  'all',
];

export const PHYSIO_ORDERS_TAB_LABELS: Record<PhysioOrdersTab, string> = {
  pending: 'Pending',
  scheduled: 'Scheduled',
  in_progress: 'In Progress',
  cancelled: 'Cancelled',
  completed: 'Completed',
  all: 'All',
};

export type PhysioOrderLike = {
  status?: string;
};

export function orderMatchesPhysioOrdersTab(order: PhysioOrderLike, tab: PhysioOrdersTab): boolean {
  const status = order.status || '';
  if (tab === 'all') return true;
  if (tab === 'pending') return status === 'pending';
  if (tab === 'scheduled') return status === 'scheduled';
  if (tab === 'in_progress') return status === 'in_progress';
  if (tab === 'cancelled') return status === 'cancelled';
  if (tab === 'completed') return status === 'completed';
  return false;
}

export function findPhysioOrdersTabForOrders(orders: PhysioOrderLike[]): PhysioOrdersTab | null {
  for (const tab of PHYSIO_ORDERS_TAB_ORDER) {
    if (orders.some((o) => orderMatchesPhysioOrdersTab(o, tab))) {
      return tab;
    }
  }
  return null;
}

export function isValidPhysioOrdersTab(value: string | null): value is PhysioOrdersTab {
  return value != null && PHYSIO_ORDERS_TAB_ORDER.includes(value as PhysioOrdersTab);
}

/** Map Orders UI tab to backend ``status`` query param. */
export function physioOrdersTabToStatus(
  tab: PhysioOrdersTab,
): 'pending' | 'scheduled' | 'in_progress' | 'cancelled' | 'completed' | undefined {
  if (tab === 'all') return undefined;
  return tab;
}

export function buildPhysioOrdersHref(search?: string, tab?: PhysioOrdersTab): string {
  const params = new URLSearchParams();
  if (search?.trim()) params.set('search', search.trim());
  if (tab && tab !== 'pending') params.set('tab', tab);
  const qs = params.toString();
  return qs ? `/physiotherapy/orders?${qs}` : '/physiotherapy/orders';
}

export function buildPhysioCompletedHref(search?: string): string {
  const params = new URLSearchParams();
  if (search?.trim()) params.set('search', search.trim());
  params.set('date', 'all');
  const qs = params.toString();
  return `/physiotherapy/completed?${qs}`;
}
