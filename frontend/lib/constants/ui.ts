// UI-related constants for consistent behavior across the application

// ==========================================
// TIMING CONSTANTS
// ==========================================
export const DEBOUNCE_DELAY = 300; // ms for search debouncing
export const TOAST_DURATION = 4000; // ms for toast notifications
export const SAVE_SIMULATION_DELAY = 1500; // ms for save operation simulation
export const UI_TRANSITION_DELAY = 100; // ms for UI state transitions

// ==========================================
// POLLING INTERVALS
// ==========================================
export const RADIOLOGY_VERIFICATION_POLL_INTERVAL = 45000; // 45 seconds
export const RADIOLOGY_ORDERS_POLL_INTERVAL = 30000; // 30 seconds
export const RADIOLOGY_REPORTS_POLL_INTERVAL = 60000; // 60 seconds

// ==========================================
// API TIMEOUTS
// ==========================================
export const API_REQUEST_TIMEOUT = 30000; // 30 seconds
export const FILE_UPLOAD_TIMEOUT = 120000; // 2 minutes

// ==========================================
// UI DIMENSIONS
// ==========================================
export const SIDEBAR_WIDTH = 280;
export const MOBILE_BREAKPOINT = 768;
export const TABLET_BREAKPOINT = 1024;

// ==========================================
// ANIMATION DURATIONS
// ==========================================
export const ANIMATION_DURATION_FAST = 150; // ms
export const ANIMATION_DURATION_NORMAL = 300; // ms
export const ANIMATION_DURATION_SLOW = 500; // ms

// ==========================================
// RETRY CONFIGURATION
// ==========================================
export const MAX_RETRY_ATTEMPTS = 3;
export const RETRY_DELAY_BASE = 1000; // ms, exponential backoff

// ==========================================
// VALIDATION LIMITS
// ==========================================
export const MAX_FILE_SIZE_MB = 10;
export const MAX_TEXT_LENGTH = 1000;
export const MAX_NOTES_LENGTH = 5000;
export const MIN_PASSWORD_LENGTH = 8;

// ==========================================
// PRIORITY MAPPINGS
// ==========================================
export const PRIORITY_LEVELS = {
  EMERGENCY: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
} as const;

export const PRIORITY_LABELS = {
  [PRIORITY_LEVELS.EMERGENCY]: 'Emergency',
  [PRIORITY_LEVELS.HIGH]: 'High',
  [PRIORITY_LEVELS.MEDIUM]: 'Medium',
  [PRIORITY_LEVELS.LOW]: 'Low',
} as const;

// ==========================================
// STATUS VALUES
// ==========================================
export const CONSULTATION_STATUSES = [
  'active',
  'completed',
  'cancelled',
] as const;

export const VISIT_STATUSES = [
  'scheduled',
  'in_progress',
  'completed',
  'cancelled',
] as const;

export const LAB_ORDER_STATUSES = [
  'pending',
  'collected',
  'processing',
  'completed',
  'cancelled',
] as const;

// ==========================================
// TIME CONSTANTS
// ==========================================
export const MINUTES_PER_HOUR = 60;
export const SECONDS_PER_MINUTE = 60;
export const MILLISECONDS_PER_SECOND = 1000;
export const MILLISECONDS_PER_MINUTE = MILLISECONDS_PER_SECOND * SECONDS_PER_MINUTE;