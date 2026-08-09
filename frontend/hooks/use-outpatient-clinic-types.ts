"use client";

import { useState, useEffect, useCallback } from "react";
import { adminService, type OutpatientClinicType } from "@/lib/services";
import { MAX_LIST_PAGE_SIZE } from "@/lib/pagination-constants";

/**
 * Active OPD visit clinic types from the API (Admin → Visit clinics).
 * Sorted by sort_order then name.
 */
export function useOutpatientClinicTypes(options?: { includeInactive?: boolean }) {
  const includeInactive = options?.includeInactive;
  const [types, setTypes] = useState<OutpatientClinicType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await adminService.getOutpatientClinicTypes({
        page_size: MAX_LIST_PAGE_SIZE,
          ...(includeInactive ? {} : { is_active: true }),
      });
      const list = [...(res.results || [])].sort(
        (a, b) =>
          (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name)
      );
      setTypes(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load visit clinics");
      setTypes([]);
    } finally {
      setLoading(false);
    }
  }, [includeInactive]);

  useEffect(() => {
    load();
  }, [load]);

  const names = types.map((t) => t.name);
  return { types, names, loading, error, refetch: load };
}
