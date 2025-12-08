import type { User } from "@/lib/npa-structure";

export type ArchiveLevel = "department" | "division" | "directorate";

export type PermissionProfile = {
  canAccessApprovals: boolean;
  canAccessAnalytics: boolean;
  canAccessExecutiveDashboard: boolean;
  canAccessAdministration: boolean;
  canAccessReports: boolean;
  canAccessDocumentManagement: boolean;
  canDistribute: boolean;
  allowedArchiveLevels: ArchiveLevel[];
};

const defaultProfile: PermissionProfile = {
  canAccessApprovals: false,
  canAccessAnalytics: false,
  canAccessExecutiveDashboard: false,
  canAccessAdministration: false,
  canAccessReports: false,
  canAccessDocumentManagement: true,
  canDistribute: false,
  allowedArchiveLevels: ["department"],
};

export const getPermissionProfile = (user?: User | null): PermissionProfile => {
  if (!user) {
    return { ...defaultProfile };
  }

  const profile: PermissionProfile = { ...defaultProfile };

  const grade = user.gradeLevel;
  const role = user.systemRole;

  const isSuperAdmin = user.isSuperuser || role === "Super Admin";
  const isMD = grade === "MDCS";
  const isED = grade === "EDCS";
  const isGM = grade === "MSS1";
  const isAGM = grade === "MSS2";
  const isPrincipalManager = grade === "MSS3";
  const isSeniorManager = grade === "MSS4";
  const isAssistantManager = grade === "SSS1";
  const isSeniorOfficer = grade === "SSS2";
  const isOfficerI = grade === "SSS3";
  const isOfficerII = grade === "SSS4";
  const isStaffI = grade === "JSS1";
  const isStaffII = grade === "JSS2";
  const isStaffIII = grade === "JSS3";

  const managementGrades = isMD || isED || isGM || isAGM || isPrincipalManager;

  if (managementGrades || isSeniorManager || isSuperAdmin) {
    profile.canAccessApprovals = true;
  }

  if (isMD || isED || isGM || isAGM || isSuperAdmin) {
    profile.canAccessAnalytics = true;
    profile.canAccessReports = true;
  }

  if (isMD || isED || isSuperAdmin) {
    profile.canAccessExecutiveDashboard = true;
  }

  if (isMD || isED || isGM || isSuperAdmin) {
    profile.canAccessAdministration = true;
  }

  if (managementGrades || isSuperAdmin) {
    profile.canDistribute = true;
  }

  const allowedLevels: ArchiveLevel[] = ["department"];
  if (isGM || isMD || isED || isSuperAdmin) {
    allowedLevels.push("division");
  }
  if (isMD || isED || isSuperAdmin) {
    allowedLevels.push("directorate");
  }
  profile.allowedArchiveLevels = Array.from(new Set(allowedLevels));

  return profile;
};

