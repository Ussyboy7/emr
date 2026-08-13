import { describe, expect, it } from "vitest";
import {
  buildHistoryNursingSubmission,
  getObservationAdmissionDefaults,
} from "./history-nursing-order";

describe("buildHistoryNursingSubmission", () => {
  it("derives observation defaults from the primary diagnosis and complaint", () => {
    expect(getObservationAdmissionDefaults({
      presentationComplaint: "Fever and cough",
      diagnosisCodes: [
        { code: "R05", description: "Cough", type: "Secondary" },
        { code: "J06.9", description: "Acute upper respiratory infection", type: "Primary" },
      ],
    })).toEqual({
      admissionDiagnosis: "Acute upper respiratory infection",
      presentingComplaint: "Fever and cough",
    });
  });

  it("rejects an observation admission without inherited consultation notes", () => {
    expect(() => buildHistoryNursingSubmission({
      type: "Observation Admission",
      ward: "12",
      instructions: "Observe overnight",
      priority: "Routine",
    }, { patient: 5, visit: 7, consultation_session: 9 })).toThrow(
      "Complete Medical Notes first",
    );
  });

  it("creates an admission payload instead of a generic nursing order", () => {
    const result = buildHistoryNursingSubmission({
      type: "Observation Admission",
      ward: "12",
      admissionDiagnosis: "J06.9 - Acute upper respiratory infection",
      presentingComplaint: "Fever",
      instructions: "Observe overnight",
      priority: "Routine",
    }, { patient: 5, visit: 7, consultation_session: 9 });

    expect(result).toEqual({
      kind: "admission",
      payload: {
        patient: 5,
        visit: 7,
        ward: 12,
        admission_type: "observation",
        admission_diagnosis: "J06.9 - Acute upper respiratory infection",
        presenting_complaint: "Fever",
        admission_instructions: "Observe overnight",
        consultation_session: 9,
      },
    });
  });

  it("keeps ordinary nursing order payloads unchanged", () => {
    const result = buildHistoryNursingSubmission({
      type: "Dressing",
      woundType: "Surgical Wound",
      woundLocation: "Abdomen",
      instructions: "Change daily",
      priority: "Urgent",
    }, { patient: 5, visit: 7, consultation_session: 9 });

    expect(result.kind).toBe("nursing-order");
    expect(result.payload).toMatchObject({
      patient: 5,
      visit: 7,
      consultation_session: 9,
      order_type: "Dressing",
      description: "Surgical Wound dressing at Abdomen. Change daily",
      priority: "high",
    });
  });
});
