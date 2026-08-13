import type { NursingOrderSubmitInput } from "@/components/consultation/orders/NursingOrderModal";

type Context = { patient: number; visit: number; consultation_session: number };

type ObservationSource = {
  presentationComplaint?: string;
  diagnosisCodes?: { code: string; description: string; type: "Primary" | "Secondary" | "Differential" }[];
};

export function getObservationAdmissionDefaults(source: ObservationSource) {
  return {
    admissionDiagnosis: source.diagnosisCodes?.find((diagnosis) => diagnosis.type === "Primary")?.description?.trim() || "",
    presentingComplaint: source.presentationComplaint?.trim() || "",
  };
}

export function buildHistoryNursingSubmission(payload: NursingOrderSubmitInput, context: Context) {
  if (payload.type === "Observation Admission") {
    if (!payload.admissionDiagnosis?.trim() || !payload.presentingComplaint?.trim()) {
      throw new Error("Complete Medical Notes first: a primary diagnosis and presenting complaint are required.");
    }
    const ward = Number(payload.ward);
    if (!Number.isInteger(ward) || ward <= 0) throw new Error("Selected observation ward is invalid. Please reselect an active ward.");
    return { kind: "admission" as const, payload: {
      patient: context.patient, visit: context.visit, ward, admission_type: "observation" as const,
      admission_diagnosis: payload.admissionDiagnosis || "", presenting_complaint: payload.presentingComplaint || "",
      admission_instructions: payload.instructions,
      consultation_session: context.consultation_session,
    } };
  }
  const priorityMap: Record<string, "low" | "medium" | "high" | "urgent"> = { Routine: "low", Urgent: "high", STAT: "urgent" };
  let description = payload.instructions;
  if (payload.type === "Injection" && payload.medication) description = `${payload.medication} - ${payload.dosage || ""} via ${payload.route || ""}. ${payload.instructions}`;
  else if (payload.type === "Dressing") description = `${payload.woundType || "Wound"} dressing at ${payload.woundLocation || "site"}. ${payload.instructions}`;
  else if (payload.type === "IV Infusion" && payload.medication) description = `IV Infusion: ${payload.medication}${payload.dosage ? ` — ${payload.dosage}` : ""}. ${payload.instructions}`;
  return { kind: "nursing-order" as const, payload: {
    ...context, order_type: payload.type, description, frequency: payload.type === "Injection" ? "As ordered" : "", duration: "",
    status: "pending" as const, priority: priorityMap[payload.priority] || "medium",
  } };
}
