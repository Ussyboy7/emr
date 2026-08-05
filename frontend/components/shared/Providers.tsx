"use client";

import { ThemeProvider } from "next-themes";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo } from "react";
import { Toaster } from "@/components/ui/sonner";
import { ClientErrorBoundary } from '@/components/shared/ClientErrorBoundary';
import { Toaster as ToastToaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { OrganizationProvider } from "@/contexts/OrganizationContext";
import { ClinicProvider, useClinicContext } from "@/contexts/ClinicContext";
import { ServerDateProvider } from "@/components/providers/ServerDateProvider";
import { useCurrentUser } from "@/hooks/use-current-user";
import { getHomeRouteForUser, isPathAllowedByPages } from "@/lib/home-route";
import { SessionGuard } from "@/components/shared/SessionGuard";

function AuthzGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { currentUser, hydrated } = useCurrentUser();
  const homeRoute = useMemo(() => getHomeRouteForUser(currentUser), [currentUser]);

  const isPublicRoute = pathname === "/" || pathname === "/login";

  const canRender = useMemo(() => {
    if (isPublicRoute || pathname === "/_not-found") return true;
    if (!hydrated || !currentUser) return false;
    if (currentUser.isSuperuser) return true;
    if (pathname === "/no-access" || pathname.startsWith("/no-access/")) return true;
    return isPathAllowedByPages(
      pathname,
      currentUser.permissions || [],
      currentUser.deniedPages || [],
    );
  }, [currentUser, hydrated, isPublicRoute, pathname]);

  useEffect(() => {
    if (isPublicRoute || pathname === "/_not-found" || !hydrated) return;

    if (!currentUser) {
      if (typeof window !== "undefined") {
        sessionStorage.setItem("redirect_after_login", window.location.pathname);
      }
      router.replace("/login");
      return;
    }

    if (currentUser.isSuperuser) return;
    if (pathname === "/no-access" || pathname.startsWith("/no-access/")) return;

    const allowed = isPathAllowedByPages(
      pathname,
      currentUser.permissions || [],
      currentUser.deniedPages || [],
    );
    if (!allowed) {
      router.replace(homeRoute || "/no-access");
    }
  }, [currentUser, hydrated, homeRoute, isPublicRoute, pathname, router]);

  if (!canRender) return null;
  return (
    <>
      <SessionGuard />
      {children}
    </>
  );
}

function ClinicScopeTree({ children }: { children: React.ReactNode }) {
  // Remounts the page tree whenever the active clinic changes so data-fetching
  // effects re-run against the new scope (replaces the old full-page reload).
  const { clinicVersion } = useClinicContext();
  return <div key={clinicVersion} className="contents">{children}</div>;
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
          <ClinicScopeTree>
            <ClientErrorBoundary>
              <TooltipProvider>
                <ServerDateProvider>
                  <AuthzGate>{children}</AuthzGate>
                </ServerDateProvider>
                <Toaster />
                <ToastToaster />
              </TooltipProvider>
            </ClientErrorBoundary>
          </ClinicScopeTree>
        </ClinicProvider>
      </OrganizationProvider>
    </ThemeProvider>
  );
}
