"use client";

import { DashboardLayout } from "@/components/shared/DashboardLayout";
import { ReferralFacilitiesManager } from "@/components/referrals/ReferralFacilitiesManager";
import { useMedicalRecordsPageAuth } from "@/hooks/use-medical-records-page-auth";

/**
 * Standalone admin route for the referral-facility catalog.
 *
 * The same UI is also embedded as a tab in /admin/clinics
 * ("Facilities & Departments") so the canonical entry point lives
 * alongside the other facility-management screens. This route is kept
 * for direct linking, deep-linked notifications, and bookmarks.
 */
export default function ReferralFacilitiesAdminPage() {
  useMedicalRecordsPageAuth();
  return (
    <DashboardLayout>
      <ReferralFacilitiesManager />
    </DashboardLayout>
  );
}
