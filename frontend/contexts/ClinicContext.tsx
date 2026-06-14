"use client";

import { createContext, useContext, useEffect, useMemo, useState, useCallback, type ReactNode } from "react";
import { apiFetch } from "@/lib/api-client";
import { MAX_LIST_PAGE_SIZE } from "@/lib/pagination-constants";
import { useCurrentUser } from "@/hooks/use-current-user";

export interface ClinicInfo {
  id: number;
  name: string;
  code?: string;
}

interface ClinicContextType {
  activeClinicId: number | null;
  activeClinicName: string | null;
  clinics: ClinicInfo[];
  isMultiClinic: boolean;
  switchClinic: (clinicId: number) => Promise<void>;
  loading: boolean;
}

const ClinicContext = createContext<ClinicContextType | undefined>(undefined);

export function ClinicProvider({ children }: { children: ReactNode }) {
  const { currentUser, hydrated, refresh } = useCurrentUser();
  const [allClinics, setAllClinics] = useState<ClinicInfo[]>([]);
  const [clinicsLoaded, setClinicsLoaded] = useState(false);
  const [switching, setSwitching] = useState(false);

  const clinics_ids = currentUser?.clinics_ids;
  const active_clinic_id = currentUser?.active_clinic_id ?? null;
  const multi_clinic_enabled = currentUser?.multi_clinic_enabled ?? false;

  // Auto-set active clinic to the first assigned clinic if none is set yet
  useEffect(() => {
    if (!hydrated || !currentUser || !multi_clinic_enabled) return;
    if (active_clinic_id !== null && active_clinic_id !== undefined) return;
    if (!clinics_ids || clinics_ids.length === 0) return;
    apiFetch("/accounts/auth/me/", {
      method: "PATCH",
      body: JSON.stringify({ active_clinic: clinics_ids[0] }),
    }).then(() => refresh()).catch(() => {});
  }, [hydrated, currentUser, clinics_ids, active_clinic_id, multi_clinic_enabled, refresh]);

  useEffect(() => {
    if (!hydrated || !currentUser || !clinics_ids || clinics_ids.length === 0) {
      setClinicsLoaded(false);
      return;
    }
    let cancelled = false;
    apiFetch<{ results: { id: number; name: string; code?: string }[] }>(
      `/organization/clinics/?page_size=${MAX_LIST_PAGE_SIZE}`
    )
      .then((data) => {
        if (cancelled) return;
        const clinics = data.results || [];
        setAllClinics(clinics);
        setClinicsLoaded(true);
      })
      .catch(() => {
        if (cancelled) return;
        setClinicsLoaded(true);
      });
    return () => { cancelled = true; };
  }, [hydrated, currentUser, clinics_ids]);

  const userClinics = useMemo(() => {
    if (!clinics_ids || clinics_ids.length === 0) return [];
    const ids = new Set(clinics_ids);
    return allClinics.filter((c) => ids.has(c.id));
  }, [allClinics, clinics_ids]);

  const activeClinicName = useMemo(() => {
    if (!active_clinic_id) return null;
    return allClinics.find((c) => c.id === active_clinic_id)?.name ?? null;
  }, [allClinics, active_clinic_id]);

  const switchClinic = useCallback(async (clinicId: number) => {
    setSwitching(true);
    try {
      await apiFetch("/accounts/auth/me/", {
        method: "PATCH",
        body: JSON.stringify({ active_clinic: clinicId }),
      });
      await refresh();
      // Reload the page so all data-fetching hooks re-run with the new clinic ID
      window.location.reload();
    } finally {
      setSwitching(false);
    }
  }, [refresh]);

  const value = useMemo(() => ({
    activeClinicId: active_clinic_id,
    activeClinicName,
    clinics: userClinics,
    isMultiClinic: multi_clinic_enabled && userClinics.length > 1,
    switchClinic,
    loading: !clinicsLoaded || switching,
  }), [active_clinic_id, activeClinicName, userClinics, multi_clinic_enabled, switchClinic, clinicsLoaded, switching]);

  return (
    <ClinicContext.Provider value={value}>
      {children}
    </ClinicContext.Provider>
  );
}

export function useClinicContext() {
  const context = useContext(ClinicContext);
  if (!context) {
    throw new Error("useClinicContext must be used within ClinicProvider");
  }
  return context;
}
