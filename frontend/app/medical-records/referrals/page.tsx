"use client";

import React, { useMemo, useState } from "react";
import { DashboardLayout } from "@/components/shared/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { StandardPagination } from "@/components/shared/StandardPagination";
import { FileText } from "lucide-react";
import { toast } from "sonner";
import {
  referralService,
  type ResponsibilityFormIssuance,
} from "@/lib/services/referral-service";
import { isAuthenticationError } from "@/lib/auth-errors";
import { useCurrentUser } from "@/hooks/use-current-user";
import {
  type ReferralWithPatient,
  REFERRAL_STATUS_OPTIONS_NO_DRAFT,
  printReferralLetter as printReferralLetterWindow,
  printResponsibilityForm as printResponsibilityFormWindow,
} from "@/lib/referrals/referral-helpers";
import { useReferralsQueue } from "@/lib/referrals/use-referrals-queue";
import { ReferralsFilterBar } from "@/components/referrals/ReferralsFilterBar";
import { ReferralsList } from "@/components/referrals/ReferralsList";
import { MedicalRecordsReferralDetailModal } from "./MedicalRecordsReferralDetailModal";

export default function MedicalRecordsReferralsPage() {
  const { currentUser } = useCurrentUser();

  const queue = useReferralsQueue({ excludeDraft: true });
  const {
    referrals,
    isLoading,
    statsLoading,
    totalCount,
    stats,
    currentPage,
    setCurrentPage,
    itemsPerPage,
    setItemsPerPage,
    statusFilter,
    setStatusFilter,
    specialtyFilter,
    setSpecialtyFilter,
    facilityFilter,
    setFacilityFilter,
    urgencyFilter,
    setUrgencyFilter,
    searchQuery,
    setSearchQuery,
    dateFilter,
    setDateFilter,
    specialties,
    facilities,
    refetch,
    refetchStats,
  } = queue;

  const recordsQueueStatusOptions = useMemo(
    () =>
      REFERRAL_STATUS_OPTIONS_NO_DRAFT.filter(
        (o) => o.value !== "returned_for_correction"
      ),
    []
  );

  const isRecordsUser = Boolean(
    currentUser?.systemRole === "Medical Records Officer" || currentUser?.isSuperuser
  );

  const [selectedReferral, setSelectedReferral] = useState<ReferralWithPatient | null>(
    null
  );
  const [selectedForms, setSelectedForms] = useState<ResponsibilityFormIssuance[]>([]);
  const [formsLoading, setFormsLoading] = useState(false);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [acknowledgingFormId, setAcknowledgingFormId] = useState<number | null>(null);

  const openReferralDetails = async (referral: ReferralWithPatient) => {
    setShowDetailsModal(true);
    setFormsLoading(true);
    try {
      const [fresh, forms] = await Promise.all([
        referralService.getReferral(referral.id).catch(() => null),
        referralService.getForms(referral.id).catch(() => []),
      ]);
      setSelectedReferral((fresh || referral) as ReferralWithPatient);
      setSelectedForms(forms || []);
    } finally {
      setFormsLoading(false);
    }
  };

  const handleCloseReferral = async () => {
    if (!selectedReferral) return;
    try {
      await referralService.closeReferral(selectedReferral.id);
      toast.success("Referral closed");
      setSelectedReferral((r) =>
        r ? { ...r, status: "closed" as ReferralWithPatient["status"] } : r
      );
      setShowDetailsModal(false);
      void refetch();
      void refetchStats();
    } catch (error: unknown) {
      if (isAuthenticationError(error)) return;
      toast.error((error as Error)?.message || "Action failed");
    }
  };

  const handlePrintLetter = (r: ReferralWithPatient) => {
    if (!printReferralLetterWindow(r)) toast.error("Allow popups to print.");
  };
  const handlePrintForm = async (
    r: ReferralWithPatient,
    form?: ResponsibilityFormIssuance
  ) => {
    if (!form) {
      toast.error("No responsibility form on this referral yet.");
      return;
    }
    const ok = await printResponsibilityFormWindow(r, form);
    if (!ok) toast.error("Could not open the PDF — allow popups or check sign-in.");
  };

  const acknowledgeFormStamp = async (form: ResponsibilityFormIssuance) => {
    if (!selectedReferral) return;
    setAcknowledgingFormId(form.id);
    try {
      await referralService.acknowledgeResponsibilityForm(
        selectedReferral.id,
        form.id
      );
      const [fresh, formsList] = await Promise.all([
        referralService.getReferral(selectedReferral.id).catch(() => null),
        referralService.getForms(selectedReferral.id).catch(() => []),
      ]);
      if (fresh) {
        setSelectedReferral(fresh as ReferralWithPatient);
        if (fresh.status === "approved_for_forms" || fresh.status === "scheduled") {
          toast.success(
            `Form #${form.sequence_number} stamped — referral marked Records acknowledged`
          );
        } else {
          toast.success(`Responsibility form #${form.sequence_number} stamp recorded`);
        }
      } else {
        toast.success(`Responsibility form #${form.sequence_number} stamp recorded`);
      }
      setSelectedForms(formsList || []);
      void refetch();
      void refetchStats();
    } catch (error: unknown) {
      if (isAuthenticationError(error)) return;
      toast.error((error as Error)?.message || "Failed to acknowledge form");
    } finally {
      setAcknowledgingFormId(null);
    }
  };

  return (
    <DashboardLayout>
      <div className="container mx-auto p-4 sm:p-6 space-y-4 sm:space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground flex items-center gap-3">
              <FileText className="h-8 w-8 text-blue-500" />
              Referral acknowledgement (Medical Records)
            </h1>
            <p className="text-muted-foreground mt-1">
              Stamp each responsibility form row. When every current issuance is stamped,
              the referral becomes Records acknowledged automatically.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="border-l-4 border-l-blue-500">
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">In queue (excl. draft)</p>
              <p className="text-2xl font-bold text-blue-600">
                {statsLoading ? "…" : stats.total}
              </p>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-sky-500">
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">Submitted</p>
              <p className="text-2xl font-bold text-sky-600">
                {statsLoading ? "…" : stats.submitted}
              </p>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-amber-500">
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">In review</p>
              <p className="text-2xl font-bold text-amber-600">
                {statsLoading ? "…" : stats.inReview}
              </p>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-emerald-500">
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">Records acknowledged</p>
              <p className="text-2xl font-bold text-emerald-600">
                {statsLoading ? "…" : stats.approved}
              </p>
            </CardContent>
          </Card>
        </div>

        <ReferralsFilterBar
          searchQuery={searchQuery}
          onSearchQueryChange={setSearchQuery}
          statusFilter={statusFilter}
          onStatusFilterChange={setStatusFilter}
          statusOptions={recordsQueueStatusOptions}
          specialtyFilter={specialtyFilter}
          onSpecialtyFilterChange={setSpecialtyFilter}
          specialties={specialties}
          facilityFilter={facilityFilter}
          onFacilityFilterChange={setFacilityFilter}
          facilities={facilities}
          urgencyFilter={urgencyFilter}
          onUrgencyFilterChange={setUrgencyFilter}
          dateFilter={dateFilter}
          onDateFilterChange={setDateFilter}
        />

        <ReferralsList
          referrals={referrals}
          isLoading={isLoading}
          totalCount={totalCount}
          currentPage={currentPage}
          itemsPerPage={itemsPerPage}
          emptyState={{
            icon: <FileText className="h-12 w-12" />,
            title: "No referrals in queue",
            description: "Nothing submitted to records yet, or adjust filters.",
          }}
          onSelectReferral={(r) => void openReferralDetails(r)}
        />

        {!isLoading && totalCount > 0 && (
          <Card className="p-4">
            <StandardPagination
              currentPage={currentPage}
              totalItems={totalCount}
              itemsPerPage={itemsPerPage}
              onPageChange={setCurrentPage}
              onItemsPerPageChange={setItemsPerPage}
              itemName="referrals"
            />
          </Card>
        )}

        <MedicalRecordsReferralDetailModal
          open={showDetailsModal}
          onOpenChange={setShowDetailsModal}
          referral={selectedReferral}
          forms={selectedForms}
          formsLoading={formsLoading}
          isRecordsUser={isRecordsUser}
          onPrintLetter={handlePrintLetter}
          onPrintForm={handlePrintForm}
          onAcknowledgeForm={(form) => void acknowledgeFormStamp(form)}
          acknowledgingFormId={acknowledgingFormId}
          onCloseReferral={() => void handleCloseReferral()}
        />
      </div>
    </DashboardLayout>
  );
}
