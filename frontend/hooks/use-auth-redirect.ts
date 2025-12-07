/**
 * Hook to handle authentication redirects
 */
"use client";

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { hasTokens } from '@/lib/api-client';
import { isAuthenticationError } from '@/lib/auth-errors';

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
  }
  return path;
};
