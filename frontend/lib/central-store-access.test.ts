import { describe, expect, it } from "vitest";
import { canShowCentralStoreNav, userHasCentralStorePage } from "./central-store-access";
import type { User } from "./npa-structure";

const baseUser = (overrides: Partial<User> = {}): User =>
  ({
    id: "1",
    username: "pharm",
    permissions: ["/pharmacy/store"],
    clinics_ids: [5],
    ...overrides,
  }) as User;

describe("central-store-access", () => {
  it("detects central store page permission", () => {
    expect(userHasCentralStorePage(baseUser())).toBe(true);
    expect(userHasCentralStorePage(baseUser({ permissions: ["/pharmacy/prescriptions"] }))).toBe(false);
  });

  it("shows nav when assigned to Bode Thomas with store page", () => {
    expect(
      canShowCentralStoreNav(baseUser(), [{ id: 5, code: "BODE-THOMAS" }]),
    ).toBe(true);
  });

  it("hides nav when role has store page but user not assigned to Bode Thomas", () => {
    expect(
      canShowCentralStoreNav(
        baseUser({ clinics_ids: [2] }),
        [
          { id: 2, code: "TIN-CAN" },
          { id: 5, code: "BODE-THOMAS" },
        ],
      ),
    ).toBe(false);
  });

  it("allows superuser regardless of clinic assignment", () => {
    expect(
      canShowCentralStoreNav(
        baseUser({ isSuperuser: true, clinics_ids: [] }),
        [{ id: 5, code: "BODE-THOMAS" }],
      ),
    ).toBe(true);
  });
});
