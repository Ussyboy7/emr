import { formatPackDisplay } from "@/lib/pharmacy/dispense-quantity";

export { formatPackDisplay };

export function packSizeForStockItem(item: {
  medication_pack_size?: number | null | undefined;
  medication?: number;
}): number | null {
  const n = Number(item.medication_pack_size);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function packSizeForRequestItem(
  item: { medication_pack_size?: number | null | undefined; medication?: number },
  medications?: Array<{ id: number; pack_size?: number | null }>
): number | null {
  const fromItem = packSizeForStockItem(item);
  if (fromItem) return fromItem;
  if (item.medication && medications?.length) {
    const med = medications.find((m) => m.id === item.medication);
    const n = Number(med?.pack_size);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

export function toDisplayQuantity(
  units: number,
  packSize: number | undefined | null
): number {
  if (!packSize || packSize <= 1) return units;
  return Math.floor(units / packSize);
}

export function toUnitsQuantity(
  displayQty: number,
  packSize: number | undefined | null
): number {
  if (!packSize || packSize <= 1) return displayQty;
  return displayQty * packSize;
}

export function formatEditableQuantity(
  displayQty: number,
  packSize: number | undefined | null
): string {
  if (!packSize || packSize <= 1) return `${displayQty.toLocaleString()} units`;
  const units = toUnitsQuantity(displayQty, packSize);
  return `${displayQty.toLocaleString()} packs (${units.toLocaleString()} units)`;
}

/** Convert user input (packs when pack_size > 1) to API units. */
export function requestInputToUnits(
  inputVal: number,
  packSize: number | undefined | null
): number {
  const ps = packSize && packSize > 1 ? packSize : 1;
  return ps > 1 ? inputVal * ps : inputVal;
}
