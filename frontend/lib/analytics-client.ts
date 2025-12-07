import { apiFetch } from './api-client';

const buildQuery = (params: Record<string, string | number | undefined | null>) => {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    query.set(key, String(value));
  });
  return query.toString();
};

export interface AnalyticsMetadata {
  rangeDays: number;
  generatedAt: string;
  divisionId?: string;
}

export interface DivisionMetric {
  id: string | null;
  name: string;
  fullName: string;
  total: number;
  workload: number;
  completed: number;
  avgTurnaround: number;
  avgDays: number;
  completionRate: number;
  efficiency: number;
  highPriority: number;
  backlog: number;
}

export interface PerformanceAnalytics {
  metadata: AnalyticsMetadata;
  sla: {
    total: number;
    compliant: number;
    breached: number;
    complianceRate: number;
  };
  turnaround: {
    average: number;
    fastest: number;
    slowest: number;
  };
  divisionPerformance: DivisionMetric[];
  responseDistribution: { name: string; label: string; count: number }[];
  rolePerformance: { role: string; actions: number; avgResponseTime: number }[];
}

export interface ExecutiveAnalytics {
  metadata: AnalyticsMetadata;
  divisionMetrics: DivisionMetric[];
  departmentActivity: { id: string; name: string; total: number }[];
  delayedApprovals: {
    id: string;
    referenceNumber: string;
    subject: string;
    priority: string;
    divisionName?: string;
    daysPending: number;
    currentApprover?: string | null;
    lastActionAt?: string | null;
  }[];
  pendingLeadership: {
    id: string;
    referenceNumber: string;
    subject: string;
    approverName?: string;
    priority: string;
    divisionName?: string;
    receivedDate?: string | null;
    daysPending: number;
  }[];
  weeklyTrend: { week: string; completed: number; pending: number }[];
  sensitivityBreakdown: { sensitivity: string; label: string; count: number; avgTurnaround: number }[];
}

export interface ExecutivePortfolioSummary {
  totalQueue: number;
  urgent: number;
  slaBreaches: number;
  approachingSLA: number;
  completionRate?: number;
  ownedTotal?: number;
}

export interface ExecutivePortfolioOffice {
  id: string;
  name: string;
  code: string;
  officeType: string;
  total: number;
  urgent: number;
  slaBreaches: number;
  approachingSLA: number;
  owned: number;
}

export interface ExecutivePortfolioItem {
  id: string;
  referenceNumber: string;
  subject: string;
  priority: string;
  status: string;
  officeName?: string | null;
  receivedDate?: string | null;
  currentApprover?: string | null;
  agingDays: number;
  slaStatus: 'breach' | 'approaching' | 'ok';
}

export interface ExecutiveDelegation {
  officeId: string;
  officeName: string;
  members: {
    userId: string;
    name: string;
    role: string;
    isPrimary: boolean;
    canApprove: boolean;
  }[];
}

export interface ExecutiveRecord {
  id: string;
  referenceNumber: string;
  subject: string;
  priority: string;
  owningOffice?: string | null;
  updatedAt?: string | null;
  archiveLevel?: string | null;
}

export interface ExecutivePortfolio {
  metadata: AnalyticsMetadata & { officeCount: number; executive: string };
  summary: ExecutivePortfolioSummary;
  offices: ExecutivePortfolioOffice[];
  trend: { week: string; completed: number; pending: number }[];
  inboxPreview: ExecutivePortfolioItem[];
  escalations: ExecutivePortfolioItem[];
  approvals: ExecutivePortfolioItem[];
  delegations: ExecutiveDelegation[];
  records: ExecutiveRecord[];
}

export interface ExecutiveRecordSearchResponse {
  metadata: {
    officeCount: number;
    query: string;
    returned: number;
  };
  results: ExecutiveRecord[];
}

export interface ReportsAnalytics {
  metadata: AnalyticsMetadata;
  metrics: {
    total: number;
    completed: number;
    inProgress: number;
    pending: number;
    urgent: number;
    avgProcessingTime: number;
    completionRate: number;
  };
  statusDistribution: { name: string; value: number }[];
  priorityDistribution: { name: string; value: number; priority: string }[];
  divisionSummary: { name: string; total: number; completed: number; pending: number; rate: number }[];
  trend: { date: string; received: number; completed: number }[];
}

export interface EnhancedReportsAnalytics extends ReportsAnalytics {
  sla: {
    total: number;
    compliant: number;
    breached: number;
    atRisk: number;
    complianceRate: number;
  };
  comparison?: {
    totalChange: number;
    completedChange: number;
    completionRateChange: number;
    avgProcessingTimeChange: number;
    slaComplianceChange: number;
  };
  typeDistribution: { name: string; value: number; type: string }[];
  turnaroundDistribution: { name: string; count: number; min: number; max: number | null }[];
  staffWorkload: { userId: string; name: string; handled: number; completed: number; avgDays: number }[];
  divisionPerformance: {
    name: string;
    fullName: string;
    total: number;
    completed: number;
    pending: number;
    rate: number;
    slaCompliance: number;
    avgTurnaround: number;
  }[];
}

export interface ReportTemplate {
  id: string;
  name: string;
  description?: string;
  filters: {
    divisionId?: string;
    range?: string;
    types?: string[];
    priorities?: string[];
    statuses?: string[];
  };
  metrics: string[];
  charts: string[];
  createdAt: string;
  updatedAt: string;
}

export const fetchPerformanceAnalytics = async (range: string | number = '30') => {
  const query = buildQuery({ range });
  return apiFetch<PerformanceAnalytics>(`/analytics/performance/?${query}`);
};

export const fetchExecutiveAnalytics = async (range: string | number = '30') => {
  const query = buildQuery({ range });
  return apiFetch<ExecutiveAnalytics>(`/analytics/executive/?${query}`);
};

export const fetchExecutivePortfolio = async ({
  range = '30',
  records = 8,
  recordsQuery,
}: {
  range?: string | number;
  records?: number;
  recordsQuery?: string;
} = {}) => {
  const query = buildQuery({
    range,
    records,
    records_query: recordsQuery,
  });
  return apiFetch<ExecutivePortfolio>(`/analytics/executive/portfolio/?${query}`);
};

export const searchExecutiveRecords = async ({
  query,
  limit = 20,
}: {
  query: string;
  limit?: number;
}) => {
  const search = buildQuery({ query, limit });
  return apiFetch<ExecutiveRecordSearchResponse>(`/analytics/executive/records/?${search}`);
};

export interface EnhancedReportsParams {
  range?: string | number;
  divisionId?: string;
  types?: string[];
  priorities?: string[];
  statuses?: string[];
  includeComparison?: boolean;
}

export const fetchReportsAnalytics = async ({ range = '30', divisionId }: { range?: string | number; divisionId?: string }) => {
  const query = buildQuery({ range, divisionId: divisionId && divisionId !== 'all' ? divisionId : undefined });
  return apiFetch<ReportsAnalytics>(`/analytics/insights/?${query}`);
};

export const fetchEnhancedReportsAnalytics = async (params: EnhancedReportsParams = {}) => {
  const { range = '30', divisionId, types, priorities, statuses, includeComparison = true } = params;
  const query = buildQuery({
    range,
    divisionId: divisionId && divisionId !== 'all' ? divisionId : undefined,
    types: types?.join(','),
    priorities: priorities?.join(','),
    statuses: statuses?.join(','),
    include_comparison: includeComparison ? '1' : undefined,
  });
  return apiFetch<EnhancedReportsAnalytics>(`/analytics/insights/?${query}`);
};

export const fetchReportTemplates = async () => {
  return apiFetch<ReportTemplate[]>('/analytics/reports/');
};

export const saveReportTemplate = async (template: Omit<ReportTemplate, 'id' | 'createdAt' | 'updatedAt'>) => {
  return apiFetch<ReportTemplate>('/analytics/reports/', {
    method: 'POST',
    body: JSON.stringify(template),
  });
};

export const deleteReportTemplate = async (id: string) => {
  return apiFetch<void>(`/analytics/reports/${id}/`, { method: 'DELETE' });
};

export interface AnalyticsExportOptions {
  type: 'performance' | 'executive' | 'reports';
  format: 'csv' | 'pdf';
  range?: string | number;
  divisionId?: string;
}

export const downloadAnalyticsExport = async ({ type, format, range = '30', divisionId }: AnalyticsExportOptions) => {
  const query = buildQuery({ type, format, range, divisionId: divisionId && divisionId !== 'all' ? divisionId : undefined });
  return apiFetch<Blob>(`/analytics/export/?${query}`, { responseType: 'blob' });
};
