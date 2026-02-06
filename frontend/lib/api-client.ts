"use client";

import { logError, logWarn } from '@/lib/client-logger';
import { AuthenticationError, AuthenticationExpiredError } from './auth-errors';
import {
  ACCESS_TOKEN_COOKIE as ACCESS_TOKEN_KEY,
  REFRESH_TOKEN_COOKIE as REFRESH_TOKEN_KEY,
  ACCESS_TOKEN_EXP_COOKIE as ACCESS_TOKEN_EXP_KEY,
  AUTH_SESSION_COOKIE,
  LEGACY_ACCESS_TOKEN_COOKIE,
  LEGACY_REFRESH_TOKEN_COOKIE,
  LEGACY_ACCESS_TOKEN_EXP_COOKIE,
  LEGACY_AUTH_SESSION_COOKIE,
} from "@/lib/auth-cookie-names";
const ORIGINAL_ACCESS_TOKEN_KEY = "emr_original_access";
const ORIGINAL_REFRESH_TOKEN_KEY = "emr_original_refresh";
const ORIGINAL_ACCESS_EXP_KEY = "emr_original_access_exp";
const LEGACY_ORIGINAL_ACCESS_TOKEN_KEY = "npa_ecm_original_access";
const LEGACY_ORIGINAL_REFRESH_TOKEN_KEY = "npa_ecm_original_refresh";
const LEGACY_ORIGINAL_ACCESS_EXP_KEY = "npa_ecm_original_access_exp";

const getBaseUrl = () => {
  const base = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8001/api";
  return base.endsWith("/") ? base.slice(0, -1) : base;
};

const isBrowser = () => typeof window !== "undefined";

const getCookie = (name: string): string | null => {
  if (!isBrowser()) return null;
  const escaped = name.replace(/[$()*+.?[\\\]^{|}-]/g, "\\$&");
  const match = document.cookie.match(new RegExp(`(?:^|; )${escaped}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
};

const setCookie = (name: string, value: string, maxAgeSeconds?: number) => {
  if (!isBrowser()) return;
  const maxAge = typeof maxAgeSeconds === "number" ? `; Max-Age=${Math.max(0, Math.floor(maxAgeSeconds))}` : "";
  document.cookie = `${name}=${encodeURIComponent(value)}; Path=/; SameSite=Lax${maxAge}`;
};

const clearCookie = (name: string) => {
  if (!isBrowser()) return;
  document.cookie = `${name}=; Path=/; SameSite=Lax; Max-Age=0`;
};

let didMigrateStorageKeys = false;
const migrateLegacyStorageKeysIfNeeded = () => {
  if (!isBrowser()) return;
  if (didMigrateStorageKeys) return;
  didMigrateStorageKeys = true;

  // Migrate auth tokens (npa_ecm_* -> emr_*)
  const newAccess = localStorage.getItem(ACCESS_TOKEN_KEY) ?? getCookie(ACCESS_TOKEN_KEY);
  const newRefresh = localStorage.getItem(REFRESH_TOKEN_KEY) ?? getCookie(REFRESH_TOKEN_KEY);
  const newExp = localStorage.getItem(ACCESS_TOKEN_EXP_KEY) ?? getCookie(ACCESS_TOKEN_EXP_KEY);

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
    setCookie(REFRESH_TOKEN_KEY, legacyRefresh, 60 * 60 * 24 * 7);
    if (typeof expiresAt === "number" && Number.isFinite(expiresAt)) {
      setCookie(ACCESS_TOKEN_EXP_KEY, `${expiresAt}`, remainingSeconds);
    }
    setCookie(AUTH_SESSION_COOKIE, "1", 60 * 60 * 24 * 7);

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
  const token = localStorage.getItem(ACCESS_TOKEN_KEY) ?? getCookie(ACCESS_TOKEN_KEY);
  const expiresAtRaw = localStorage.getItem(ACCESS_TOKEN_EXP_KEY) ?? getCookie(ACCESS_TOKEN_EXP_KEY);
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
  return localStorage.getItem(REFRESH_TOKEN_KEY) ?? getCookie(REFRESH_TOKEN_KEY);
};

export const storeTokens = (accessToken: string, refreshToken: string, expiresInSeconds?: number) => {
  if (!isBrowser()) return;
  migrateLegacyStorageKeysIfNeeded();
  localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
  localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
  const effectiveExpires = typeof expiresInSeconds === "number" ? expiresInSeconds : 60 * 60;
  const expiresAt = Date.now() + effectiveExpires * 1000 - 30 * 1000; // refresh a little early
  localStorage.setItem(ACCESS_TOKEN_EXP_KEY, `${expiresAt}`);

  // Mirror tokens into cookies so middleware can enforce auth on first request.
  setCookie(ACCESS_TOKEN_KEY, accessToken, effectiveExpires);
  // Refresh tokens are typically longer-lived; keep it for a week by default.
  setCookie(REFRESH_TOKEN_KEY, refreshToken, 60 * 60 * 24 * 7);
  // Store expiry as epoch ms so client can validate even when reading from cookies.
  setCookie(ACCESS_TOKEN_EXP_KEY, `${expiresAt}`, effectiveExpires);
  // Lightweight auth flag for middleware.
  setCookie(AUTH_SESSION_COOKIE, "1", 60 * 60 * 24 * 7);

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
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  localStorage.removeItem(ACCESS_TOKEN_EXP_KEY);
  localStorage.removeItem('demo_user'); // Clear demo user on logout

  clearCookie(ACCESS_TOKEN_KEY);
  clearCookie(REFRESH_TOKEN_KEY);
  clearCookie(ACCESS_TOKEN_EXP_KEY);
  clearCookie(AUTH_SESSION_COOKIE);
  clearCookie(LEGACY_AUTH_SESSION_COOKIE);

  // Also clear legacy token keys.
  localStorage.removeItem(LEGACY_ACCESS_TOKEN_COOKIE);
  localStorage.removeItem(LEGACY_REFRESH_TOKEN_COOKIE);
  localStorage.removeItem(LEGACY_ACCESS_TOKEN_EXP_COOKIE);
  clearCookie(LEGACY_ACCESS_TOKEN_COOKIE);
  clearCookie(LEGACY_REFRESH_TOKEN_COOKIE);
  clearCookie(LEGACY_ACCESS_TOKEN_EXP_COOKIE);
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
      return null;
    }

    const data = (await response.json()) as LoginResponse;
    return data;
  } catch (error: any) {
    // Handle network errors (Failed to fetch, CORS, etc.)
    // This typically means the backend is not running or unreachable
    if (error?.message === "Failed to fetch" || error?.name === "TypeError") {
      logWarn("Unable to refresh token - backend may be unavailable", { error: error.message });
      return null;
    }
    // Re-throw other errors
    throw error;
  }
};

const refreshAccessToken = async (): Promise<string | null> => {
  const refreshToken = getStoredRefreshToken();
  if (!refreshToken) return null;

  try {
    const data = await refreshWithToken(refreshToken);
    if (!data || !data.access) {
      clearTokens();
      return null;
    }
    storeTokens(data.access, data.refresh ?? refreshToken, data.expires_in);
    return data.access;
  } catch (error: any) {
    // Only log non-network errors (network errors are already handled in refreshWithToken)
    if (error?.message !== "Failed to fetch" && error?.name !== "TypeError") {
      logError("Failed to refresh access token", error);
    }
    // Clear tokens on any error to prevent retry loops
    clearTokens();
  }

  return null;
};

const ensureAccessToken = async (): Promise<string | null> => {
  const token = getStoredAccessToken();
  if (token) return token;
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
      throw new AuthenticationError("Authentication required");
    }
    requestHeaders.set("Authorization", `Bearer ${token}`);
  }

  if (!requestHeaders.has("Content-Type") && rest.body && !(rest.body instanceof FormData)) {
    requestHeaders.set("Content-Type", "application/json");
  }

  // Force JSON responses instead of HTML (Django REST Framework browsable API)
  if (!requestHeaders.has("Accept")) {
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
        console.log(`🔍 API Call: ${rest.method || 'GET'} ${fullUrl}`);
      }

      try {
        const method = (rest.method || "GET").toUpperCase();
        const cache = rest.cache ?? (method === "GET" ? "no-store" : undefined);
        response = await fetch(fullUrl, {
          ...rest,
          cache,
          headers: requestHeaders,
          credentials: "include",
        });
      } catch (networkError: any) {
        // Handle network errors (Failed to fetch, CORS, etc.)
        // This typically means the backend is not running or unreachable
        const baseUrl = getBaseUrl();
        if (networkError?.message === "Failed to fetch" || networkError?.name === "TypeError") {
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
            throw new Error(`API request failed: ${retryResponse.status}`);
          }
          if (retryResponse.status === 204) {
            return undefined as T;
          }
          return await retryResponse.json() as T;
        }
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
        // This avoids leaking HTTP status codes while still surfacing why something failed.
        let apiMessage: string | undefined;
        try {
          const parsed = JSON.parse(responseBody);
          if (parsed && typeof parsed === "object") {
            apiMessage =
              (typeof (parsed as any).error === "string" && (parsed as any).error) ||
              (typeof (parsed as any).detail === "string" && (parsed as any).detail) ||
              undefined;
          }
        } catch {
          // Not JSON (could be HTML); ignore.
        }

        // NOTE:
        // - Some parts of the app intentionally probe optional endpoints and treat 404 as "not supported".
        // - Avoid spamming console.error for 404s; callers can still branch on (err as any).status.
        if (response.status !== 404) {
          // Security: Never expose raw HTTP status codes to prevent information leakage
          console.error(`API request failed with status ${response.status}`, {
            url: response.url,
            status: response.status,
            statusText: response.statusText,
            body: responseBody
          });
        }
        const err = new Error(apiMessage || 'Request failed. Please try again');
        (err as any).status = response.status;
        (err as any).apiMessage = apiMessage;
        (err as any).body = responseBody;
        throw err;
      }

      if (response.status === 204) {
        return undefined as T;
      }

      return await response.json() as T;

    } catch (error: any) {
      lastError = error;

      // Don't retry for certain types of errors
      if (error.name === "NetworkError" ||
          error.name === "AuthenticationError" ||
          error.name === "AuthenticationExpiredError" ||
          (error.message && error.message.includes("API request failed: 4")) ||
          (typeof error?.status === 'number' && error.status >= 400 && error.status < 500)) {
        throw error;
      }

      // For other errors, retry if we haven't exceeded max attempts
      if (retryOnFailure && attempt < maxRetries) {
        logWarn(`API request failed, retrying (${attempt + 1}/${maxRetries}): ${error.message}`);
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

export const login = async (username: string, password: string): Promise<LoginResponse> => {
  try {
    // Real API call
    const response = await fetch(`${getBaseUrl()}/accounts/auth/token/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ username, password }),
      credentials: "include",
    });

    if (!response.ok) {
      // Security: Never expose raw backend error messages to prevent information leakage
      // Always use generic, non-descriptive error messages
      if (response.status === 400) {
        throw new Error("Invalid username or password");
      } else if (response.status === 401) {
        throw new Error("Invalid username or password");
      } else if (response.status === 403) {
        throw new Error("Account access denied");
      } else if (response.status === 429) {
        throw new Error("Too many login attempts. Please try again later");
      } else {
        throw new Error("Login failed. Please try again");
      }
    }

    const data = (await response.json()) as LoginResponse;
    storeTokens(data.access, data.refresh, data.expires_in);
    return data;
  } catch (error: any) {
    // Handle network errors (Failed to fetch, CORS, etc.)
    if (error?.message === "Failed to fetch" || error?.name === "TypeError") {
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
  const access = localStorage.getItem(ACCESS_TOKEN_KEY) ?? getCookie(ACCESS_TOKEN_KEY);
  const refresh = localStorage.getItem(REFRESH_TOKEN_KEY) ?? getCookie(REFRESH_TOKEN_KEY);
  return Boolean(access && refresh);
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

/**
 * Get the media base URL from the API URL configuration
 */
const getMediaBaseUrl = () => {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8001/api";
  // Remove '/api' from the end to get the base URL for media
  return apiUrl.endsWith("/api") ? apiUrl.slice(0, -4) : apiUrl;
};

/**
 * Construct a full photo URL from a relative path
 * @param relativePath - Relative path from backend (e.g., "/media/patients/photos/image.jpg")
 * @returns Full URL or null if path is invalid
 */
export const getPhotoUrl = (relativePath: string | null | undefined): string | null => {
  if (!relativePath) return null;
  if (relativePath.startsWith('http://') || relativePath.startsWith('https://')) {
    return relativePath; // Already a full URL
  }
  if (relativePath.startsWith('/media/')) {
    return `${getMediaBaseUrl()}${relativePath}`;
  }
  return null; // Unknown format
};
