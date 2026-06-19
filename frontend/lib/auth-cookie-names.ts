// Shared cookie names used by both client code and Next.js middleware.
// Keep these values stable to avoid breaking existing sessions.

// Token storage (cookies + localStorage). Renamed from npa_ecm_* -> emr_*.
export const ACCESS_TOKEN_COOKIE = "emr_access_token";
export const REFRESH_TOKEN_COOKIE = "emr_refresh_token";
export const ACCESS_TOKEN_EXP_COOKIE = "emr_access_exp";
export const REFRESH_TOKEN_EXP_COOKIE = "emr_refresh_exp";

// Auth context cookies (used by middleware for authorization redirects).
export const AUTH_ALLOWED_PAGES_COOKIE = "emr_allowed_pages";
export const AUTH_IS_SUPERUSER_COOKIE = "emr_is_superuser"; // "1" | "0"
export const AUTH_HOME_ROUTE_COOKIE = "emr_home"; // e.g. "/nursing"

// Lightweight auth flag cookie used by middleware.
// We can't reliably validate JWTs in middleware without a shared secret + full parsing,
// but we can at least prevent immediate redirect loops by checking a small cookie that
// we set on successful login.
export const AUTH_SESSION_COOKIE = "emr_auth"; // "1"

// Redirect target set by middleware when it sends a user to /login.
export const AUTH_NEXT_REDIRECT_COOKIE = "emr_next";

// Legacy names (for cleanup / smooth migration).
export const LEGACY_AUTH_ALLOWED_PAGES_COOKIE = "npa_emr_allowed_pages";
export const LEGACY_AUTH_IS_SUPERUSER_COOKIE = "npa_emr_is_superuser";
export const LEGACY_AUTH_HOME_ROUTE_COOKIE = "npa_emr_home";
export const LEGACY_AUTH_SESSION_COOKIE = "npa_emr_auth";
export const LEGACY_AUTH_NEXT_REDIRECT_COOKIE = "npa_emr_next";

// Legacy token names (for migration).
export const LEGACY_ACCESS_TOKEN_COOKIE = "npa_ecm_access_token";
export const LEGACY_REFRESH_TOKEN_COOKIE = "npa_ecm_refresh_token";
export const LEGACY_ACCESS_TOKEN_EXP_COOKIE = "npa_ecm_access_exp";
export const LEGACY_REFRESH_TOKEN_EXP_COOKIE = "npa_ecm_refresh_exp";

