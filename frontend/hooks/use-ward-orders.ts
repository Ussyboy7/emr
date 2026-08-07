"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";
import {
  pharmacyService,
  labService,
  radiologyService,
  physioService,
  eyeCareService,
  referralService,
} from "@/lib/services";
import type { WardAdmissionRow } from "@/lib/consultation/room-types";

type WardOrderContext = {
  admission: WardAdmissionRow | null;
  visitId?: number | null;
  patientId?: number | null;
  onChanged?: () => void;
};

export function useWardOrders({ admission, visitId, patientId, onChanged }: WardOrderContext) {
  const [saving, setSaving] = useState(false);

  const finish = useCallback(async (promise: Promise<unknown>, label = "Order") => {
    setSaving(true);
    try {
      await promise;
      toast.success(`${label} placed`);
      onChanged?.();
      return true;
    } catch (e) {
      toast.error(`Could not place ${label.toLowerCase()}`);
      return false;
    } finally {
      setSaving(false);
    }
  }, [onChanged]);

  const base = useCallback((payload: Record<string, unknown>) => {
    if (visitId != null) payload.visit = visitId;
    if (patientId != null) payload.patient = patientId;
    if (admission?.id != null) payload.admission = admission.id;
    return payload;
  }, [admission, visitId, patientId]);

  const createPrescription = useCallback(
    (p: Record<string, unknown>) =>
      finish(pharmacyService.createPrescription(base({ ...p }) as any), "Prescription"),
    [finish, base],
  );
  const createLab = useCallback(
    (p: Record<string, unknown>) => finish(labService.createOrder(base({ ...p }) as any), "Lab"),
    [finish, base],
  );
  const createRadiology = useCallback(
    (p: Record<string, unknown>) =>
      finish(radiologyService.createOrder(base({ ...p }) as any), "Radiology"),
    [finish, base],
  );
  const createPhysio = useCallback(
    (p: Record<string, unknown>) =>
      finish(physioService.createOrder(base({ ...p }) as any), "Physio"),
    [finish, base],
  );
  const createEye = useCallback(
    (p: Record<string, unknown>) =>
      finish(eyeCareService.createOrder(base({ ...p }) as any), "Eye"),
    [finish, base],
  );
  const createReferral = useCallback(
    (p: Record<string, unknown>) =>
      finish(referralService.createReferral(base({ ...p }) as any), "Referral"),
    [finish, base],
  );

  return {
    saving,
    createPrescription,
    createLab,
    createRadiology,
    createPhysio,
    createEye,
    createReferral,
  };
}
