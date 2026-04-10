"use client";

import { ReactNode, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { SidebarProvider } from '@/components/ui/sidebar';
import { AppSidebar } from './AppSidebar';
import { TopBar } from './TopBar';
import { hasTokens } from '@/lib/api-client';
import { useCurrentUser } from '@/hooks/use-current-user';
import { getHomeRouteForUser, isPathAllowedByPages } from '@/lib/home-route';

interface DashboardLayoutProps {
  children: ReactNode;
}

export const DashboardLayout = ({ children }: DashboardLayoutProps) => {
  const router = useRouter();
  const pathname = usePathname();
  const { currentUser, hydrated } = useCurrentUser();

  const homeRoute = useMemo(() => getHomeRouteForUser(currentUser), [currentUser]);

  // Prevent child pages from mounting (and firing API calls) until we've checked auth+permissions.
  const [canRender, setCanRender] = useState(false);

  useEffect(() => {
    // Must be authenticated for all pages that use DashboardLayout.
    if (!hasTokens()) {
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('redirect_after_login', window.location.pathname);
      }
      setCanRender(false);
      router.replace('/login');
      return;
    }

    // Wait for user hydration to know permissions.
    if (!hydrated) {
      setCanRender(false);
      return;
    }

    // If hydration completed but user is missing, force login.
    if (!currentUser) {
      setCanRender(false);
      router.replace('/login');
      return;
    }

    // Super admin can access all pages.
    if (currentUser.isSuperuser) {
      setCanRender(true);
      return;
    }

    // Always allow the no-access page for authenticated users (to avoid redirect loops).
    if (pathname === '/no-access' || pathname.startsWith('/no-access/')) {
      setCanRender(true);
      return;
    }

    const allowedPages = currentUser.permissions || [];
    const allowed = isPathAllowedByPages(pathname, allowedPages);
    if (!allowed) {
      setCanRender(false);
      router.replace(homeRoute || '/no-access');
      return;
    }

    setCanRender(true);
  }, [currentUser, hydrated, homeRoute, pathname, router]);

  if (!canRender) {
    // Keep it minimal to avoid flashing unauthorized UI.
    return null;
  }

  return (
    <SidebarProvider className="print:min-h-0 print:h-auto">
      <div className="h-screen flex w-full bg-muted/30 overflow-hidden print:h-auto print:min-h-0 print:overflow-visible print:bg-white">
        <AppSidebar />
        <div className="flex flex-1 flex-col w-full min-h-0 print:min-h-0 print:h-auto print:overflow-visible">
          <TopBar />
          <main className="flex min-h-0 flex-1 flex-col overflow-y-auto print:block print:h-auto print:min-h-0 print:flex-none print:overflow-visible">
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
};
