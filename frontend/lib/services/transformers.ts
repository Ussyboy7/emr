/**
 * Data transformation utilities for mapping backend (snake_case) to frontend (camelCase)
 */

/**
 * Convert backend lab test status to frontend display format
 */
export const transformLabTestStatus = (status: string): string => {
  const statusMap: Record<string, string> = {
    'pending': 'Pending',
    'sample_collected': 'Sample Collected',
    'processing': 'Processing',
    'results_ready': 'Results Ready',
    'verified': 'Verified',
  };
  return statusMap[status] || status;
};

/**
 * Convert frontend display status to backend status
 */
export const transformToBackendStatus = (status: string): string => {
  const statusMap: Record<string, string> = {
    'Pending': 'pending',
    'Sample Collected': 'sample_collected',
    'Processing': 'processing',
    'Results Ready': 'results_ready',
    'Verified': 'verified',
  };
  return statusMap[status] || status.toLowerCase().replace(/\s+/g, '_');
};

/**
 * Transform backend priority to frontend format
 */
export const transformPriority = (priority: string): string => {
  const priorityMap: Record<string, string> = {
    'routine': 'Routine',
    'urgent': 'Urgent',
    'stat': 'STAT',
  };
  return priorityMap[priority] || priority;
};

/**
 * Transform frontend priority to backend format
 */
export const transformToBackendPriority = (priority: string): string => {
  const priorityMap: Record<string, string> = {
    'Routine': 'routine',
    'Urgent': 'urgent',
    'STAT': 'stat',
  };
  return priorityMap[priority] || priority.toLowerCase();
};

/**
 * Transform backend processing method to frontend format
 */
export const transformProcessingMethod = (method: string): string => {
  const methodMap: Record<string, string> = {
    'in_house': 'In-house',
    'outsourced': 'Outsourced',
  };
  return methodMap[method] || method;
};

/**
 * Transform frontend processing method to backend format
 */
export const transformToBackendProcessingMethod = (method: string): string => {
  const methodMap: Record<string, string> = {
    'In-house': 'in_house',
    'Outsourced': 'outsourced',
  };
  return methodMap[method] || method.toLowerCase().replace(/\s+/g, '_');
};


