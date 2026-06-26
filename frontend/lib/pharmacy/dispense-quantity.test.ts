import { describe, expect, it } from "vitest";
import {
  canChoosePrescriptionQuantityEntryMode,
  getDefaultQuantityEntryModeForPrescription,
  getPrescriptionDispenseMode,
  toInventoryUnits,
} from "./dispense-quantity";

describe("prescription dispense quantity", () => {
  const capsuleMed = {
    unit: "capsule",
    pack_size: 10,
    dispense_mode: "pack_only" as const,
  };

  it("promotes pack_only capsule stock to pack_or_units for Rx", () => {
    expect(getPrescriptionDispenseMode(capsuleMed, "capsule")).toBe("pack_or_units");
    expect(canChoosePrescriptionQuantityEntryMode(capsuleMed, "capsule")).toBe(true);
  });

  it("defaults prescription entry to units for tablet/capsule lines", () => {
    expect(
      getDefaultQuantityEntryModeForPrescription("pack_only", {
        medication: capsuleMed,
        prescribedUnit: "capsule",
      })
    ).toBe("units");
  });

  it("converts display quantity in units without multiplying pack size", () => {
    expect(
      toInventoryUnits(3, capsuleMed, "units", { prescribedUnit: "capsule" })
    ).toBe(3);
  });

  it("still defaults to pack for bottle stock in prescription context", () => {
    const bottleMed = { unit: "bottle", pack_size: 100, dispense_mode: "pack_only" as const };
    expect(getPrescriptionDispenseMode(bottleMed, "ml")).toBe("pack_only");
    expect(
      getDefaultQuantityEntryModeForPrescription("pack_only", {
        medication: bottleMed,
        prescribedUnit: "ml",
      })
    ).toBe("pack");
  });
});
