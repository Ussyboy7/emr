"use client";

import { createContext, useContext, useEffect, useMemo, useState, useCallback, useRef, type ReactNode } from "react";
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
  allClinics: ClinicInfo[];
  isMultiClinic: boolean;
  canViewAllClinics: boolean;
  switchClinic: (clinicId: number | null) => Promise<void>;
  clinicVersion: number;
  loading: boolean;
}

const ClinicContext = createContext<ClinicContextType | undefined>(undefined);

export function ClinicProvider({ children }: { children: ReactNode }) {
  const { currentUser, hydrated, refresh } = useCurrentUser();
  const [allClinics, setAllClinics] = useState<ClinicInfo[]>([]);
  const [clinicsLoaded, setClinicsLoaded] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [clinicVersion, setClinicVersion] = useState(0);

  const location_clinics = currentUser?.location_clinics;
  const active_clinic_id = currentUser?.active_clinic_id ?? null;
  const multi_clinic_enabled = currentUser?.multi_clinic_enabled ?? false;
  const currentUserId = currentUser?.id;
  const autoSetClinicAttemptedRef = useRef(false);

  const canViewAllClinics = Boolean(
    currentUser?.isSuperuser ||
      currentUser?.capabilities?.includes("clinical_data_view_all"),
  );

  // Auto-set active clinic to the first assigned clinic if none is set yet (once per session).
  useEffect(() => {
    if (!hydrated || !currentUserId || !multi_clinic_enabled) return;
    if (active_clinic_id !== null && active_clinic_id !== undefined) return;
    if (!location_clinics || location_clinics.length === 0) return;
    if (autoSetClinicAttemptedRef.current) return;

    autoSetClinicAttemptedRef.current = true;
    apiFetch("/accounts/auth/me/", {
      method: "PATCH",
      body: JSON.stringify({ active_clinic: location_clinics[0] }),
    })
      .then(() => refresh())
      .catch(() => {
        autoSetClinicAttemptedRef.current = false;
      });
  }, [hydrated, currentUserId, location_clinics, active_clinic_id, multi_clinic_enabled, refresh]);

  useEffect(() => {
    if (!hydrated || !currentUserId) {
      setClinicsLoaded(false);
      return;
    }
    const hasAssigned = Boolean(location_clinics && location_clinics.length > 0);
    if (!hasAssigned && !canViewAllClinics) {
      setClinicsLoaded(false);
      return;
    }
    let cancelled = false;
    apiFetch<{ results: { id: number; name: string; code?: string }[] }>(
      `/organization/clinics/?light=1&page_size=${MAX_LIST_PAGE_SIZE}`
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
  }, [hydrated, currentUserId, location_clinics, canViewAllClinics]);

  const userClinics = useMemo(() => {
    if (!location_clinics || location_clinics.length === 0) return [];
    const ids = new Set(location_clinics);
    return allClinics.filter((c) => ids.has(c.id));
  }, [allClinics, location_clinics]);

  const activeClinicName = useMemo(() => {
    if (!active_clinic_id) return null;
    return allClinics.find((c) => c.id === active_clinic_id)?.name ?? null;
  }, [allClinics, active_clinic_id]);

  const switchClinic = useCallback(async (clinicId: number | null) => {
    setSwitching(true);
    try {
      await apiFetch("/accounts/auth/me/", {
        method: "PATCH",
        body: JSON.stringify({ active_clinic: clinicId }),
      });
      await refresh();
      // Bump the clinic version so Providers remounts the page tree below this
      // context. Every data-fetching effect re-runs against the new clinic scope
      // without a full browser reload.
      setClinicVersion((v) => v + 1);
    } finally {
      setSwitching(false);
    }
  }, [refresh]);

  const value = useMemo(() => ({
    activeClinicId: active_clinic_id,
    activeClinicName,
    clinics: userClinics,
    allClinics,
    isMultiClinic: multi_clinic_enabled && userClinics.length > 1,
    canViewAllClinics,
    switchClinic,
    clinicVersion,
    loading: !clinicsLoaded || switching,
  }), [active_clinic_id, activeClinicName, userClinics, allClinics, multi_clinic_enabled, canViewAllClinics, switchClinic, clinicVersion, clinicsLoaded, switching]);

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
