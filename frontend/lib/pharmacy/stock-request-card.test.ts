import { describe, expect, it } from "vitest";
import type { StockRequest } from "@/lib/services";
import {
  buildStockRequestCardMeta,
  formatStockRequestItemLine,
  getStockRequestPrimaryTitle,
  isPartialFulfillment,
  needsConfirmReceipt,
  summarizeFulfillment,
  summarizeItemNames,
  summarizeRequested,
} from "@/lib/pharmacy/stock-request-card";

const baseRequest: StockRequest = {
  id: 1,
  request_id: "REQ-20260626-191122-3803",
  status: "received",
  from_location: "Store",
  to_location: "Dispensary",
  requested_by_name: "Alfa Aliyu",
  clinic_name: "Bode Thomas Clinic",
  created_at: "2026-06-26T19:11:22Z",
  updated_at: "2026-06-26T20:54:00Z",
  confirmed_at: "2026-06-26T20:54:00Z",
  items: [
    {
      id: 1,
      medication: 10,
      medication_name: "Amlong 5mg",
      quantity: 1000,
      medication_pack_size: 10,
      fulfilled_quantity: 990,
    },
  ],
};

describe("stock-request-card helpers", () => {
  it("summarizes single and multiple item names", () => {
    expect(summarizeItemNames(baseRequest)).toBe("Amlong 5mg");
    expect(
      summarizeItemNames({
        ...baseRequest,
        items: [
          { id: 1, medication: 1, medication_name: "Drug A", quantity: 1 },
          { id: 2, medication: 2, medication_name: "Drug B", quantity: 1 },
        ],
      }),
    ).toBe("Drug A +1 more");
  });

  it("uses medication name as primary title for requester and operator", () => {
    expect(getStockRequestPrimaryTitle(baseRequest, "requester")).toBe("Amlong 5mg");
    expect(getStockRequestPrimaryTitle(baseRequest, "operator")).toBe("Amlong 5mg");
  });

  it("detects partial fulfillment and confirm need", () => {
    expect(isPartialFulfillment(baseRequest)).toBe(true);
    expect(needsConfirmReceipt({ ...baseRequest, status: "fulfilled", confirmed_at: undefined })).toBe(
      true,
    );
    expect(needsConfirmReceipt(baseRequest)).toBe(false);
  });

  it("formats fulfillment summary for packs", () => {
    expect(summarizeFulfillment(baseRequest)).toBe("99 of 100 packs");
  });

  it("builds compact card meta for requester", () => {
    expect(buildStockRequestCardMeta(baseRequest, "requester")).toBe("99 of 100 packs · 26/06/2026");
  });

  it("builds card meta with requester for operator", () => {
    const meta = buildStockRequestCardMeta(baseRequest, "operator");
    expect(meta).toContain("Alfa Aliyu");
    expect(meta).toContain("99 of 100 packs");
    expect(meta).not.toContain("REQ-");
  });

  it("formats item detail line for partial receipt", () => {
    const line = formatStockRequestItemLine(baseRequest.items![0]);
    expect(line.quantityLine).toBe("Received 99 of 100 packs");
  });

  it("includes requested quantity on pending cards", () => {
    const pending: StockRequest = {
      ...baseRequest,
      status: "pending",
      confirmed_at: undefined,
      items: [
        {
          id: 2,
          medication: 11,
          medication_name: "Emcap Paracetamol",
          quantity: 500,
          medication_pack_size: 10,
          fulfilled_quantity: 0,
        },
      ],
    };
    expect(summarizeRequested(pending)).toBe("50 packs (500 units)");
    expect(buildStockRequestCardMeta(pending, "requester")).toBe("50 packs (500 units) · 26/06/2026");
  });
});
