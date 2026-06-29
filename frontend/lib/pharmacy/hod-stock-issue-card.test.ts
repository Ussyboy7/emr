import { describe, expect, it } from "vitest";
import type { HodStockIssue } from "@/lib/services";
import {
  buildHodIssueCardMeta,
  buildHodIssueRecipientLine,
  getHodIssueReasonBadgeLabel,
} from "@/lib/pharmacy/hod-stock-issue-card";

const baseIssue: HodStockIssue = {
  id: 1,
  issue_id: "HOD-20260618-203350-3985",
  medication: 1,
  medication_name: "Amatem Softgel 80/480mg",
  quantity: 1,
  unit: "capsule",
  quantity_entry_mode: "units",
  batch_number: "BATCH-AMA80480-001",
  patient_name: "diezani",
  patient_mrn: "1234",
  reason: "Department use",
  issued_by_name: "Admin Super",
  issued_at: "2026-06-18T20:33:00Z",
};

describe("hod-stock-issue-card helpers", () => {
  it("uses reason for badge label instead of generic Patient", () => {
    expect(getHodIssueReasonBadgeLabel(baseIssue)).toBe("Department use");
  });

  it("builds compact card meta without issue id or batch", () => {
    const meta = buildHodIssueCardMeta(baseIssue);
    expect(meta).toContain("Admin Super");
    expect(meta).not.toContain("HOD-");
    expect(meta).not.toContain("BATCH");
  });

  it("combines optional patient with department reason on recipient line", () => {
    expect(buildHodIssueRecipientLine(baseIssue)).toBe("diezani (1234) · Department use");
  });

  it("falls back to Patient badge when reason missing but patient set", () => {
    expect(
      getHodIssueReasonBadgeLabel({ ...baseIssue, reason: "", patient_name: "Jane Doe" }),
    ).toBe("Patient");
  });
});
