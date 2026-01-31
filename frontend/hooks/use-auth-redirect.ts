/**
 * Hook to handle authentication redirects
 */
"use client";

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { hasTokens } from '@/lib/api-client';
import { isAuthenticationError } from '@/lib/auth-errors';
import { AUTH_NEXT_REDIRECT_COOKIE, LEGACY_AUTH_NEXT_REDIRECT_COOKIE } from '@/lib/auth-cookie-names';

export const useAuthRedirect = (error: unknown | null, redirectTo: string = '/login') => {
  const router = useRouter();

  useEffect(() => {
    // If there's an authentication error and no tokens, redirect to login
    if (error && isAuthenticationError(error)) {
      if (!hasTokens()) {
        // Store the current path to redirect back after login
        if (typeof window !== 'undefined') {
          const currentPath = window.location.pathname;
          sessionStorage.setItem('redirect_after_login', currentPath);
        }
        router.push(redirectTo);
      }
    }
  }, [error, redirectTo, router]);
};

/**
 * Get the stored redirect path after login
 */
export const getStoredRedirectPath = (): string | null => {
  if (typeof window === 'undefined') return null;
  const path = sessionStorage.getItem('redirect_after_login');
  if (path) {
    sessionStorage.removeItem('redirect_after_login');
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
