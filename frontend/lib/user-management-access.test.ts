import { describe, expect, it } from "vitest";
import {
  canManageUsersNav,
  isScopedDepartmentUserManager,
  userHasUserManagementPage,
} from "./user-management-access";
import type { User } from "./npa-structure";

const baseUser = (overrides: Partial<User> = {}): User =>
  ({
    id: "1",
    name: "Test",
    email: "t@test.com",
    employeeId: "1",
    gradeLevel: "",
    directorate: "",
    systemRole: "Pharmacist",
    permissions: [],
    active: true,
    ...overrides,
  }) as User;

describe("user-management-access", () => {
  it("allows pharmacy HOD to manage users", () => {
    expect(canManageUsersNav(baseUser({ isPharmacyHod: true }))).toBe(true);
    expect(isScopedDepartmentUserManager(baseUser({ isPharmacyHod: true }))).toBe(true);
  });

  it("detects user management page grant", () => {
    expect(userHasUserManagementPage(baseUser({ permissions: ["/admin/users"] }))).toBe(true);
    expect(userHasUserManagementPage(baseUser({ permissions: ["/pharmacy"] }))).toBe(false);
  });
});
