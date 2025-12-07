type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface ClientLogEntryPayload {
  level: LogLevel;
  args: unknown[];
}

const isBrowser = typeof window !== 'undefined';
const shouldPrint =
  process.env.NEXT_PUBLIC_DEBUG_LOGS === 'true' ||
  process.env.NODE_ENV !== 'production';

const batch: ClientLogEntryPayload[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
const MAX_BATCH_SIZE = 20;
const FLUSH_INTERVAL_MS = 2000;

const logToConsole = (level: LogLevel, args: unknown[]) => {
  const target =
    level === 'error'
      ? console.error
      : level === 'warn'
        ? console.warn
        : level === 'debug'
          ? console.debug
          : console.info;
  target?.(...args);
};

// Track if logging is disabled to prevent infinite error loops
let loggingDisabled = false;
let consecutiveFailures = 0;
const MAX_CONSECUTIVE_FAILURES = 3;

const getBaseUrl = () => {
  if (!isBrowser) return '';
  const base = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8001/api';
  return base.endsWith('/') ? base.slice(0, -1) : base;
};

const flushLogs = async () => {
  if (!isBrowser || batch.length === 0 || loggingDisabled) {
    return;
  }

  const payload = batch.splice(0, batch.length);
  const body = JSON.stringify({ entries: payload });

  try {
    const baseUrl = getBaseUrl();
    const response = await fetch(`${baseUrl}/support/client-logs/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body,
      // Don't wait for response to avoid blocking
      keepalive: true,
    });
    
    // Reset failure counter on success
    if (response.ok) {
      consecutiveFailures = 0;
    } else {
      consecutiveFailures++;
      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        loggingDisabled = true;
      }
    }
  } catch (error) {
    consecutiveFailures++;
    if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
      loggingDisabled = true;
    }
    // Silently fail - client logging should not break the app
    // Don't log errors about logging failures to prevent infinite loops
  }
};

const scheduleFlush = () => {
  if (flushTimer) {
    return;
  }
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flushLogs();
  }, FLUSH_INTERVAL_MS);
};

const enqueue = (level: LogLevel, args: unknown[]) => {
  if (!isBrowser) {
    return;
  }
  batch.push({ level, args });
  if (batch.length >= MAX_BATCH_SIZE) {
    void flushLogs();
    return;
  }
  scheduleFlush();
};

const log = (level: LogLevel, args: unknown[]) => {
  if (!args.length) {
    args = [`[${level.toUpperCase()}]`];
  }

  if (isBrowser && (level === 'error' || level === 'warn')) {
    enqueue(level, args);
  }

  if (isBrowser) {
    if (shouldPrint) {
      logToConsole(level, args);
    }
    return;
  }

  logToConsole(level, args);
};

export const logDebug = (...args: unknown[]) => log('debug', args);
export const logInfo = (...args: unknown[]) => log('info', args);
export const logWarn = (...args: unknown[]) => log('warn', args);
export const logError = (...args: unknown[]) => log('error', args);

if (isBrowser) {
  window.addEventListener('beforeunload', () => {
    if (batch.length && !loggingDisabled) {
      const body = JSON.stringify({ entries: batch.splice(0, batch.length) });
      const baseUrl = getBaseUrl();
      // Use fetch with keepalive for beforeunload (similar to sendBeacon but with auth)
      fetch(`${baseUrl}/support/client-logs/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body,
        keepalive: true,
      }).catch(() => {
        // Silently fail on beforeunload
      });
    }
  });
}
