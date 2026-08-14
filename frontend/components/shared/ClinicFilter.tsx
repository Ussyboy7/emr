"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";
import { useClinic } from "@/hooks/use-clinic";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Building2 } from "lucide-react";

/**
 * By-clinic filter for aggregate pages. Appends `?clinic_id=<id>` (or removes
 * it for "All clinics") to the current URL so the page's data-fetching effects
 * re-run against the requested scope. Only meaningful once the backend has
 * multi-clinic enabled and the user can view more than one clinic.
 */
export function ClinicFilter({ paramName = "clinic_id" }: { paramName?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { clinics, allClinics, canViewAllClinics, isMultiClinic, activeClinicId } = useClinic();
  const clinicList = canViewAllClinics ? allClinics : clinics;

  const visible = isMultiClinic || canViewAllClinics || clinics.length > 1;

  const value = useMemo(() => {
    const raw = searchParams.get(paramName);
    if (raw === "all") return "__all__";
    if (raw) return raw;
    return activeClinicId != null ? String(activeClinicId) : "__all__";
  }, [searchParams, paramName, activeClinicId]);

  const onChange = useCallback(
    (next: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next === "__all__") {
        params.delete(paramName);
      } else {
        params.set(paramName, next);
      }
      const qs = params.toString();
      router.push(qs ? `${pathname}?${qs}` : pathname);
    },
    [router, searchParams, pathname, paramName],
  );

  if (!visible) return null;

  return (
    <div className="flex items-center gap-2 text-sm">
      <Building2 className="h-4 w-4 text-muted-foreground" />
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="w-[180px] h-8 text-xs">
          <SelectValue placeholder="All clinics" />
        </SelectTrigger>
        <SelectContent align="start">
          {(canViewAllClinics || activeClinicId == null) && (
            <SelectItem value="__all__">All clinics</SelectItem>
          )}
          {clinicList.map((clinic) => (
            <SelectItem key={clinic.id} value={String(clinic.id)}>
              {clinic.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
