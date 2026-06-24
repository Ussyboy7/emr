"use client";

import { logError, logWarn, logInfo } from '@/lib/client-logger';
import { AuthenticationError, AuthenticationExpiredError } from './auth-errors';
import {
  AUTH_REFRESH_SESSION_MAX_AGE_SECONDS,
  getRefreshLifetimeMs,
} from './auth-session-config';
import { notifySessionActivity } from './session-activity';
import {
  ACCESS_TOKEN_COOKIE as ACCESS_TOKEN_KEY,
  REFRESH_TOKEN_COOKIE as REFRESH_TOKEN_KEY,
  ACCESS_TOKEN_EXP_COOKIE as ACCESS_TOKEN_EXP_KEY,
  REFRESH_TOKEN_EXP_COOKIE as REFRESH_TOKEN_EXP_KEY,
  AUTH_ALLOWED_PAGES_COOKIE,
  AUTH_DENIED_PAGES_COOKIE,
  AUTH_HOME_ROUTE_COOKIE,
  AUTH_IS_SUPERUSER_COOKIE,
  AUTH_NEXT_REDIRECT_COOKIE,
  AUTH_SESSION_COOKIE,
  LEGACY_AUTH_ALLOWED_PAGES_COOKIE,
  LEGACY_AUTH_DENIED_PAGES_COOKIE,
  LEGACY_AUTH_HOME_ROUTE_COOKIE,
  LEGACY_AUTH_IS_SUPERUSER_COOKIE,
  LEGACY_AUTH_NEXT_REDIRECT_COOKIE,
  LEGACY_ACCESS_TOKEN_COOKIE,
  LEGACY_REFRESH_TOKEN_COOKIE,
  LEGACY_ACCESS_TOKEN_EXP_COOKIE,
  LEGACY_REFRESH_TOKEN_EXP_COOKIE,
  LEGACY_AUTH_SESSION_COOKIE,
} from "@/lib/auth-cookie-names";
const ORIGINAL_ACCESS_TOKEN_KEY = "emr_original_access";
const ORIGINAL_REFRESH_TOKEN_KEY = "emr_original_refresh";
const ORIGINAL_ACCESS_EXP_KEY = "emr_original_access_exp";
const LEGACY_ORIGINAL_ACCESS_TOKEN_KEY = "npa_ecm_original_access";
const LEGACY_ORIGINAL_REFRESH_TOKEN_KEY = "npa_ecm_original_refresh";
const LEGACY_ORIGINAL_ACCESS_EXP_KEY = "npa_ecm_original_access_exp";
const AUTH_REMEMBER_SESSION_KEY = "emr_remember_session";

export { AUTH_REFRESH_SESSION_MAX_AGE_SECONDS } from './auth-session-config';

/**
 * API root used by fetch() (must hit Django, not the Next.js dev server).
 * Uses NEXT_PUBLIC_API_URL environment variable for the API base URL.
 */
export const getBaseUrl = (): string => {
  const baseUrl = process.env.NEXT_PUBLIC_API_URL;
  if (!baseUrl || baseUrl.trim() === "") {
    throw new Error("NEXT_PUBLIC_API_URL environment variable is not set");
  }
  const normalized = baseUrl.trim().replace(/\/$/, "");
  // Accept full roots: /api (legacy alias) or /api/v1 (versioned).
  if (normalized.endsWith("/api/v1") || normalized.endsWith("/api")) {
    return normalized;
  }
  return `${normalized}/api`;
};

const isBrowser = () => typeof window !== "undefined";

let loginRedirectInFlight = false;

const peekAuthFailureCode = async (response: Response): Promise<string | null> => {
  try {
    const peek = await response.clone().json();
    if (typeof peek?.code === "string") return peek.code;
    if (typeof peek?.detail === "object" && peek?.detail?.code) {
      return String(peek.detail.code);
    }
  } catch {
    // ignore parse errors
  }
  return null;
};

/** Clear stale session and send the user to login (full navigation). */
export const redirectToLogin = (reason?: string) => {
  if (!isBrowser()) return;
  const path = window.location.pathname;
  if (path === "/login" || path === "/") return;
  if (loginRedirectInFlight) return;
  loginRedirectInFlight = true;

  try {
    sessionStorage.setItem("redirect_after_login", path);
  } catch {
    // ignore
  }

  clearTokens();

  const params = new URLSearchParams({ next: path });
  if (reason) params.set("reason", reason);
  window.location.replace(`/login?${params.toString()}`);
};
const inFlightGetRequests = new Map<string, Promise<Response>>();

const getCookieDomainSuffix = (): string => {
  if (!isBrowser()) return "";
  return window.location.hostname.includes("npa.local") ? "; Domain=.npa.local" : "";
};

const getSessionStorageSafe = (): Storage | null => {
  if (!isBrowser()) return null;
  return window.sessionStorage;
};

const getLocalStorageSafe = (): Storage | null => {
  if (!isBrowser()) return null;
  return window.localStorage;
};

const getStorageValue = (key: string): string | null => {
  const sessionValue = getSessionStorageSafe()?.getItem(key);
  if (sessionValue) return sessionValue;
  return getLocalStorageSafe()?.getItem(key) ?? null;
};

const removeStorageValueEverywhere = (key: string) => {
  getSessionStorageSafe()?.removeItem(key);
  getLocalStorageSafe()?.removeItem(key);
};

export const shouldPersistAuthSession = (): boolean => {
  if (!isBrowser()) return false;
  return getLocalStorageSafe()?.getItem(AUTH_REMEMBER_SESSION_KEY) === "1";
};

const setAuthPersistenceMode = (persist: boolean) => {
  if (!isBrowser()) return;
  if (persist) {
    getLocalStorageSafe()?.setItem(AUTH_REMEMBER_SESSION_KEY, "1");
  } else {
    getLocalStorageSafe()?.removeItem(AUTH_REMEMBER_SESSION_KEY);
  }
};

const getCookie = (name: string): string | null => {
  if (!isBrowser()) return null;
  const escaped = name.replace(/[$()*+.?[\\\]^{|}-]/g, "\\$&");
  const match = document.cookie.match(new RegExp(`(?:^|; )${escaped}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
};

const setCookie = (name: string, value: string, maxAgeSeconds?: number) => {
  if (!isBrowser()) return;
  const maxAge = typeof maxAgeSeconds === "number" ? `; Max-Age=${Math.max(0, Math.floor(maxAgeSeconds))}` : "";
  // Use domain=.npa.local so cookies work across NPA subdomains when applicable.
  const domain = getCookieDomainSuffix();
  document.cookie = `${name}=${encodeURIComponent(value)}; Path=/${domain}; SameSite=Lax${maxAge}`;
};

const clearCookie = (name: string) => {
  if (!isBrowser()) return;
  document.cookie = `${name}=; Path=/; SameSite=Lax; Max-Age=0`;
  const domain = getCookieDomainSuffix();
  if (domain) {
    document.cookie = `${name}=; Path=/${domain}; SameSite=Lax; Max-Age=0`;
  }
};

let didMigrateStorageKeys = false;
const migrateLegacyStorageKeysIfNeeded = () => {
  if (!isBrowser()) return;
  if (didMigrateStorageKeys) return;
  didMigrateStorageKeys = true;

  // Migrate auth tokens (npa_ecm_* -> emr_*)
  const newAccess = getStorageValue(ACCESS_TOKEN_KEY) ?? getCookie(ACCESS_TOKEN_KEY);
  const newRefresh = getStorageValue(REFRESH_TOKEN_KEY) ?? getCookie(REFRESH_TOKEN_KEY);
  const newExp = getStorageValue(ACCESS_TOKEN_EXP_KEY) ?? getCookie(ACCESS_TOKEN_EXP_KEY);

  const legacyAccess = localStorage.getItem(LEGACY_ACCESS_TOKEN_COOKIE) ?? getCookie(LEGACY_ACCESS_TOKEN_COOKIE);
  const legacyRefresh = localStorage.getItem(LEGACY_REFRESH_TOKEN_COOKIE) ?? getCookie(LEGACY_REFRESH_TOKEN_COOKIE);
  const legacyExp = localStorage.getItem(LEGACY_ACCESS_TOKEN_EXP_COOKIE) ?? getCookie(LEGACY_ACCESS_TOKEN_EXP_COOKIE);

  if ((!newAccess || !newRefresh) && legacyAccess && legacyRefresh) {
    // Prefer legacy expiry if present; otherwise default to 1h.
    const expiresAt = legacyExp ? Number(legacyExp) : undefined;
    const remainingSeconds =
      typeof expiresAt === "number" && Number.isFinite(expiresAt)
        ? Math.max(0, Math.floor((expiresAt - Date.now()) / 1000))
        : 60 * 60;

    localStorage.setItem(ACCESS_TOKEN_KEY, legacyAccess);
    localStorage.setItem(REFRESH_TOKEN_KEY, legacyRefresh);
    if (typeof expiresAt === "number" && Number.isFinite(expiresAt)) {
      localStorage.setItem(ACCESS_TOKEN_EXP_KEY, `${expiresAt}`);
    }

    setCookie(ACCESS_TOKEN_KEY, legacyAccess, remainingSeconds);
    setCookie(REFRESH_TOKEN_KEY, legacyRefresh, AUTH_REFRESH_SESSION_MAX_AGE_SECONDS);
    if (typeof expiresAt === "number" && Number.isFinite(expiresAt)) {
      setCookie(ACCESS_TOKEN_EXP_KEY, `${expiresAt}`, remainingSeconds);
    }
    setCookie(AUTH_SESSION_COOKIE, "1", AUTH_REFRESH_SESSION_MAX_AGE_SECONDS);

    // Cleanup legacy keys
    localStorage.removeItem(LEGACY_ACCESS_TOKEN_COOKIE);
    localStorage.removeItem(LEGACY_REFRESH_TOKEN_COOKIE);
    localStorage.removeItem(LEGACY_ACCESS_TOKEN_EXP_COOKIE);
    clearCookie(LEGACY_ACCESS_TOKEN_COOKIE);
    clearCookie(LEGACY_REFRESH_TOKEN_COOKIE);
    clearCookie(LEGACY_ACCESS_TOKEN_EXP_COOKIE);
  }

  // Migrate impersonation originals (npa_ecm_original_* -> emr_original_*)
  const newOrigAccess = localStorage.getItem(ORIGINAL_ACCESS_TOKEN_KEY);
  const newOrigRefresh = localStorage.getItem(ORIGINAL_REFRESH_TOKEN_KEY);
  const legacyOrigAccess = localStorage.getItem(LEGACY_ORIGINAL_ACCESS_TOKEN_KEY);
  const legacyOrigRefresh = localStorage.getItem(LEGACY_ORIGINAL_REFRESH_TOKEN_KEY);
  const legacyOrigExp = localStorage.getItem(LEGACY_ORIGINAL_ACCESS_EXP_KEY);

  if ((!newOrigAccess || !newOrigRefresh) && legacyOrigAccess && legacyOrigRefresh) {
    localStorage.setItem(ORIGINAL_ACCESS_TOKEN_KEY, legacyOrigAccess);
    localStorage.setItem(ORIGINAL_REFRESH_TOKEN_KEY, legacyOrigRefresh);
    if (legacyOrigExp) {
      localStorage.setItem(ORIGINAL_ACCESS_EXP_KEY, legacyOrigExp);
    }
    localStorage.removeItem(LEGACY_ORIGINAL_ACCESS_TOKEN_KEY);
    localStorage.removeItem(LEGACY_ORIGINAL_REFRESH_TOKEN_KEY);
    localStorage.removeItem(LEGACY_ORIGINAL_ACCESS_EXP_KEY);
  }
};

type FetchOptions = RequestInit & {
  skipAuth?: boolean;
  responseType?: "json" | "text" | "blob";
  retryOnFailure?: boolean;
  maxRetries?: number;
  retryDelay?: number;
};

export const getStoredAccessToken = () => {
  if (!isBrowser()) return null;
  migrateLegacyStorageKeysIfNeeded();
  const token = getStorageValue(ACCESS_TOKEN_KEY) ?? getCookie(ACCESS_TOKEN_KEY);
  const expiresAtRaw = getStorageValue(ACCESS_TOKEN_EXP_KEY) ?? getCookie(ACCESS_TOKEN_EXP_KEY);
  if (!token || !expiresAtRaw) return null;
  const expiresAt = Number(expiresAtRaw);
  if (Number.isNaN(expiresAt) || Date.now() > expiresAt) {
    return null;
  }
  return token;
};

export const getStoredRefreshToken = () => {
  if (!isBrowser()) return null;
  migrateLegacyStorageKeysIfNeeded();
  return getStorageValue(REFRESH_TOKEN_KEY) ?? getCookie(REFRESH_TOKEN_KEY);
};

export const getStoredRefreshExpiresAt = (): number | null => {
  if (!isBrowser()) return null;
  migrateLegacyStorageKeysIfNeeded();
  const raw = getStorageValue(REFRESH_TOKEN_EXP_KEY) ?? getCookie(REFRESH_TOKEN_EXP_KEY);
  if (!raw) return null;
  const expiresAt = Number(raw);
  return Number.isFinite(expiresAt) ? expiresAt : null;
};

const storeRefreshExpiresAt = (
  tokenStorage: Storage | null,
  persist: boolean,
  issuedAtMs: number = Date.now()
) => {
  const refreshExpiresAt = issuedAtMs + getRefreshLifetimeMs();
  tokenStorage?.setItem(REFRESH_TOKEN_EXP_KEY, `${refreshExpiresAt}`);
  setCookie(
    REFRESH_TOKEN_EXP_KEY,
    `${refreshExpiresAt}`,
    persist ? AUTH_REFRESH_SESSION_MAX_AGE_SECONDS : undefined
  );
};

export const storeTokens = (
  accessToken: string,
  refreshToken: string,
  expiresInSeconds?: number,
  options?: { persist?: boolean }
) => {
  if (!isBrowser()) return;
  migrateLegacyStorageKeysIfNeeded();
  const persist = options?.persist ?? shouldPersistAuthSession();
  const tokenStorage = persist ? getLocalStorageSafe() : getSessionStorageSafe();
  removeStorageValueEverywhere(ACCESS_TOKEN_KEY);
  removeStorageValueEverywhere(REFRESH_TOKEN_KEY);
  removeStorageValueEverywhere(ACCESS_TOKEN_EXP_KEY);
  removeStorageValueEverywhere(REFRESH_TOKEN_EXP_KEY);
  tokenStorage?.setItem(ACCESS_TOKEN_KEY, accessToken);
  tokenStorage?.setItem(REFRESH_TOKEN_KEY, refreshToken);
  const effectiveExpires = typeof expiresInSeconds === "number" ? expiresInSeconds : 60 * 60;
  const expiresAt = Date.now() + effectiveExpires * 1000 - 30 * 1000; // refresh a little early
  tokenStorage?.setItem(ACCESS_TOKEN_EXP_KEY, `${expiresAt}`);
  storeRefreshExpiresAt(tokenStorage, persist);
  setAuthPersistenceMode(persist);

  // Mirror tokens into cookies so middleware can enforce auth on first request.
  setCookie(ACCESS_TOKEN_KEY, accessToken, persist ? effectiveExpires : undefined);
  // Align refresh cookie max-age with server refresh token lifetime.
  setCookie(REFRESH_TOKEN_KEY, refreshToken, persist ? AUTH_REFRESH_SESSION_MAX_AGE_SECONDS : undefined);
  // Store expiry as epoch ms so client can validate even when reading from cookies.
  setCookie(ACCESS_TOKEN_EXP_KEY, `${expiresAt}`, persist ? effectiveExpires : undefined);
  // Lightweight auth flag for middleware.
  setCookie(AUTH_SESSION_COOKIE, "1", persist ? AUTH_REFRESH_SESSION_MAX_AGE_SECONDS : undefined);

  // Cleanup legacy token keys so we don't keep duplicates around.
  localStorage.removeItem(LEGACY_ACCESS_TOKEN_COOKIE);
  localStorage.removeItem(LEGACY_REFRESH_TOKEN_COOKIE);
  localStorage.removeItem(LEGACY_ACCESS_TOKEN_EXP_COOKIE);
  clearCookie(LEGACY_ACCESS_TOKEN_COOKIE);
  clearCookie(LEGACY_REFRESH_TOKEN_COOKIE);
  clearCookie(LEGACY_ACCESS_TOKEN_EXP_COOKIE);
};

export const clearTokens = () => {
  if (!isBrowser()) return;
  removeStorageValueEverywhere(ACCESS_TOKEN_KEY);
  removeStorageValueEverywhere(REFRESH_TOKEN_KEY);
  removeStorageValueEverywhere(ACCESS_TOKEN_EXP_KEY);
  removeStorageValueEverywhere(REFRESH_TOKEN_EXP_KEY);
  localStorage.removeItem('demo_user'); // Clear demo user on logout
  localStorage.removeItem(AUTH_REMEMBER_SESSION_KEY);
  clearOriginalTokens();

  clearCookie(ACCESS_TOKEN_KEY);
  clearCookie(REFRESH_TOKEN_KEY);
  clearCookie(ACCESS_TOKEN_EXP_KEY);
  clearCookie(REFRESH_TOKEN_EXP_KEY);
  clearCookie(AUTH_SESSION_COOKIE);
  clearCookie(AUTH_ALLOWED_PAGES_COOKIE);
  clearCookie(AUTH_DENIED_PAGES_COOKIE);
  clearCookie(AUTH_IS_SUPERUSER_COOKIE);
  clearCookie(AUTH_HOME_ROUTE_COOKIE);
  clearCookie(AUTH_NEXT_REDIRECT_COOKIE);
  clearCookie(LEGACY_AUTH_SESSION_COOKIE);
  clearCookie(LEGACY_AUTH_ALLOWED_PAGES_COOKIE);
  clearCookie(LEGACY_AUTH_DENIED_PAGES_COOKIE);
  clearCookie(LEGACY_AUTH_IS_SUPERUSER_COOKIE);
  clearCookie(LEGACY_AUTH_HOME_ROUTE_COOKIE);
  clearCookie(LEGACY_AUTH_NEXT_REDIRECT_COOKIE);

  // Also clear legacy token keys.
  localStorage.removeItem(LEGACY_ACCESS_TOKEN_COOKIE);
  localStorage.removeItem(LEGACY_REFRESH_TOKEN_COOKIE);
  localStorage.removeItem(LEGACY_ACCESS_TOKEN_EXP_COOKIE);
  clearCookie(LEGACY_ACCESS_TOKEN_COOKIE);
  clearCookie(LEGACY_REFRESH_TOKEN_COOKIE);
  clearCookie(LEGACY_ACCESS_TOKEN_EXP_COOKIE);
  clearCookie(LEGACY_REFRESH_TOKEN_EXP_COOKIE);
};

const storeOriginalTokenValues = (accessToken: string, refreshToken: string, expiresInSeconds?: number) => {
  if (!isBrowser()) return;
  localStorage.setItem(ORIGINAL_ACCESS_TOKEN_KEY, accessToken);
  localStorage.setItem(ORIGINAL_REFRESH_TOKEN_KEY, refreshToken);
  if (typeof expiresInSeconds === "number") {
    const expiresAt = Date.now() + expiresInSeconds * 1000 - 30 * 1000;
    localStorage.setItem(ORIGINAL_ACCESS_EXP_KEY, `${expiresAt}`);
  }
};

export const storeOriginalTokens = () => {
  if (!isBrowser()) return;
  migrateLegacyStorageKeysIfNeeded();
  if (localStorage.getItem(ORIGINAL_ACCESS_TOKEN_KEY)) return;
  const access = localStorage.getItem(ACCESS_TOKEN_KEY);
  const refresh = localStorage.getItem(REFRESH_TOKEN_KEY);
  if (!access || !refresh) return;
  const existingExpiry = localStorage.getItem(ACCESS_TOKEN_EXP_KEY);
  storeOriginalTokenValues(access, refresh);
  if (existingExpiry) {
    localStorage.setItem(ORIGINAL_ACCESS_EXP_KEY, existingExpiry);
  }
};

export const getOriginalTokens = () => {
  if (!isBrowser()) return null;
  migrateLegacyStorageKeysIfNeeded();
  const access = localStorage.getItem(ORIGINAL_ACCESS_TOKEN_KEY);
  const refresh = localStorage.getItem(ORIGINAL_REFRESH_TOKEN_KEY);
  if (!access || !refresh) return null;
  const expiresAtRaw = localStorage.getItem(ORIGINAL_ACCESS_EXP_KEY);
  const expiresAt = expiresAtRaw ? Number(expiresAtRaw) : undefined;
  return { access, refresh, expiresAt };
};

export const hasOriginalTokens = () => {
  const tokens = getOriginalTokens();
  return Boolean(tokens && tokens.access && tokens.refresh);
};

export const clearOriginalTokens = () => {
  if (!isBrowser()) return;
  localStorage.removeItem(ORIGINAL_ACCESS_TOKEN_KEY);
  localStorage.removeItem(ORIGINAL_REFRESH_TOKEN_KEY);
  localStorage.removeItem(ORIGINAL_ACCESS_EXP_KEY);

  // Cleanup legacy originals too.
  localStorage.removeItem(LEGACY_ORIGINAL_ACCESS_TOKEN_KEY);
  localStorage.removeItem(LEGACY_ORIGINAL_REFRESH_TOKEN_KEY);
  localStorage.removeItem(LEGACY_ORIGINAL_ACCESS_EXP_KEY);
};

const refreshWithToken = async (refreshToken: string): Promise<LoginResponse | null> => {
  try {
    const response = await fetch(`${getBaseUrl()}/accounts/auth/token/refresh/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ refresh: refreshToken }),
      credentials: "include",
    });

    if (!response.ok) {
      const code = await peekAuthFailureCode(response);
      if (code === "idle_timeout") {
        redirectToLogin("idle_timeout");
      }
      return null;
    }

    const data = (await response.json()) as LoginResponse;
    return data;
  } catch (error: unknown) {
    // Handle network errors (Failed to fetch, CORS, etc.)
    // This typically means the backend is not running or unreachable
    const errorObj = error as any;
    if (errorObj?.message === "Failed to fetch" || errorObj?.name === "TypeError") {
      logWarn("Unable to refresh token - backend may be unavailable", { error: errorObj.message });
      return null;
    }
    // Re-throw other errors
    throw error;
  }
};

// Shared in-flight refresh promise so concurrent apiFetch callers do NOT all
// hit /token/refresh/ in parallel. Without this, 10 simultaneous requests on
// dashboard mount would each spawn their own refresh — only the first succeeds
// when JWT rotation/blacklist is enabled, the rest 401 and call clearTokens(),
// which then cascades into spurious "Authentication required" errors.
let inFlightRefreshPromise: Promise<string | null> | null = null;

const refreshAccessToken = async (): Promise<string | null> => {
  if (inFlightRefreshPromise) {
    return inFlightRefreshPromise;
  }

  const refreshToken = getStoredRefreshToken();
  if (!refreshToken) return null;

  inFlightRefreshPromise = (async () => {
    try {
      const data = await refreshWithToken(refreshToken);
      if (!data || !data.access) {
        clearTokens();
        return null;
      }
      storeTokens(data.access, data.refresh ?? refreshToken, data.expires_in, {
        persist: shouldPersistAuthSession(),
      });
      notifySessionActivity();
      return data.access;
    } catch (error: unknown) {
      // Only log non-network errors (network errors are already handled in refreshWithToken)
      const errorObj = error as any;
      if (errorObj?.message !== "Failed to fetch" && errorObj?.name !== "TypeError") {
        logError("Failed to refresh access token", error);
      }
      clearTokens();
      return null;
    } finally {
      inFlightRefreshPromise = null;
    }
  })();

  return inFlightRefreshPromise;
};

const ensureAccessToken = async (): Promise<string | null> => {
  const token = getStoredAccessToken();
  if (token) return token;
  // If another caller is already refreshing, await its result instead of
  // racing a second refresh that would invalidate the first rotation.
  if (inFlightRefreshPromise) {
    return inFlightRefreshPromise;
  }
  return refreshAccessToken();
};

export const apiFetch = async <T = unknown>(path: string, options: FetchOptions = {}): Promise<T> => {
  const {
    skipAuth,
    headers,
    responseType = "json",
    retryOnFailure = true,
    maxRetries = 3,
    retryDelay = 1000,
    ...rest
  } = options;

  const requestHeaders = new Headers(headers);

  if (!skipAuth) {
    const token = await ensureAccessToken();
    if (!token) {
      redirectToLogin("session_expired");
      throw new AuthenticationError("Authentication required");
    }
    requestHeaders.set("Authorization", `Bearer ${token}`);
  }

  if (!requestHeaders.has("Content-Type") && rest.body && !(rest.body instanceof FormData)) {
    requestHeaders.set("Content-Type", "application/json");
  }

  if (responseType === "blob" && !requestHeaders.has("Accept")) {
    requestHeaders.set("Accept", "application/pdf, text/csv, */*;q=0.5");
  } else if (!requestHeaders.has("Accept")) {
    // Force JSON responses instead of HTML (Django REST Framework browsable API)
    requestHeaders.set("Accept", "application/json");
  }

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      let response: Response;
      const fullUrl = `${getBaseUrl()}${path}`;
      // Keep API logging opt-in; it can be extremely noisy and slow in dev.
      // Enable by running in the browser console:
      //   localStorage.setItem('debug_api', '1')
      // Disable:
      //   localStorage.removeItem('debug_api')
      const shouldLogApi =
        typeof window !== 'undefined' &&
        typeof window.localStorage !== 'undefined' &&
        window.localStorage.getItem('debug_api') === '1';
      if (shouldLogApi) {
        logInfo(`🔍 API Call: ${rest.method || 'GET'} ${fullUrl}`);
      }

      try {
        const method = (rest.method || "GET").toUpperCase();
        const cache = rest.cache ?? (method === "GET" ? "no-store" : undefined);

        if (method === "GET") {
          // De-duplicate concurrent identical GET requests (common with parallel mounts / strict mode).
          const dedupeKey = `${fullUrl}::${requestHeaders.get("Authorization") ?? ""}::${requestHeaders.get("Accept") ?? ""}`;
          let pending = inFlightGetRequests.get(dedupeKey);
          if (!pending) {
            pending = fetch(fullUrl, {
              ...rest,
              cache,
              headers: requestHeaders,
              credentials: "include",
            });
            inFlightGetRequests.set(dedupeKey, pending);
            pending.finally(() => {
              inFlightGetRequests.delete(dedupeKey);
            });
          }
          const baseResponse = await pending;
          response = baseResponse.clone();
        } else {
          response = await fetch(fullUrl, {
            ...rest,
            cache,
            headers: requestHeaders,
            credentials: "include",
          });
        }
      } catch (networkError: unknown) {
        // Handle network errors (Failed to fetch, CORS, etc.)
        // This typically means the backend is not running or unreachable
        const baseUrl = getBaseUrl();
        const networkErrorObj = networkError as any;
        if (networkErrorObj?.message === "Failed to fetch" || networkErrorObj?.name === "TypeError") {
          const error = new Error(`Unable to connect to the API server at ${baseUrl}. Please ensure the backend is running on the correct port.`);
          error.name = "NetworkError";
          // Don't log network errors as they're expected when backend is down
          // They'll be handled by the calling code
          throw error;
        }
        throw networkError;
      }

      // If we get here, the network request succeeded
      lastError = null;

      if (response.status === 401 && !skipAuth) {
        const failureCode = await peekAuthFailureCode(response);
        if (failureCode === "idle_timeout") {
          await logout();
          redirectToLogin("idle_timeout");
          throw new Error("Session expired due to inactivity.");
        }
        const permissionsStale =
          failureCode === "permissions_stale";
        if (permissionsStale) {
          await logout();
          redirectToLogin("permissions_stale");
          throw new Error("Your access permissions changed. Please sign in again.");
        }

        const refreshed = await refreshAccessToken();
        if (refreshed) {
          requestHeaders.set("Authorization", `Bearer ${refreshed}`);
          const method = (rest.method || "GET").toUpperCase();
          const cache = rest.cache ?? (method === "GET" ? "no-store" : undefined);
          const retryResponse = await fetch(`${getBaseUrl()}${path}`, {
            ...rest,
            cache,
            headers: requestHeaders,
            credentials: "include",
          });
          if (!retryResponse.ok) {
            if (retryResponse.status === 401) {
              redirectToLogin("session_expired");
              throw new AuthenticationError("Authentication required");
            }
            throw new Error(`API request failed: ${retryResponse.status}`);
          }
          if (retryResponse.status === 204) {
            return undefined as T;
          }
          if (responseType === "blob") {
            return (await retryResponse.blob()) as T;
          }
          if (responseType === "text") {
            return (await retryResponse.text()) as T;
          }
          notifySessionActivity();
          return await retryResponse.json() as T;
        }

        redirectToLogin("session_expired");
        throw new AuthenticationError("Authentication required");
      }

      if (!response.ok) {
        // For certain status codes, we might want to retry
        const shouldRetry = retryOnFailure && (
          response.status >= 500 || // Server errors
          response.status === 429 || // Rate limiting
          response.status === 408 // Request timeout
        );

        if (shouldRetry && attempt < maxRetries) {
          logWarn(`API request failed with ${response.status}, retrying (${attempt + 1}/${maxRetries})`);
          await new Promise(resolve => setTimeout(resolve, retryDelay * (attempt + 1)));
          continue;
        }

        // Try to read response body for error details
        let responseBody = '';
        try {
          responseBody = await response.text();
        } catch (e) {
          responseBody = 'Could not read response body';
        }

        // Extract a safe, user-friendly message from API responses (if present).
        let apiMessage: string | undefined;
        try {
          const parsed = JSON.parse(responseBody);
          if (parsed && typeof parsed === "object") {
            // DRF ErrorDetail and similar: coerce to string
            const rawDetail = (parsed as any).detail;
            let detailStr: string | undefined;
            if (typeof rawDetail === "string") detailStr = rawDetail;
            else if (rawDetail != null && typeof rawDetail === "object" && typeof (rawDetail as any).string === "string") {
              detailStr = String((rawDetail as any).string);
            }

            apiMessage =
              (typeof (parsed as any).error === "string" && (parsed as any).error) ||
              (typeof (parsed as any).message === "string" && (parsed as any).message) ||
              detailStr ||
              undefined;

            // DRF sometimes returns detail as a string[] (e.g. auth errors)
            if (!apiMessage && Array.isArray((parsed as any).detail)) {
              const parts = ((parsed as any).detail as unknown[]).filter((x): x is string => typeof x === "string");
              if (parts.length) apiMessage = parts.join(" ");
            }

            if (!apiMessage && (parsed as any).detail != null && typeof (parsed as any).detail === "object" && !Array.isArray((parsed as any).detail)) {
              const d = (parsed as any).detail as Record<string, unknown>;
              const flattened = Object.entries(d)
                .map(([k, v]) => {
                  if (Array.isArray(v) && v.length && typeof v[0] === "string") return `${k}: ${(v as string[])[0]}`;
                  if (typeof v === "string") return `${k}: ${v}`;
                  return null;
                })
                .filter(Boolean);
              if (flattened.length) apiMessage = flattened.join(" ");
              else {
                try {
                  apiMessage = JSON.stringify(d);
                } catch {
                  /* ignore */
                }
              }
            }

            // DRF non_field_errors
            if (!apiMessage && Array.isArray((parsed as any).non_field_errors)) {
              const parts = ((parsed as any).non_field_errors as unknown[]).filter((x): x is string => typeof x === "string");
              if (parts.length) apiMessage = parts.join(" ");
            }
            
            // Handle Django REST Framework validation errors
            // Format: {"field_name": ["error message"]} or nested list errors e.g. {"items": [{"quantity": ["..."]}]}
            if (!apiMessage) {
              const fieldErrors = Object.entries(parsed as Record<string, unknown>).filter(
                ([key, value]) =>
                  key !== 'detail' &&
                  key !== 'error' &&
                  key !== 'message' &&
                  key !== 'non_field_errors' &&
                  Array.isArray(value) &&
                  value.length > 0
              );

              if (fieldErrors.length > 0) {
                const [fieldName, errors] = fieldErrors[0];
                if (Array.isArray(errors) && errors.length > 0) {
                  const first = errors[0] as unknown;
                  if (typeof first === 'string') {
                    apiMessage = `${fieldName}: ${first}`;
                  } else if (first && typeof first === 'object' && !Array.isArray(first)) {
                    const nested = Object.entries(first as Record<string, unknown>)
                      .map(([k, v]) => {
                        if (Array.isArray(v) && v.length && typeof v[0] === 'string') return `${k}: ${(v as string[])[0]}`;
                        try {
                          return `${k}: ${JSON.stringify(v)}`;
                        } catch {
                          return `${k}: (invalid)`;
                        }
                      })
                      .join('; ');
                    apiMessage = nested ? `${fieldName}: ${nested}` : `${fieldName}: ${JSON.stringify(first)}`;
                  } else {
                    try {
                      apiMessage = `${fieldName}: ${JSON.stringify(errors)}`;
                    } catch {
                      apiMessage = `${fieldName}: validation failed`;
                    }
                  }
                }
              }
            }
          }
        } catch {
          // Not JSON (could be HTML); try a minimal hint in development.
        }

        const isDevBuild =
          typeof process !== "undefined" && process.env.NODE_ENV === "development";

        let fallbackMessage = "Request failed. Please try again";
        if (!apiMessage) {
          if (isDevBuild) {
            const titleMatch = responseBody.match(/<title[^>]*>([^<]+)<\/title>/i);
            const htmlTitle = titleMatch?.[1]?.trim();
            fallbackMessage = htmlTitle
              ? `${htmlTitle} (HTTP ${response.status})`
              : `HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ""} — ${response.url}`;
          } else if (response.statusText) {
            fallbackMessage = `${response.statusText}. Please try again.`;
          }
        }

        // NOTE:
        // - Some parts of the app intentionally probe optional endpoints and treat 404 as "not supported".
        // - For expected business-validation failures (4xx), callers should surface toast/messages
        //   without noisy console stack traces. Keep console.error for server-side failures only.
        if (response.status >= 500) {
          logError(`API request failed with status ${response.status}`, {
            url: response.url,
            status: response.status,
            statusText: response.statusText,
            body: responseBody
          });
        }
        const err = new Error(apiMessage || fallbackMessage);
        (err as any).status = response.status;
        (err as any).apiMessage = apiMessage;
        (err as any).body = responseBody;
        throw err;
      }

      if (response.status === 204) {
        if (!skipAuth) notifySessionActivity();
        return undefined as T;
      }

      if (responseType === "blob") {
        if (!skipAuth) notifySessionActivity();
        return (await response.blob()) as T;
      }
      if (responseType === "text") {
        if (!skipAuth) notifySessionActivity();
        return (await response.text()) as T;
      }
      if (!skipAuth) notifySessionActivity();
      return await response.json() as T;

    } catch (error: unknown) {
      lastError = error as Error;

      // Don't retry for certain types of errors
      const errorObj = error as any;
      if (errorObj.name === "NetworkError" ||
          errorObj.name === "AuthenticationError" ||
          errorObj.name === "AuthenticationExpiredError" ||
          (errorObj.message && errorObj.message.includes("API request failed: 4")) ||
          (typeof errorObj?.status === 'number' && errorObj.status >= 400 && errorObj.status < 500)) {
        throw error;
      }

      // For other errors, retry if we haven't exceeded max attempts
      if (retryOnFailure && attempt < maxRetries) {
        const errorObj = error as any;
        logWarn(`API request failed, retrying (${attempt + 1}/${maxRetries}): ${errorObj.message}`);
        await new Promise(resolve => setTimeout(resolve, retryDelay * (attempt + 1)));
        continue;
      }

      break; // Exit the retry loop
    }
  }

  // If we get here, all retries failed
  if (lastError) {
    throw lastError;
  }

  throw new Error("API request failed after all retries");
};

export interface LoginResponse {
  access: string;
  refresh: string;
  user: unknown;
  expires_in?: number;
}

/** `username` may be the account username or the user's email (backend resolves). */
export const login = async (
  username: string,
  password: string,
  options?: { persist?: boolean }
): Promise<LoginResponse> => {
  try {
    const response = await fetch(`${getBaseUrl()}/accounts/auth/token/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ username, password }),
      credentials: "include",
    });

    if (!response.ok) {
      // Security: never expose raw backend error messages
      if (response.status === 400) {
        throw new Error("Invalid username or password");
      } else if (response.status === 401) {
        throw new Error("Invalid username or password");
      } else if (response.status === 403) {
        throw new Error("Account access denied");
      } else if (response.status === 429) {
        throw new Error("Too many login attempts. Please try again later");
      } else if (response.status >= 500) {
        const baseUrl = getBaseUrl();
        throw new Error(
          `Sign-in service error (${response.status}). Check that the API is running and NEXT_PUBLIC_API_URL matches the backend (default ${baseUrl}).`
        );
      } else {
        throw new Error("Login failed. Please try again");
      }
    }

    const data = (await response.json()) as LoginResponse;
    storeTokens(data.access, data.refresh, data.expires_in, {
      persist: options?.persist ?? false,
    });
    notifySessionActivity();
    return data;
  } catch (error: unknown) {
    // Handle network errors (Failed to fetch, CORS, etc.)
    const errorObj = error as any;
    if (errorObj?.message === "Failed to fetch" || errorObj?.name === "TypeError") {
      const baseUrl = getBaseUrl();
      const networkError = new Error(`Unable to connect to the API server at ${baseUrl}. Please ensure the backend is running on the correct port.`);
      networkError.name = "NetworkError";
      throw networkError;
    }
    // Re-throw other errors (like invalid credentials)
    throw error;
  }
};

export const logout = async () => {
  const refresh = getStoredRefreshToken();
  if (refresh) {
    try {
      await fetch(`${getBaseUrl()}/accounts/auth/token/blacklist/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ refresh }),
        credentials: "include",
      });
    } catch (error) {
      logWarn("Failed to blacklist token", error);
    }
  }
  clearTokens();
};

export const hasTokens = () => {
  if (!isBrowser()) return false;
  migrateLegacyStorageKeysIfNeeded();
  return Boolean(getStoredAccessToken() || getStoredRefreshToken());
};

export const buildQueryString = (params: Record<string, string | number | boolean | undefined>) => {
  const entries = Object.entries(params).filter(([, value]) => value !== undefined && value !== "");
  if (entries.length === 0) return "";
  const query = new URLSearchParams(entries as [string, string][]);
  return `?${query.toString()}`;
};

const getTokenForImpersonation = () => {
  const original = getOriginalTokens();
  if (original?.access) {
    return { token: original.access, refresh: original.refresh, isOriginal: true };
  }
  const access = getStoredAccessToken();
  const refresh = getStoredRefreshToken();
  if (!access || !refresh) {
    return { token: null, refresh: null, isOriginal: false };
  }
  return { token: access, refresh, isOriginal: false };
};

export const impersonateUser = async (username: string) => {
  const { token: baseToken, refresh: baseRefresh, isOriginal } = getTokenForImpersonation();
  if (!baseToken) {
    throw new Error("Authentication required");
  }

  const attempt = async (accessToken: string) =>
    fetch(`${getBaseUrl()}/accounts/auth/impersonate/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ username }),
      credentials: "include",
    });

  let response = await attempt(baseToken);

  if (response.status === 401 && isOriginal && baseRefresh) {
    const refreshed = await refreshWithToken(baseRefresh);
    if (!refreshed || !refreshed.access) {
      clearOriginalTokens();
      throw new Error("Your Super Admin session expired. Please log in again.");
    }
    storeOriginalTokenValues(refreshed.access, refreshed.refresh ?? baseRefresh, refreshed.expires_in);
    response = await attempt(refreshed.access);
  }

  if (!response.ok) {
    // Security: Never expose raw backend error messages or status codes
    if (response.status === 403) {
      throw new Error("You don't have permission to impersonate users");
    } else if (response.status === 404) {
      throw new Error("User not found");
    } else {
      throw new Error("Unable to impersonate user. Please check permissions and try again");
    }
  }

  const data = (await response.json()) as LoginResponse;
  if (!data.refresh) {
    throw new Error("Impersonation response missing refresh token");
  }
  storeTokens(data.access, data.refresh, data.expires_in);
  return data;
};

/** User-facing message from apiFetch errors (message usually set by apiFetch with status/URL in dev). */
export function getReadableApiError(error: unknown): string {
  const e = error as Error & { status?: number; apiMessage?: string };
  if (e?.apiMessage) return e.apiMessage;
  if (e?.message?.trim()) return e.message;
  if (e?.status === 404) {
    return "This API was not found. Redeploy the backend and set NEXT_PUBLIC_API_URL to your API root (e.g. …/api or …/api/v1).";
  }
  if (e?.status === 401 || e?.status === 403) {
    return "Sign in again or check that your account can access this report.";
  }
  return "Something went wrong. Please try again.";
}
