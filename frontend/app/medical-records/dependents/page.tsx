"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { DashboardLayout } from "@/components/shared/DashboardLayout";
import { Loader2 } from "lucide-react";

/**
 * Legacy route: dependents are managed under Manage Patients.
 * Preserves bookmarks and role permissions that still reference this path.
 */
export default function DependentsLegacyRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/medical-records/patients?category=dependent");
  }, [router]);

  return (
    <DashboardLayout>
      <div className="container mx-auto p-6 flex flex-col items-center justify-center gap-3 min-h-[40vh]">
        <Loader2 className="h-10 w-10 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Redirecting to Manage Patients…</p>
      </div>
    </DashboardLayout>
  );
}
