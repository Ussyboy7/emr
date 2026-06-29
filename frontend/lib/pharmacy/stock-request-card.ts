import type { StockRequest, StockRequestItem } from "@/lib/services";
import {
  formatPackDisplay,
  packSizeForRequestItem,
  toDisplayQuantity,
} from "@/lib/pharmacy/stock-request-quantity";
import { formatDisplayDate } from "@/lib/dates";

export type StockRequestCardRole = "requester" | "operator";

export type StockRequestStatusConfig = {
  label: string;
  badgeClass: string;
  borderClass: string;
  tip?: string;
};

type MedicationRef = { id: number; pack_size?: number | null; name?: string };

export function summarizeItemNames(request: StockRequest): string {
  const items = request.items || [];
  if (items.length === 0) return "No items";
  const first = items[0].medication_name?.trim() || "Unknown medication";
  if (items.length === 1) return first;
  return `${first} +${items.length - 1} more`;
}

export function formatRouteLabel(request: StockRequest): string {
  const from = request.from_location?.trim() || "Store";
  const to = request.to_location?.trim() || "Dispensary";
  return `${from} → ${to}`;
}

export function isStockRequestEditable(status: string): boolean {
  return status === "pending" || status === "approved";
}

export function needsConfirmReceipt(request: StockRequest): boolean {
  return (
    (request.status === "fulfilled" || request.status === "partially_fulfilled") &&
    !request.confirmed_at
  );
}

export function isPartialFulfillment(request: StockRequest): boolean {
  const items = request.items || [];
  if (items.length === 0) return false;
  return items.some(
    (item) =>
      Number(item.fulfilled_quantity || 0) > 0 &&
      Number(item.fulfilled_quantity || 0) < Number(item.quantity || 0),
  );
}

function formatItemQty(
  item: StockRequestItem,
  field: "quantity" | "fulfilled_quantity",
  medications?: MedicationRef[],
): string {
  const packSize = packSizeForRequestItem(item, medications);
  return formatPackDisplay(Number(item[field] || 0), packSize);
}

export function summarizeFulfillment(
  request: StockRequest,
  medications?: MedicationRef[],
): string | null {
  const items = request.items || [];
  if (items.length === 0) return null;
  const anyFulfilled = items.some((item) => Number(item.fulfilled_quantity || 0) > 0);
  if (!anyFulfilled) return null;

  if (items.length === 1) {
    const item = items[0];
    const packSize = packSizeForRequestItem(item, medications);
    const requestedUnits = Number(item.quantity || 0);
    const fulfilledUnits = Number(item.fulfilled_quantity || 0);
    if (packSize && packSize > 1) {
      const reqPacks = toDisplayQuantity(requestedUnits, packSize);
      const fulPacks = toDisplayQuantity(fulfilledUnits, packSize);
      if (fulfilledUnits > 0 && fulPacks < reqPacks) {
        return `${fulPacks.toLocaleString()} of ${reqPacks.toLocaleString()} packs`;
      }
      if (fulfilledUnits > 0) {
        return `${fulPacks.toLocaleString()} packs`;
      }
    }
    const requested = formatItemQty(item, "quantity", medications);
    const fulfilled = formatItemQty(item, "fulfilled_quantity", medications);
    if (fulfilledUnits > 0 && fulfilledUnits < requestedUnits) {
      return `${fulfilled} of ${requested}`;
    }
    if (fulfilledUnits > 0) {
      return fulfilled;
    }
    return null;
  }

  const fulfilledCount = items.filter((item) => Number(item.fulfilled_quantity || 0) > 0).length;
  if (isPartialFulfillment(request)) {
    return `${fulfilledCount}/${items.length} items issued (partial)`;
  }
  return `${fulfilledCount}/${items.length} items issued`;
}

export function summarizeRequested(
  request: StockRequest,
  medications?: MedicationRef[],
): string | null {
  const items = request.items || [];
  if (items.length === 0) return null;

  if (items.length === 1) {
    return formatItemQty(items[0], "quantity", medications);
  }

  return `${items.length} items`;
}

const REQUESTER_STATUS: Record<string, Omit<StockRequestStatusConfig, "borderClass">> = {
  pending: {
    label: "Waiting for approval",
    badgeClass: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-200",
    tip: "Awaiting Central Store approval",
  },
  approved: {
    label: "Approved — not issued",
    badgeClass: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200",
    tip: "Approved; waiting for store to issue stock",
  },
  fulfilled: {
    label: "Confirm receipt",
    badgeClass: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-200",
    tip: "Stock issued; confirm when received",
  },
  partially_fulfilled: {
    label: "Partial — confirm receipt",
    badgeClass: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200",
    tip: "Partial issue; confirm what you received",
  },
  received: {
    label: "Confirmed ✓",
    badgeClass: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200",
  },
  rejected: {
    label: "Rejected",
    badgeClass: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200",
  },
  cancelled: {
    label: "Cancelled",
    badgeClass: "bg-muted text-muted-foreground",
  },
};

const OPERATOR_STATUS: Record<string, Omit<StockRequestStatusConfig, "borderClass">> = {
  pending: {
    label: "Pending review",
    badgeClass: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-200",
    tip: "Awaiting store approval",
  },
  approved: {
    label: "Ready to issue",
    badgeClass: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200",
    tip: "Approved; issue stock from warehouse",
  },
  fulfilled: {
    label: "Awaiting confirmation",
    badgeClass: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-200",
    tip: "Issued; waiting for site to confirm receipt",
  },
  partially_fulfilled: {
    label: "Partially issued",
    badgeClass: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200",
    tip: "Some stock issued; site may confirm partial receipt",
  },
  received: {
    label: "Confirmed",
    badgeClass: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200",
  },
  rejected: {
    label: "Rejected",
    badgeClass: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200",
  },
  cancelled: {
    label: "Cancelled",
    badgeClass: "bg-muted text-muted-foreground",
  },
};

function borderClassForStatus(status: string, needsConfirm: boolean): string {
  if (needsConfirm) return "border-l-yellow-400";
  switch (status) {
    case "pending":
      return "border-l-orange-400";
    case "approved":
      return "border-l-blue-400";
    case "fulfilled":
    case "partially_fulfilled":
      return "border-l-yellow-400";
    case "received":
      return "border-l-green-500";
    case "rejected":
      return "border-l-red-400";
    default:
      return "border-l-violet-500/50";
  }
}

export function getStockRequestStatusConfig(
  status: string,
  role: StockRequestCardRole,
): StockRequestStatusConfig {
  const map = role === "operator" ? OPERATOR_STATUS : REQUESTER_STATUS;
  const cfg = map[status] || { label: status, badgeClass: "" };
  const needsConfirm = status === "fulfilled" || status === "partially_fulfilled";
  return {
    ...cfg,
    borderClass: borderClassForStatus(status, needsConfirm && role === "requester"),
  };
}

export function getStockRequestPrimaryTitle(
  request: StockRequest,
  _role?: StockRequestCardRole,
): string {
  return summarizeItemNames(request);
}

export function buildStockRequestCardMeta(
  request: StockRequest,
  role: StockRequestCardRole,
  medications?: MedicationRef[],
): string {
  const parts: string[] = [];

  if (role === "operator" && request.requested_by_name) {
    parts.push(request.requested_by_name);
  }

  const fulfillment = summarizeFulfillment(request, medications);
  const quantitySummary = fulfillment ?? summarizeRequested(request, medications);
  if (quantitySummary) {
    parts.push(quantitySummary);
  }

  const date = request.confirmed_at || request.created_at;
  if (date) {
    parts.push(formatDisplayDate(date));
  }

  return parts.join(" · ");
}

export type StockRequestItemDetailLine = {
  medicationName: string;
  quantityLine: string;
};

export function formatStockRequestItemLine(
  item: StockRequestItem,
  medications?: MedicationRef[],
): StockRequestItemDetailLine {
  const medicationName = item.medication_name?.trim() || "Unknown medication";
  const packSize = packSizeForRequestItem(item, medications);
  const requestedUnits = Number(item.quantity || 0);
  const fulfilledUnits = Number(item.fulfilled_quantity || 0);
  const requested = formatPackDisplay(requestedUnits, packSize);

  if (fulfilledUnits <= 0) {
    return { medicationName, quantityLine: `Requested ${requested}` };
  }

  if (packSize && packSize > 1) {
    const reqPacks = toDisplayQuantity(requestedUnits, packSize);
    const fulPacks = toDisplayQuantity(fulfilledUnits, packSize);
    if (fulPacks < reqPacks) {
      return {
        medicationName,
        quantityLine: `Received ${fulPacks.toLocaleString()} of ${reqPacks.toLocaleString()} packs`,
      };
    }
    return {
      medicationName,
      quantityLine: `Received ${fulPacks.toLocaleString()} packs`,
    };
  }

  const fulfilled = formatPackDisplay(fulfilledUnits, packSize);
  if (fulfilledUnits < requestedUnits) {
    return { medicationName, quantityLine: `Received ${fulfilled} of ${requested}` };
  }
  return { medicationName, quantityLine: `Received ${fulfilled}` };
}

/** @deprecated Use buildStockRequestCardMeta */
export function buildStockRequestSubtitleParts(
  request: StockRequest,
  medications?: MedicationRef[],
): string[] {
  const meta = buildStockRequestCardMeta(request, "operator", medications);
  return meta ? meta.split(" · ") : [];
}
