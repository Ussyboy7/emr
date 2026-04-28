"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { hasTokens, logout } from "@/lib/api-client";
import { useCurrentUser } from "@/hooks/use-current-user";
import { getHomeRouteForUser } from "@/lib/home-route";

export default function NoAccessPage() {
  const router = useRouter();
  const { currentUser, hydrated } = useCurrentUser();

  const homeRoute = useMemo(() => getHomeRouteForUser(currentUser), [currentUser]);

  // If a user's permissions get fixed while they are here, send them "home".
  useEffect(() => {
    if (!hydrated) return;
    if (!hasTokens()) {
      router.replace("/login");
      return;
    }
    if (homeRoute) router.replace(homeRoute);
  }, [hydrated, homeRoute, router]);

  const onLogout = async () => {
    await logout();
    window.location.replace("/login");
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-950 p-6">
      <Card className="w-full max-w-xl border-slate-800 bg-slate-900/50">
        <CardHeader>
          <CardTitle className="text-white">Access not configured</CardTitle>
          <CardDescription className="text-slate-400">
            Your account does not have access to any module pages. Please contact an administrator to assign a role.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Button onClick={onLogout} className="w-full">
            Sign out
          </Button>
          <Button asChild variant="outline" className="w-full border-slate-700 text-slate-200">
            <Link href="/help">Help & Support</Link>
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
