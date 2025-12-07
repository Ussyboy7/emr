"use client";

import { useMemo } from "react";
import type { User } from "@/lib/npa-structure";
import { getPermissionProfile, type PermissionProfile } from "@/lib/permissions";
import { useOrganization } from "@/contexts/OrganizationContext";

export const useUserPermissions = (user?: User | null): PermissionProfile => {
  const { assistantAssignments } = useOrganization();

  return useMemo(() => {
    const baseProfile = getPermissionProfile(user ?? undefined);

    if (!user) {
      return baseProfile;
    }

    const assignmentsForUser = assistantAssignments.filter((assignment) => assignment.assistantId === user.id);

    if (assignmentsForUser.length === 0) {
      return baseProfile;
    }

    // Preserve base profile permissions (especially for superadmin)
    const enhancedProfile: PermissionProfile = {
      ...baseProfile,
      allowedArchiveLevels: [...baseProfile.allowedArchiveLevels],
    };

    // Only enhance permissions, never restrict them
    // If baseProfile already has permissions (e.g., from superadmin), preserve them
    if (assignmentsForUser.some((assignment) => assignment.permissions.includes("forward"))) {
      enhancedProfile.canDistribute = true;
      enhancedProfile.canAccessApprovals = true;
    }

    if (assignmentsForUser.some((assignment) => assignment.permissions.includes("draft"))) {
      enhancedProfile.canRegisterCorrespondence = true;
    }

    if (assignmentsForUser.some((assignment) => assignment.permissions.includes("view") || assignment.permissions.includes("coordinate"))) {
      enhancedProfile.canAccessDocumentManagement = true;
    }

    // Ensure superadmin permissions are always preserved
    const isSuperAdmin = user.isSuperuser || user.systemRole === "Super Admin";
    if (isSuperAdmin) {
      // Superadmin should have all permissions
      enhancedProfile.canRegisterCorrespondence = true;
      enhancedProfile.canAccessApprovals = true;
      enhancedProfile.canAccessAnalytics = true;
      enhancedProfile.canAccessExecutiveDashboard = true;
      enhancedProfile.canAccessAdministration = true;
      enhancedProfile.canAccessReports = true;
      enhancedProfile.canDistribute = true;
      enhancedProfile.canViewCorrespondenceRegistry = true;
      enhancedProfile.canAccessDocumentManagement = true;
    }

    return enhancedProfile;
  }, [assistantAssignments, user?.id, user?.gradeLevel, user?.systemRole, user?.isSuperuser]);
};

