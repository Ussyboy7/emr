"use client";

import { ThemeProvider } from "next-themes";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Toaster } from "@/components/ui/sonner";
import { ClientErrorBoundary } from '@/components/shared/ClientErrorBoundary';
import { Toaster as ToastToaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { OrganizationProvider } from "@/contexts/OrganizationContext";
import { ClinicProvider } from "@/contexts/ClinicContext";
import { ServerDateProvider } from "@/components/providers/ServerDateProvider";
import { useCurrentUser } from "@/hooks/use-current-user";
import { getHomeRouteForUser, isPathAllowedByPages } from "@/lib/home-route";

function AuthzGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { currentUser, hydrated } = useCurrentUser();
  const homeRoute = useMemo(() => getHomeRouteForUser(currentUser), [currentUser]);

  const isPublicRoute = pathname === "/" || pathname === "/login";

  // Prevent child routes from mounting (and firing API calls) until we've checked auth+permissions.
  const [canRender, setCanRender] = useState(false);

  useEffect(() => {
    if (isPublicRoute || pathname === "/_not-found") {
      setCanRender(true);
      return;
    }

    if (!hydrated) {
      setCanRender(false);
      return;
    }

    if (!currentUser) {
      if (typeof window !== "undefined") {
        sessionStorage.setItem("redirect_after_login", window.location.pathname);
      }
      setCanRender(false);
      router.replace("/login");
      return;
    }

    if (currentUser.isSuperuser) {
      setCanRender(true);
      return;
    }

    // Always allow the no-access page for authenticated users (to avoid redirect loops).
    if (pathname === "/no-access" || pathname.startsWith("/no-access/")) {
      setCanRender(true);
      return;
    }

    const allowedPages = currentUser.permissions || [];
    const allowed = isPathAllowedByPages(pathname, allowedPages);
    if (!allowed) {
      setCanRender(false);
      router.replace(homeRoute || "/no-access");
      return;
    }

    setCanRender(true);
  }, [currentUser, hydrated, homeRoute, isPublicRoute, pathname, router]);

  if (!canRender) return null;
  return children;
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <OrganizationProvider>
        <ClinicProvider>
          <ClientErrorBoundary>
            <TooltipProvider>
              <ServerDateProvider>
                <AuthzGate>{children}</AuthzGate>
              </ServerDateProvider>
              <Toaster />
              <ToastToaster />
            </TooltipProvider>
          </ClientErrorBoundary>
        </ClinicProvider>
      </OrganizationProvider>
    </ThemeProvider>
  );
}
