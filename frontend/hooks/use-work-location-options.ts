"use client";

import { useState, useEffect, useCallback } from "react";
import { adminService } from "@/lib/services";

export interface WorkLocationOption {
  value: string;
  label: string;
  id: number;
}

export function useWorkLocationOptions() {
  const [locations, setLocations] = useState<WorkLocationOption[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const response = await adminService.getWorkLocations({ is_active: true });
      const opts: WorkLocationOption[] = (response.results || []).map((l) => ({
        value: l.name,
        label: l.name,
        id: l.id,
      }));
      setLocations(opts);
    } catch {
      setLocations([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return { locations, loading, refetch: load };
}
