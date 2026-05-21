"use client";

import { useClinicContext } from "@/contexts/ClinicContext";

export function useClinic() {
  return useClinicContext();
}
