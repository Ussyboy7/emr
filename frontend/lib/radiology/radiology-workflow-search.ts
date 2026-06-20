/** Radiology study workflow statuses (API values). */
export const RADIOLOGY_STUDY_STATUS = {
  PENDING: 'pending',
  SCHEDULED: 'scheduled',
  ACQUIRED: 'acquired',
  PROCESSING: 'processing',
  REPORTED: 'reported',
  VERIFIED: 'verified',
  REJECTED: 'rejected',
} as const;

export type RadiologyOrdersTab = 'pending' | 'processing' | 'results' | 'rejected' | 'all';
export type RadiologyVerificationTab = 'pending' | 'verified';

export const RADIOLOGY_ORDERS_TAB_ORDER: RadiologyOrdersTab[] = [
  'pending',
  'processing',
  'results',
  'rejected',
  'all',
];

export const RADIOLOGY_ORDERS_TAB_LABELS: Record<RadiologyOrdersTab, string> = {
  pending: 'Pending',
  processing: 'Processing',
  results: 'Results',
  rejected: 'Rejected',
  all: 'All',
};

export const RADIOLOGY_VERIFICATION_TAB_LABELS: Record<RadiologyVerificationTab, string> = {
  pending: 'Pending Review',
  verified: 'Verified',
};

/** Map Study Orders UI tab to backend ``study_status`` query param. */
export function radiologyOrdersTabToStudyStatus(
  tab: RadiologyOrdersTab,
): 'pending' | 'processing' | 'reported' | 'rejected' | undefined {
  if (tab === 'all') return undefined;
  if (tab === 'results') return 'reported';
  return tab;
};

export type RadiologyOrderLike = {
  studies?: Array<{ status?: string }>;
};

/** Whether an order has at least one study visible on a Study Orders tab. */
export function orderMatchesRadiologyOrdersTab(
  order: RadiologyOrderLike,
  tab: RadiologyOrdersTab,
): boolean {
  const studies = order.studies || [];
  if (tab === 'all') return studies.length > 0;
  if (tab === 'pending') {
    return studies.some((s) => {
      const st = s.status || '';
      return (
        st === RADIOLOGY_STUDY_STATUS.PENDING ||
        st === RADIOLOGY_STUDY_STATUS.SCHEDULED ||
        st === RADIOLOGY_STUDY_STATUS.ACQUIRED
      );
    });
  }
  if (tab === 'processing') {
    return studies.some((s) => s.status === RADIOLOGY_STUDY_STATUS.PROCESSING);
  }
  if (tab === 'results') {
    return studies.some((s) => s.status === RADIOLOGY_STUDY_STATUS.REPORTED);
  }
  if (tab === 'rejected') {
    return studies.some((s) => s.status === RADIOLOGY_STUDY_STATUS.REJECTED);
  }
  return false;
}

/** First tab (workflow order) that contains any of the given orders. */
export function findRadiologyOrdersTabForOrders(orders: RadiologyOrderLike[]): RadiologyOrdersTab | null {
  for (const tab of RADIOLOGY_ORDERS_TAB_ORDER) {
    if (orders.some((o) => orderMatchesRadiologyOrdersTab(o, tab))) {
      return tab;
    }
  }
  return null;
}

export function isValidRadiologyOrdersTab(value: string | null): value is RadiologyOrdersTab {
  return value != null && RADIOLOGY_ORDERS_TAB_ORDER.includes(value as RadiologyOrdersTab);
}

export function isValidRadiologyVerificationTab(value: string | null): value is RadiologyVerificationTab {
  return value === 'pending' || value === 'verified';
}

export function buildRadiologyOrdersHref(search?: string, tab?: RadiologyOrdersTab): string {
  const params = new URLSearchParams();
  if (search?.trim()) params.set('search', search.trim());
  if (tab && tab !== 'all') params.set('tab', tab);
  const qs = params.toString();
  return qs ? `/radiology/orders?${qs}` : '/radiology/orders';
}

export function buildRadiologyVerificationHref(
  search?: string,
  tab?: RadiologyVerificationTab,
): string {
  const params = new URLSearchParams();
  if (search?.trim()) params.set('search', search.trim());
  if (tab && tab !== 'pending') params.set('tab', tab);
  const qs = params.toString();
  return qs ? `/radiology/verification?${qs}` : '/radiology/verification';
}

export function buildRadiologyCompletedHref(search?: string): string {
  const params = new URLSearchParams();
  if (search?.trim()) params.set('search', search.trim());
  params.set('date', 'all');
  const qs = params.toString();
  return `/radiology/completed?${qs}`;
}
