"use client";

import React, { useEffect, useMemo, useState } from "react";
import { DashboardLayout } from "@/components/shared/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { StandardPagination } from "@/components/shared/StandardPagination";
import { Plus, Send, Stethoscope } from "lucide-react";
import { toast } from "sonner";
import {
  referralService,
  type ResponsibilityFormIssuance,
} from "@/lib/services/referral-service";
import { patientService, type Patient } from "@/lib/services/patient-service";
import { isAuthenticationError } from "@/lib/auth-errors";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import {
  type ReferralWithPatient,
  REFERRAL_STATUS_OPTIONS,
  REFERRAL_URGENCY_OPTIONS,
  REFERRAL_FACILITY_TYPE_OPTIONS,
  printReferralLetter as printReferralLetterWindow,
  printResponsibilityForm as printResponsibilityFormWindow,
} from "@/lib/referrals/referral-helpers";
import { useReferralsQueue } from "@/lib/referrals/use-referrals-queue";
import { ConsultationReferralDetailModal } from "./ConsultationReferralDetailModal";
import { ReferralsFilterBar } from "@/components/referrals/ReferralsFilterBar";
import { ReferralsList } from "@/components/referrals/ReferralsList";
import { hasOverlappingActiveResponsibilityForm } from "@/components/referrals/responsibility-form-blocks";
import { FacilityPartnerSelect } from "@/components/referrals/FacilityPartnerSelect";

export default function ConsultationReferralsPage() {
  const { currentUser } = useCurrentUser();

  const queue = useReferralsQueue();
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

  const consultationStatusOptions = useMemo(
    () => REFERRAL_STATUS_OPTIONS.filter((o) => o.value !== "returned_for_correction"),
    []
  );

  // ── Detail / edit / forms state (page-specific) ────────────────────────
  const [selectedReferral, setSelectedReferral] = useState<ReferralWithPatient | null>(null);
  const [selectedForms, setSelectedForms] = useState<ResponsibilityFormIssuance[]>([]);
  const [formsLoading, setFormsLoading] = useState(false);
  const [issuingForm, setIssuingForm] = useState(false);
  const [formPayload, setFormPayload] = useState({ valid_from: "", valid_to: "", notes: "" });
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [editForm, setEditForm] = useState({
    specialty: "",
    facility: "",
    facility_partner: null as number | null,
    facility_type: "internal" as ReferralWithPatient["facility_type"],
    reason: "",
    clinical_summary: "",
    contact_person: "",
    contact_phone: "",
    urgency: "routine" as ReferralWithPatient["urgency"],
  });
  const [formOverrideReason, setFormOverrideReason] = useState("");
  const [submittingToRecords, setSubmittingToRecords] = useState(false);

  const uid = currentUser?.id ? Number(currentUser.id) : NaN;
  const isMine = (r: ReferralWithPatient) => {
    if (!Number.isFinite(uid)) return false;
    const rid = r.referred_by != null ? Number(r.referred_by) : NaN;
    const cid = r.created_by != null ? Number(r.created_by) : NaN;
    return uid === rid || uid === cid;
  };

  const openReferralDetails = async (referral: ReferralWithPatient) => {
    setFormOverrideReason("");
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

  const openEdit = (r: ReferralWithPatient) => {
    setEditForm({
      specialty: r.specialty || "",
      facility: r.facility || "",
      facility_partner: r.facility_partner ?? null,
      facility_type: r.facility_type || "internal",
      reason: r.reason || "",
      clinical_summary: r.clinical_summary || "",
      contact_person: r.contact_person || "",
      contact_phone: r.contact_phone || "",
      urgency: r.urgency || "routine",
    });
    setShowEditModal(true);
  };

  const saveEdit = async () => {
    if (!selectedReferral) return;
    setEditSaving(true);
    try {
      const updated = await referralService.updateReferral(selectedReferral.id, {
        specialty: editForm.specialty,
        facility: editForm.facility,
        facility_partner: editForm.facility_partner,
        facility_type: editForm.facility_type,
        reason: editForm.reason,
        clinical_summary: editForm.clinical_summary || undefined,
        contact_person: editForm.contact_person || undefined,
        contact_phone: editForm.contact_phone || undefined,
        urgency: editForm.urgency,
      });
      const merged = { ...selectedReferral, ...updated } as ReferralWithPatient;
      setSelectedReferral(merged);
      setShowEditModal(false);
      toast.success("Referral updated");
      void refetch();
    } catch (error: unknown) {
      if (isAuthenticationError(error)) return;
      toast.error((error as Error)?.message || "Failed to update");
    } finally {
      setEditSaving(false);
    }
  };

  const submitToRecords = async () => {
    if (!selectedReferral) return;
    if (selectedForms.length === 0) {
      toast.error(
        "Issue at least one responsibility form before sending to Medical Records for acknowledgement."
      );
      return;
    }
    setSubmittingToRecords(true);
    try {
      const updated = await referralService.submitToRecords(selectedReferral.id);
      const merged = { ...selectedReferral, ...updated } as ReferralWithPatient;
      setSelectedReferral(merged);
      toast.success("Sent to Medical Records for stamp / acknowledgement");
      void refetch();
      void refetchStats();
    } catch (error: unknown) {
      if (isAuthenticationError(error)) return;
      toast.error((error as Error)?.message || "Failed to submit");
    } finally {
      setSubmittingToRecords(false);
    }
  };

  const issueResponsibilityForm = async () => {
    if (!selectedReferral) return;
    if (!formPayload.valid_from || !formPayload.valid_to) {
      toast.error("Set valid from/to dates");
      return;
    }
    const blocking = hasOverlappingActiveResponsibilityForm(
      selectedForms,
      formPayload.valid_from,
      formPayload.valid_to
    );
    if (blocking && !formOverrideReason.trim()) {
      toast.error("Enter an override reason — these dates overlap a current active form.");
      return;
    }
    try {
      setIssuingForm(true);
      await referralService.issueForm(selectedReferral.id, {
        ...formPayload,
        ...(blocking
          ? { override_active: true, override_reason: formOverrideReason.trim() }
          : {}),
      });
      const updatedForms = await referralService.getForms(selectedReferral.id);
      setSelectedForms(updatedForms || []);
      setFormPayload({ valid_from: "", valid_to: "", notes: "" });
      setFormOverrideReason("");
      toast.success("Responsibility form recorded");
      void refetch();
    } catch (error: unknown) {
      toast.error((error as Error)?.message || "Failed to issue form");
    } finally {
      setIssuingForm(false);
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
      toast.error("Issue a responsibility form before printing.");
      return;
    }
    const ok = await printResponsibilityFormWindow(r, form);
    if (!ok) toast.error("Could not open the PDF — allow popups or check sign-in.");
  };

  const canClinicianIssueForm = (r: ReferralWithPatient) =>
    isMine(r) && r.status !== "closed" && r.status !== "cancelled";
  const canEditClinician = (r: ReferralWithPatient) => isMine(r) && r.status === "draft";
  const canSubmitToRecords = (r: ReferralWithPatient) => isMine(r) && r.status === "draft";

  // ── Create-referral dialog (Consultation only) ───────────────────────
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [patientQuery, setPatientQuery] = useState("");
  const debouncedPatientQuery = useDebouncedValue(patientQuery, 300);
  const [patientResults, setPatientResults] = useState<Patient[]>([]);
  const [patientLoading, setPatientLoading] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [newReferral, setNewReferral] = useState({
    specialty: "",
    facility: "",
    facility_partner: null as number | null,
    facility_type: "internal" as ReferralWithPatient["facility_type"],
    urgency: "routine" as ReferralWithPatient["urgency"],
    reason: "",
    clinical_summary: "",
  });

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const q = debouncedPatientQuery.trim();
      if (q.length < 2) {
        setPatientResults([]);
        return;
      }
      setPatientLoading(true);
      try {
        const res = await patientService.getPatients({ search: q, page_size: 8 });
        if (!cancelled) setPatientResults(res.results || []);
      } catch {
        if (!cancelled) setPatientResults([]);
      } finally {
        if (!cancelled) setPatientLoading(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [debouncedPatientQuery]);

  const resetCreateReferralForm = () => {
    setPatientQuery("");
    setPatientResults([]);
    setSelectedPatient(null);
    setNewReferral({
      specialty: "",
      facility: "",
      facility_partner: null,
      facility_type: "internal",
      urgency: "routine",
      reason: "",
      clinical_summary: "",
    });
  };

  const createReferralDraft = async () => {
    const p = selectedPatient;
    if (!p) {
      toast.error("Select a patient first");
      return;
    }
    if (
      !newReferral.specialty.trim() ||
      !newReferral.facility.trim() ||
      !newReferral.reason.trim()
    ) {
      toast.error("Specialty, facility, and reason are required");
      return;
    }
    try {
      await referralService.createReferral({
        patient: p.id,
        specialty: newReferral.specialty.trim(),
        facility: newReferral.facility.trim(),
        facility_partner: newReferral.facility_partner,
        facility_type: newReferral.facility_type,
        urgency: newReferral.urgency,
        reason: newReferral.reason.trim(),
        clinical_summary: newReferral.clinical_summary.trim() || undefined,
      });
      toast.success("Referral created as draft");
      setCreateDialogOpen(false);
      resetCreateReferralForm();
      void refetch();
      void refetchStats();
    } catch (error: unknown) {
      if (isAuthenticationError(error)) return;
      toast.error((error as Error)?.message || "Failed to create referral");
    }
  };

  return (
    <DashboardLayout>
      <div className="container mx-auto p-4 sm:p-6 space-y-4 sm:space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground flex items-center gap-3">
              <Send className="h-8 w-8 text-emerald-500" />
              Referrals &amp; forms
            </h1>
            <p className="text-muted-foreground mt-1">
              Create the referral letter, issue responsibility forms, then send to Medical
              Records. Medical Records acknowledges stamps on their own page.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setCreateDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Create referral
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="border-l-4 border-l-blue-500">
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">Total (all statuses)</p>
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
          statusOptions={consultationStatusOptions}
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
            icon: <Stethoscope className="h-12 w-12" />,
            title: "No referrals found",
            description: "Create one from an active consultation room, or adjust filters.",
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

        <Dialog
          open={createDialogOpen}
          onOpenChange={(open) => {
            if (!open) setCreateDialogOpen(false);
          }}
        >
          <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Plus className="h-5 w-5 text-emerald-500" />
                Create referral (draft)
              </DialogTitle>
              <DialogDescription>
                Search for a patient, then create a draft. Print the letter and issue forms
                from the row actions.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Patient</Label>
                <Input
                  placeholder="Search by patient id or name…"
                  value={patientQuery}
                  onChange={(e) => setPatientQuery(e.target.value)}
                />
                {patientLoading ? (
                  <p className="text-sm text-muted-foreground">Searching…</p>
                ) : patientResults.length > 0 ? (
                  <div className="max-h-40 overflow-y-auto rounded-md border">
                    {patientResults.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        className={`w-full px-3 py-2 text-left hover:bg-muted/50 ${selectedPatient?.id === p.id ? "bg-muted/50" : ""}`}
                        onClick={() => setSelectedPatient(p)}
                      >
                        <div className="font-medium">
                          {p.full_name || `${p.first_name} ${p.surname}`}
                        </div>
                        <div className="text-xs text-muted-foreground">{p.patient_id}</div>
                      </button>
                    ))}
                  </div>
                ) : debouncedPatientQuery.trim().length >= 2 ? (
                  <p className="text-sm text-muted-foreground">No patients found.</p>
                ) : null}
                {selectedPatient ? (
                  <p className="text-sm text-muted-foreground">
                    Selected:{" "}
                    <span className="font-medium">
                      {selectedPatient.full_name || selectedPatient.patient_id}
                    </span>
                  </p>
                ) : null}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Specialty</Label>
                  <Input
                    value={newReferral.specialty}
                    onChange={(e) =>
                      setNewReferral((r) => ({ ...r, specialty: e.target.value }))
                    }
                    placeholder="e.g. Oncology"
                  />
                </div>
                <FacilityPartnerSelect
                  value={{
                    partnerId: newReferral.facility_partner,
                    facility: newReferral.facility,
                    facility_type: newReferral.facility_type,
                  }}
                  onChange={(next) =>
                    setNewReferral((r) => ({
                      ...r,
                      facility: next.facility,
                      facility_partner: next.partnerId,
                      facility_type: next.facility_type,
                    }))
                  }
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Facility type</Label>
                  <Select
                    value={newReferral.facility_type}
                    onValueChange={(v) =>
                      setNewReferral((r) => ({
                        ...r,
                        facility_type: v as ReferralWithPatient["facility_type"],
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {REFERRAL_FACILITY_TYPE_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Urgency</Label>
                  <Select
                    value={newReferral.urgency}
                    onValueChange={(v) =>
                      setNewReferral((r) => ({
                        ...r,
                        urgency: v as ReferralWithPatient["urgency"],
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {REFERRAL_URGENCY_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Reason</Label>
                <Textarea
                  value={newReferral.reason}
                  onChange={(e) =>
                    setNewReferral((r) => ({ ...r, reason: e.target.value }))
                  }
                  placeholder="Reason for referral"
                  rows={3}
                />
              </div>

              <div className="space-y-2">
                <Label>Clinical summary (optional)</Label>
                <Textarea
                  value={newReferral.clinical_summary}
                  onChange={(e) =>
                    setNewReferral((r) => ({ ...r, clinical_summary: e.target.value }))
                  }
                  rows={3}
                />
              </div>
            </div>

            <DialogFooter className="gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setCreateDialogOpen(false);
                  resetCreateReferralForm();
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={() => void createReferralDraft()}
                disabled={
                  !selectedPatient ||
                  !newReferral.specialty.trim() ||
                  !newReferral.facility.trim() ||
                  !newReferral.reason.trim() ||
                  patientLoading
                }
              >
                Create draft
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <ConsultationReferralDetailModal
          open={showDetailsModal}
          onOpenChange={setShowDetailsModal}
          referral={selectedReferral}
          forms={selectedForms}
          formsLoading={formsLoading}
          formPayload={formPayload}
          onFormPayloadChange={setFormPayload}
          issuingForm={issuingForm}
          canEditClinician={canEditClinician}
          canSubmitToRecords={canSubmitToRecords}
          canClinicianIssueForm={canClinicianIssueForm}
          submittingToRecords={submittingToRecords}
          onPrintLetter={handlePrintLetter}
          onPrintForm={handlePrintForm}
          onIssueForm={() => void issueResponsibilityForm()}
          onEdit={openEdit}
          onSubmitToRecords={() => void submitToRecords()}
          blockingActiveResponsibilityForm={hasOverlappingActiveResponsibilityForm(
            selectedForms,
            formPayload.valid_from,
            formPayload.valid_to
          )}
          formOverrideReason={formOverrideReason}
          onFormOverrideReasonChange={setFormOverrideReason}
        />

        <Dialog open={showEditModal} onOpenChange={setShowEditModal}>
          <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Edit referral</DialogTitle>
              <DialogDescription>Only available for your draft referrals.</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Specialty</Label>
                <Input
                  value={editForm.specialty}
                  onChange={(e) =>
                    setEditForm((f) => ({ ...f, specialty: e.target.value }))
                  }
                />
              </div>
              <div>
                <FacilityPartnerSelect
                  value={{
                    partnerId: editForm.facility_partner,
                    facility: editForm.facility,
                    facility_type: editForm.facility_type,
                  }}
                  onChange={(next) =>
                    setEditForm((f) => ({
                      ...f,
                      facility: next.facility,
                      facility_partner: next.partnerId,
                      facility_type: next.facility_type,
                    }))
                  }
                />
              </div>
              <div>
                <Label>Facility type</Label>
                <Select
                  value={editForm.facility_type}
                  onValueChange={(v) =>
                    setEditForm((f) => ({
                      ...f,
                      facility_type: v as ReferralWithPatient["facility_type"],
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {REFERRAL_FACILITY_TYPE_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Urgency</Label>
                <Select
                  value={editForm.urgency}
                  onValueChange={(v) =>
                    setEditForm((f) => ({
                      ...f,
                      urgency: v as ReferralWithPatient["urgency"],
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {REFERRAL_URGENCY_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Reason</Label>
                <Textarea
                  value={editForm.reason}
                  onChange={(e) =>
                    setEditForm((f) => ({ ...f, reason: e.target.value }))
                  }
                  rows={3}
                />
              </div>
              <div>
                <Label>Clinical summary</Label>
                <Textarea
                  value={editForm.clinical_summary}
                  onChange={(e) =>
                    setEditForm((f) => ({ ...f, clinical_summary: e.target.value }))
                  }
                  rows={3}
                />
              </div>
              <div>
                <Label>Contact person (optional)</Label>
                <Input
                  value={editForm.contact_person}
                  onChange={(e) =>
                    setEditForm((f) => ({ ...f, contact_person: e.target.value }))
                  }
                />
              </div>
              <div>
                <Label>Contact phone (optional)</Label>
                <Input
                  value={editForm.contact_phone}
                  onChange={(e) =>
                    setEditForm((f) => ({ ...f, contact_phone: e.target.value }))
                  }
                />
              </div>
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setShowEditModal(false)}>
                Cancel
              </Button>
              <Button onClick={() => void saveEdit()} disabled={editSaving}>
                {editSaving ? "Saving…" : "Save"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
