import { LAB_TEST_STATUS } from '@/lib/laboratory/constants';

export type LabOrdersTab = 'pending' | 'processing' | 'results' | 'rejected' | 'all';
export type LabVerificationTab = 'pending' | 'verified';

export const LAB_ORDERS_TAB_ORDER: LabOrdersTab[] = [
  'pending',
  'processing',
  'results',
  'rejected',
  'all',
];

export const LAB_ORDERS_TAB_LABELS: Record<LabOrdersTab, string> = {
  pending: 'Pending',
  processing: 'Processing',
  results: 'Results',
  rejected: 'Rework Required',
  all: 'All',
};

export const LAB_VERIFICATION_TAB_LABELS: Record<LabVerificationTab, string> = {
  pending: 'Pending Review',
  verified: 'Verified',
};

/** Map Lab Orders UI tab to backend ``workflow_tab`` query param. */
export function labOrdersTabToWorkflowParam(tab: LabOrdersTab): string | undefined {
  if (tab === 'all') return undefined;
  if (tab === 'results') return 'results_ready';
  return tab;
}

export type LabOrderLike = {
  tests?: Array<{ status?: string }>;
};

/** Whether an order has at least one test visible on a Lab Orders tab. */
export function orderMatchesLabOrdersTab(order: LabOrderLike, tab: LabOrdersTab): boolean {
  const tests = order.tests || [];
  if (tab === 'all') return tests.length > 0;
  if (tab === 'pending') {
    return tests.some((t) => t.status === LAB_TEST_STATUS.PENDING);
  }
  if (tab === 'processing') {
    return tests.some(
      (t) =>
        t.status === LAB_TEST_STATUS.SAMPLE_COLLECTED || t.status === LAB_TEST_STATUS.PROCESSING,
    );
  }
  if (tab === 'results') {
    return tests.some((t) => t.status === LAB_TEST_STATUS.RESULTS_READY);
  }
  if (tab === 'rejected') {
    return tests.some((t) => t.status === LAB_TEST_STATUS.REJECTED);
  }
  return false;
}

/** First tab (workflow order) that contains any of the given orders. */
export function findLabOrdersTabForOrders(orders: LabOrderLike[]): LabOrdersTab | null {
  for (const tab of LAB_ORDERS_TAB_ORDER) {
    if (orders.some((o) => orderMatchesLabOrdersTab(o, tab))) {
      return tab;
    }
  }
  return null;
}

export function isValidLabOrdersTab(value: string | null): value is LabOrdersTab {
  return value != null && LAB_ORDERS_TAB_ORDER.includes(value as LabOrdersTab);
}

export function isValidLabVerificationTab(value: string | null): value is LabVerificationTab {
  return value === 'pending' || value === 'verified';
}

export function buildLabOrdersHref(search?: string, tab?: LabOrdersTab): string {
  const params = new URLSearchParams();
  if (search?.trim()) params.set('search', search.trim());
  if (tab && tab !== 'pending') params.set('tab', tab);
  const qs = params.toString();
  return qs ? `/laboratory/orders?${qs}` : '/laboratory/orders';
}

export function buildLabVerificationHref(search?: string, tab?: LabVerificationTab): string {
  const params = new URLSearchParams();
  if (search?.trim()) params.set('search', search.trim());
  if (tab && tab !== 'pending') params.set('tab', tab);
  const qs = params.toString();
  return qs ? `/laboratory/verification?${qs}` : '/laboratory/verification';
}

export function buildLabCompletedHref(search?: string): string {
  const params = new URLSearchParams();
  if (search?.trim()) params.set('search', search.trim());
  params.set('date', 'all');
  const qs = params.toString();
  return `/laboratory/completed?${qs}`;
}

export type LabPatientTrackerHit = {
  patient_name: string;
  patient_id: string;
  test_name: string;
  test_code: string;
  test_status: string;
  test_status_display: string;
  lab_number: string | null;
  order_id: string | null;
  clinic: string | null;
  screen: 'lab_orders' | 'verification' | 'completed';
  tab: string;
  screen_label: string;
  tab_label: string;
  href: string;
  is_active: boolean;
};
