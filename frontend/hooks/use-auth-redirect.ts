/**
 * Hook to handle authentication redirects
 */
"use client";

import { useEffect } from "react";
import { redirectToLogin } from "@/lib/api-client";
import { isAuthenticationError } from "@/lib/auth-errors";
import { AUTH_NEXT_REDIRECT_COOKIE, LEGACY_AUTH_NEXT_REDIRECT_COOKIE } from "@/lib/auth-cookie-names";

export const useAuthRedirect = (error: unknown | null) => {
  useEffect(() => {
    if (error && isAuthenticationError(error)) {
      redirectToLogin("session_expired");
    }
  }, [error]);
};

/**
 * Get the stored redirect path after login
 */
export const getStoredRedirectPath = (): string | null => {
  if (typeof window === "undefined") return null;
  const path = sessionStorage.getItem("redirect_after_login");
  if (path) {
    sessionStorage.removeItem("redirect_after_login");
    return path;
  }

  // Fallback: middleware can set a short-lived cookie for server-side redirects.
  const readCookie = (name: string) => {
    const escaped = name.replace(/[$()*+.?[\\\]^{|}-]/g, "\\$&");
    const match = document.cookie.match(new RegExp(`(?:^|; )${escaped}=([^;]*)`));
    if (!match) return null;
    const value = decodeURIComponent(match[1] || "");
    document.cookie = `${name}=; Path=/; SameSite=Lax; Max-Age=0`;
    return value || null;
  };

  return readCookie(AUTH_NEXT_REDIRECT_COOKIE) ?? readCookie(LEGACY_AUTH_NEXT_REDIRECT_COOKIE);
};
