"use client";

import { useState, useEffect, useCallback } from "react";
import { adminService } from "@/lib/services";
import { MAX_LIST_PAGE_SIZE } from "@/lib/pagination-constants";

export interface LocationOption {
  /** Facility name (matches Visit/Patient `location` and organization.Clinic.name). */
  value: string;
  label: string;
  /** organization.Clinic id — for per-facility visit-clinic lists. */
  id: number;
}

/**
 * Fetches facility (site) options from organization.Clinic — Admin → Facilities & Departments.
 * Use for Create Visit, New Patient, Edit Visit/Patient, Admin Rooms - replaces hardcoded NPA locations.
 */
export function useLocationOptions(options?: { includeAll?: boolean }) {
  const [locations, setLocations] = useState<LocationOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await adminService.getClinics({
        is_active: true,
        page_size: MAX_LIST_PAGE_SIZE,
      });
      const opts: LocationOption[] = (response.results || []).map((c) => ({
        value: c.name,
        label: c.location ? `${c.name} • ${c.location}` : c.name,
        id: c.id,
      }));
      if (options?.includeAll) {
        setLocations([{ value: "all", label: "All Locations", id: 0 }, ...opts]);
      } else {
        setLocations(opts);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to load locations";
      setError(message);
      setLocations([]);
    } finally {
      setLoading(false);
    }
  }, [options?.includeAll]);

  useEffect(() => {
    load();
  }, [load]);

  return { locations, loading, error, refetch: load };
}
