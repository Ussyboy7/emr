"use client";
import { formatDisplayDateTime } from '@/lib/dates';

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  CheckCircle2,
  Circle,
  Download,
  Loader2,
  ClipboardCheck,
  AlertTriangle,
  TestTube,
  ScanLine,
  Eye,
  Settings2,
  Send,
  UserRound,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { MODAL_SIZES } from "@/components/ui/modal-sizes";
import {
  annualCheckupService,
  capturedViaLabel,
  FITNESS_OUTCOME_OPTIONS,
  OUTCOME_NOTE_TEMPLATES,
  type AnnualCheckup,
  type CatalogItem,
  type FitnessOutcome,
} from "@/lib/services/annual-checkup-service";
import { isAuthenticationError } from "@/lib/auth-errors";
import { patientService } from "@/lib/services/patient-service";

const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
const GENOTYPES = ["AA", "AS", "SS", "AC", "SC"];

interface AnnualCheckupPanelProps {
  visitId: string | number | null | undefined;
  patientDbId?: string | number | null;
  patientBloodGroup?: string;
  patientGenotype?: string;
  consultationSessionId?: number | null;
  capabilities?: string[] | null;
  isSuperuser?: boolean;
  onSignedOff?: () => void;
  onNavigateTab?: (tab: string) => void;
  onPatientRecordUpdated?: (data: { bloodGroup?: string; genotype?: string }) => void;
  /** Read-only display (e.g. medical records report modal). */
  readOnly?: boolean;
}

function canSignOffAnnualCheckup(capabilities?: string[] | null, isSuperuser?: boolean): boolean {
  if (isSuperuser) return true;
  return (capabilities ?? []).includes('annual_checkup_signoff');
}

const COMPLETION_HINTS: Record<string, string> = {
  history_review:
    "Use Mark reviewed if history is unchanged, or edit in History tab if something needs updating.",
  physical_exam: "Notes tab → fill the Physical Examination field (not only complaint or plan).",
  vision_acuity:
    "Eye tab → annual visits show a Snellen VA section on the eye order. Enter OD/OS/OU — ordering without VA does not tick.",
  fitness_assessment:
    "Select a fitness outcome below, then Save draft or Sign off. Ticks when fitness outcome is recorded.",
  lab_fbc: "Order via bulk action or Lab tab; ticks when the lab test exists on this visit.",
  lab_fbs: "Order via bulk action or Lab tab; ticks when the lab test exists on this visit.",
  lab_urinalysis: "Order via bulk action or Lab tab; ticks when the lab test exists on this visit.",
  blood_group: "Ticks automatically when blood group is on the patient chart. Open only to add or change.",
  genotype: "Ticks automatically when genotype is on the patient chart. Open only to add or change.",
};

function chartValueForCode(
  code: string,
  bloodGroup?: string,
  genotype?: string
): string | undefined {
  if (code === "blood_group" && bloodGroup) return bloodGroup;
  if (code === "genotype" && genotype) return genotype;
  return undefined;
}

export function AnnualCheckupPanel({
  visitId,
  patientDbId,
  patientBloodGroup,
  patientGenotype,
  consultationSessionId,
  capabilities,
  isSuperuser,
  onSignedOff,
  onNavigateTab,
  onPatientRecordUpdated,
  readOnly = false,
}: AnnualCheckupPanelProps) {
  const [checkup, setCheckup] = useState<AnnualCheckup | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [signingOff, setSigningOff] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [ordering, setOrdering] = useState(false);
  const [fitnessOutcome, setFitnessOutcome] = useState<FitnessOutcome | "">("");
  const [outcomeNotes, setOutcomeNotes] = useState("");
  const [overrideReason, setOverrideReason] = useState("");
  const [showOverride, setShowOverride] = useState(false);
  const [selectionOpen, setSelectionOpen] = useState(false);
  const [draftSelected, setDraftSelected] = useState<string[]>([]);
  const [activeRecordModal, setActiveRecordModal] = useState<"blood_group" | "genotype" | null>(
    null
  );
  const [recordBloodGroup, setRecordBloodGroup] = useState("");
  const [recordGenotype, setRecordGenotype] = useState("");
  const [savingRecord, setSavingRecord] = useState(false);

  const doctor = canSignOffAnnualCheckup(capabilities, isSuperuser);
  const numericVisitId = visitId ? Number(visitId) : NaN;

  const loadCheckup = useCallback(async () => {
    if (!Number.isFinite(numericVisitId) || numericVisitId <= 0) {
      setCheckup(null);
      return;
    }
    setLoading(true);
    try {
      let record = await annualCheckupService.getByVisit(numericVisitId);
      if (!record) {
        try {
          record = await annualCheckupService.ensureForVisit(numericVisitId);
        } catch {
          record = null;
        }
      }
      setCheckup(record);
      if (record) {
        setFitnessOutcome((record.fitness_outcome as FitnessOutcome) || "");
        setOutcomeNotes(record.outcome_notes || "");
        setDraftSelected(record.components_required || []);
      }
    } catch (err) {
      if (!isAuthenticationError(err)) {
        toast.error("Could not load annual check-up record.");
      }
      setCheckup(null);
    } finally {
      setLoading(false);
    }
  }, [numericVisitId]);

  useEffect(() => {
    loadCheckup();
  }, [loadCheckup]);

  const catalog = useMemo(() => checkup?.catalog ?? [], [checkup?.catalog]);
  const selectedItems = useMemo(
    () => catalog.filter((item) => item.selected),
    [catalog]
  );
  const pendingLabCount = selectedItems.filter(
    (i) => !i.done && i.captured_via === "laboratory" && (i.lab_template_codes?.length ?? 0) > 0
  ).length;
  const pendingRadCount = selectedItems.filter(
    (i) =>
      !i.done &&
      i.captured_via === "radiology" &&
      (i.radiology_template_codes?.length ?? 0) > 0
  ).length;

  const handleSaveDraft = async () => {
    if (!checkup || checkup.status === "completed") return;
    if (!fitnessOutcome) {
      toast.error("Select a fitness outcome before saving.");
      return;
    }
    setSaving(true);
    try {
      const updated = await annualCheckupService.update(checkup.id, {
        fitness_outcome: fitnessOutcome,
        outcome_notes: outcomeNotes,
      });
      const refreshed = await annualCheckupService.refreshComponents(updated.id);
      setCheckup(refreshed);
      toast.success("Check-up draft saved.");
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "apiMessage" in err
          ? String((err as { apiMessage?: string }).apiMessage)
          : "Failed to save check-up.";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleMarkReviewed = async (code: string, label: string) => {
    if (!checkup || checkup.status === "completed") return;
    setSaving(true);
    try {
      const updated = await annualCheckupService.update(checkup.id, {
        component_overrides: {
          ...(checkup.component_overrides || {}),
          [code]: "Reviewed — no changes required",
        },
      });
      const refreshed = await annualCheckupService.refreshComponents(updated.id);
      setCheckup(refreshed);
      toast.success(`${label} marked as reviewed.`);
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "apiMessage" in err
          ? String((err as { apiMessage?: string }).apiMessage)
          : "Could not mark as reviewed.";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveSelection = async () => {
    if (!checkup || checkup.status === "completed") return;
    setSaving(true);
    try {
      const updated = await annualCheckupService.update(checkup.id, {
        components_required: draftSelected,
      });
      const refreshed = await annualCheckupService.refreshComponents(updated.id);
      setCheckup(refreshed);
      setSelectionOpen(false);
      toast.success("Checklist selection updated.");
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "apiMessage" in err
          ? String((err as { apiMessage?: string }).apiMessage)
          : "Failed to save selection.";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleOrderInvestigations = async () => {
    if (!checkup) return;
    setOrdering(true);
    try {
      const result = await annualCheckupService.orderInvestigations(checkup.id, {
        consultation_session: consultationSessionId ?? undefined,
      });
      setCheckup(result.checkup);
      const parts: string[] = [];
      if (result.lab_tests_count) parts.push(`${result.lab_tests_count} lab test(s)`);
      if (result.radiology_studies_count) parts.push(`${result.radiology_studies_count} imaging study(ies)`);
      if (parts.length) {
        toast.success(`Ordered ${parts.join(" and ")}.`);
      } else if (result.skipped?.length) {
        toast.info("No new orders — items may need manual ordering or are already done.");
      } else {
        toast.info("Nothing pending to order.");
      }
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "apiMessage" in err
          ? String((err as { apiMessage?: string }).apiMessage)
          : "Failed to order investigations.";
      toast.error(msg);
    } finally {
      setOrdering(false);
    }
  };

  const handleSignOff = async () => {
    if (!checkup || !doctor) return;
    if (!fitnessOutcome) {
      toast.error("Fitness outcome is required to sign off.");
      return;
    }
    const incomplete = checkup.incomplete_components?.length ?? 0;
    if (incomplete > 0 && !overrideReason.trim()) {
      setShowOverride(true);
      toast.warning("Some components are incomplete. Provide an override reason.");
      return;
    }
    setSigningOff(true);
    try {
      const updated = await annualCheckupService.signOff(checkup.id, {
        fitness_outcome: fitnessOutcome,
        outcome_notes: outcomeNotes,
        override_reason: overrideReason.trim() || undefined,
      });
      setCheckup(updated);
      toast.success("Annual check-up signed off.");
      onSignedOff?.();
    } catch (err: unknown) {
      const apiMsg =
        err && typeof err === "object" && "apiMessage" in err
          ? String((err as { apiMessage?: string }).apiMessage)
          : null;
      if (apiMsg?.toLowerCase().includes("override")) {
        setShowOverride(true);
      }
      toast.error(apiMsg || "Sign-off failed.");
    } finally {
      setSigningOff(false);
    }
  };

  const handleDownloadPdf = async () => {
    if (!checkup) return;
    setDownloading(true);
    try {
      const blob = await annualCheckupService.fetchReportPdf(checkup.id);
      annualCheckupService.downloadBlob(
        blob,
        `annual_checkup_${checkup.visit_id}_${checkup.programme_year}.pdf`
      );
    } catch {
      toast.error("Could not download report PDF.");
    } finally {
      setDownloading(false);
    }
  };

  const openBloodGroupDialog = () => {
    setRecordBloodGroup(patientBloodGroup || "");
    setActiveRecordModal("blood_group");
  };

  const openGenotypeDialog = () => {
    setRecordGenotype(patientGenotype || "");
    setActiveRecordModal("genotype");
  };

  const reloadCheckup = async (checkupId: number) => {
    const refreshed = await annualCheckupService.getById(checkupId);
    setCheckup(refreshed);
  };

  const handleSaveBloodGroup = async () => {
    const pid = patientDbId ? Number(patientDbId) : NaN;
    if (!Number.isFinite(pid) || pid <= 0) {
      toast.error("Patient ID not available.");
      return;
    }
    if (!recordBloodGroup) {
      toast.error("Select a blood group.");
      return;
    }
    setSavingRecord(true);
    try {
      await patientService.updatePatient(pid, { blood_group: recordBloodGroup });
      onPatientRecordUpdated?.({ bloodGroup: recordBloodGroup });
      setActiveRecordModal(null);
      await reloadCheckup(checkup!.id);
      toast.success("Blood group saved.");
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "apiMessage" in err
          ? String((err as { apiMessage?: string }).apiMessage)
          : "Could not update blood group.";
      toast.error(msg);
    } finally {
      setSavingRecord(false);
    }
  };

  const handleSaveGenotype = async () => {
    const pid = patientDbId ? Number(patientDbId) : NaN;
    if (!Number.isFinite(pid) || pid <= 0) {
      toast.error("Patient ID not available.");
      return;
    }
    if (!recordGenotype) {
      toast.error("Select a genotype.");
      return;
    }
    setSavingRecord(true);
    try {
      await patientService.updatePatient(pid, { genotype: recordGenotype });
      onPatientRecordUpdated?.({ genotype: recordGenotype });
      setActiveRecordModal(null);
      await reloadCheckup(checkup!.id);
      toast.success("Genotype saved.");
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "apiMessage" in err
          ? String((err as { apiMessage?: string }).apiMessage)
          : "Could not update genotype.";
      toast.error(msg);
    } finally {
      setSavingRecord(false);
    }
  };

  const handleOpenItem = (item: CatalogItem) => {
    if (item.code === "blood_group") {
      openBloodGroupDialog();
      return;
    }
    if (item.code === "genotype") {
      openGenotypeDialog();
      return;
    }
    if (item.captured_via === "patient_record") {
      toast.info("Use Open on the specific record item (blood group or genotype).");
      return;
    }
    if (!onNavigateTab) return;
    if (item.code === "history_review") {
      onNavigateTab("history");
      return;
    }
    if (item.code === "fitness_assessment") {
      onNavigateTab("annual_checkup");
      return;
    }
    switch (item.captured_via) {
      case "laboratory":
        onNavigateTab("lab");
        break;
      case "radiology":
        onNavigateTab("radiology");
        break;
      case "eyecare":
        onNavigateTab("eyecare");
        break;
      case "consultation":
        onNavigateTab("notes");
        break;
      case "medical_history":
        onNavigateTab("history");
        break;
      case "annual_checkup":
        onNavigateTab("annual_checkup");
        break;
      case "vitals":
        onNavigateTab("notes");
        break;
      default:
        toast.info("No linked screen for this item — use Refresh checklist after completing it elsewhere.");
        break;
    }
  };

  const toggleDraftCode = (code: string, checked: boolean) => {
    setDraftSelected((prev) => {
      if (checked) return prev.includes(code) ? prev : [...prev, code];
      return prev.filter((c) => c !== code);
    });
  };

  if (!Number.isFinite(numericVisitId) || numericVisitId <= 0) {
    return null;
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading annual check-up…
        </CardContent>
      </Card>
    );
  }

  if (!checkup) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground text-sm">
          No annual check-up record for this visit. Ensure the visit type is Annual Check-up.
        </CardContent>
      </Card>
    );
  }

  const isCompleted = checkup.status === "completed";
  const incompleteCount = checkup.incomplete_components?.length ?? 0;
  const doneCount = selectedItems.filter((i) => i.done).length;

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg">
                <ClipboardCheck className="h-5 w-5 text-emerald-600" />
                Annual Check-up {checkup.programme_year}
              </CardTitle>
              <CardDescription>
                {readOnly
                  ? "Annual employee check-up checklist and fitness outcome."
                  : "Select investigations for this visit, order labs/imaging, then sign off."}
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={isCompleted ? "default" : "secondary"}>
                {isCompleted ? "Completed" : "In progress"}
              </Badge>
              <Badge variant="outline">
                {doneCount}/{selectedItems.length} done
              </Badge>
              {checkup.has_report_pdf || isCompleted ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleDownloadPdf}
                  disabled={downloading}
                >
                  {downloading ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-1" />
                  ) : (
                    <Download className="h-4 w-4 mr-1" />
                  )}
                  Report PDF
                </Button>
              ) : null}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {!readOnly && !isCompleted ? (
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setDraftSelected(checkup.components_required || []);
                  setSelectionOpen(true);
                }}
              >
                <Settings2 className="h-4 w-4 mr-1" />
                Edit checklist
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={handleOrderInvestigations}
                disabled={ordering || (pendingLabCount === 0 && pendingRadCount === 0)}
              >
                {ordering ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-1" />
                ) : (
                  <Send className="h-4 w-4 mr-1" />
                )}
                Order pending labs & imaging
                {(pendingLabCount > 0 || pendingRadCount > 0) && (
                  <span className="ml-1 text-xs opacity-80">
                    ({pendingLabCount + pendingRadCount})
                  </span>
                )}
              </Button>
            </div>
          ) : null}

          <div>
            <h4 className="text-sm font-medium mb-3">Selected for this visit</h4>
            <ul className="space-y-2">
              {selectedItems.length === 0 ? (
                <li className="text-sm text-muted-foreground py-4 text-center border rounded-md">
                  No items selected — use Edit checklist to choose investigations.
                </li>
              ) : (
                selectedItems.map((item) => (
                  <li
                    key={item.code}
                    className="flex items-start gap-2 rounded-md border px-3 py-2 text-sm"
                  >
                    {item.done ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" />
                    ) : (
                      <Circle className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={item.done ? "text-foreground" : "text-muted-foreground"}>
                          {item.label}
                        </span>
                        <Badge variant="outline" className="text-[10px]">
                          Tier {item.tier}
                        </Badge>
                        <Badge variant="secondary" className="text-[10px]">
                          {capturedViaLabel(item.captured_via)}
                        </Badge>
                        {chartValueForCode(item.code, patientBloodGroup, patientGenotype) ? (
                          <Badge variant="outline" className="text-[10px] text-emerald-700 border-emerald-300">
                            On chart: {chartValueForCode(item.code, patientBloodGroup, patientGenotype)}
                          </Badge>
                        ) : null}
                      </div>
                      {item.override_reason ? (
                        <p className="text-xs text-amber-700 mt-1">
                          Override: {item.override_reason}
                        </p>
                      ) : null}
                      {!item.done && COMPLETION_HINTS[item.code] ? (
                        <p className="text-xs text-muted-foreground mt-1 leading-snug">
                          {COMPLETION_HINTS[item.code]}
                        </p>
                      ) : null}
                    </div>
                    {!readOnly && !isCompleted && !item.done ? (
                      <div className="flex flex-col gap-1 shrink-0">
                        {item.code === "history_review" ? (
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            className="h-8"
                            disabled={saving}
                            onClick={() => handleMarkReviewed(item.code, item.label)}
                          >
                            Confirm reviewed
                          </Button>
                        ) : null}
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8"
                          onClick={() => handleOpenItem(item)}
                        >
                          {item.captured_via === "laboratory" ? (
                            <TestTube className="h-3.5 w-3.5 mr-1" />
                          ) : item.captured_via === "radiology" ? (
                            <ScanLine className="h-3.5 w-3.5 mr-1" />
                          ) : item.captured_via === "eyecare" ? (
                            <Eye className="h-3.5 w-3.5 mr-1" />
                          ) : item.captured_via === "patient_record" ? (
                            <UserRound className="h-3.5 w-3.5 mr-1" />
                          ) : null}
                          {chartValueForCode(item.code, patientBloodGroup, patientGenotype)
                            ? "Update"
                            : "Open"}
                        </Button>
                      </div>
                    ) : null}
                  </li>
                ))
              )}
            </ul>
            {incompleteCount > 0 && !isCompleted ? (
              <p className="flex items-center gap-1 text-xs text-amber-700 mt-2">
                <AlertTriangle className="h-3.5 w-3.5" />
                {incompleteCount} selected item(s) still pending.
              </p>
            ) : null}
          </div>

          <div className="space-y-4 border-t pt-4">
            {readOnly && isCompleted ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <div>
                  <Label className="text-muted-foreground">Fitness outcome</Label>
                  <p className="font-medium mt-1">{checkup.fitness_outcome_display || "—"}</p>
                </div>
                {checkup.outcome_notes?.trim() ? (
                  <div className="sm:col-span-2">
                    <Label className="text-muted-foreground">Outcome notes</Label>
                    <p className="mt-1 whitespace-pre-wrap">{checkup.outcome_notes}</p>
                  </div>
                ) : null}
              </div>
            ) : null}
            {!readOnly ? (
            <>
            <div className="space-y-2">
              <Label>Fitness outcome</Label>
              <Select
                value={fitnessOutcome || undefined}
                onValueChange={(v) => setFitnessOutcome(v as FitnessOutcome)}
                disabled={isCompleted || !doctor}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select fitness outcome" />
                </SelectTrigger>
                <SelectContent>
                  {FITNESS_OUTCOME_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Outcome notes (HR-safe)</Label>
              <p className="text-xs text-muted-foreground">
                For HR — keep administrative. Clinical detail belongs in consultation notes.
              </p>
              <div className="flex flex-wrap gap-2 mb-1">
                {OUTCOME_NOTE_TEMPLATES.map((tpl) => (
                  <Button
                    key={tpl}
                    type="button"
                    variant="outline"
                    size="sm"
                    className="text-xs h-auto py-1 whitespace-normal text-left"
                    disabled={isCompleted || !doctor}
                    onClick={() => setOutcomeNotes(tpl)}
                  >
                    {tpl.length > 48 ? `${tpl.slice(0, 48)}…` : tpl}
                  </Button>
                ))}
              </div>
              <Textarea
                value={outcomeNotes}
                onChange={(e) => setOutcomeNotes(e.target.value)}
                placeholder="Plain-language fitness guidance for HR…"
                rows={3}
                disabled={isCompleted || !doctor}
              />
            </div>

            {showOverride && incompleteCount > 0 && !isCompleted ? (
              <div className="space-y-2 rounded-md border border-amber-200 bg-amber-50/50 p-3 dark:border-amber-900 dark:bg-amber-950/20">
                <Label>Override reason (incomplete components)</Label>
                <Textarea
                  value={overrideReason}
                  onChange={(e) => setOverrideReason(e.target.value)}
                  placeholder="Why sign-off proceeds without all components…"
                  rows={2}
                  disabled={!doctor}
                />
              </div>
            ) : null}

            {!isCompleted && doctor ? (
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="secondary" onClick={handleSaveDraft} disabled={saving}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                  Save draft
                </Button>
                <Button type="button" onClick={handleSignOff} disabled={signingOff}>
                  {signingOff ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                  Sign off check-up
                </Button>
              </div>
            ) : null}

            {!doctor && !isCompleted ? (
              <p className="text-xs text-muted-foreground">
                Only a Medical Doctor or system administrator can sign off this check-up.
              </p>
            ) : null}
            </>
            ) : null}

            {isCompleted && checkup.signed_off_by_name ? (
              <p className="text-xs text-muted-foreground">
                Signed off by {checkup.signed_off_by_name}
                {checkup.signed_off_at
                  ? ` on ${formatDisplayDateTime(checkup.signed_off_at)}`
                  : ""}
                .
              </p>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Dialog
        open={activeRecordModal === "blood_group"}
        onOpenChange={(open) => !open && setActiveRecordModal(null)}
      >
        <DialogContent className={MODAL_SIZES.md}>
          <DialogHeader>
            <DialogTitle>Record blood group</DialogTitle>
            <DialogDescription>
              {patientBloodGroup
                ? `Already on chart: ${patientBloodGroup}. Save only if you need to change it.`
                : "Save on the patient chart, or order a BG lab from the Lab tab instead."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            {patientBloodGroup ? (
              <p className="text-sm rounded-md border border-emerald-200 bg-emerald-50/60 dark:bg-emerald-950/20 px-3 py-2 text-emerald-800 dark:text-emerald-300">
                Current on chart: <strong>{patientBloodGroup}</strong> — should tick automatically. Save only if you need to change it.
              </p>
            ) : null}
            <div className="space-y-2">
              <Label>Blood group</Label>
              <Select value={recordBloodGroup || undefined} onValueChange={setRecordBloodGroup}>
                <SelectTrigger>
                  <SelectValue placeholder="Select blood group" />
                </SelectTrigger>
                <SelectContent>
                  {BLOOD_GROUPS.map((bg) => (
                    <SelectItem key={bg} value={bg}>
                      {bg}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {onNavigateTab ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-fit"
                onClick={() => {
                  setActiveRecordModal(null);
                  onNavigateTab("lab");
                }}
              >
                <TestTube className="h-3.5 w-3.5 mr-1" />
                Order BG lab instead
              </Button>
            ) : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setActiveRecordModal(null)}>
              Cancel
            </Button>
            <Button type="button" onClick={handleSaveBloodGroup} disabled={savingRecord}>
              {savingRecord ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Save blood group
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={activeRecordModal === "genotype"}
        onOpenChange={(open) => !open && setActiveRecordModal(null)}
      >
        <DialogContent className={MODAL_SIZES.md}>
          <DialogHeader>
            <DialogTitle>Record haemoglobin genotype</DialogTitle>
            <DialogDescription>
              {patientGenotype
                ? `Already on chart: ${patientGenotype}. Save only if you need to change it.`
                : "Save on the patient chart, or order an HB-GT lab from the Lab tab instead."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            {patientGenotype ? (
              <p className="text-sm rounded-md border border-emerald-200 bg-emerald-50/60 dark:bg-emerald-950/20 px-3 py-2 text-emerald-800 dark:text-emerald-300">
                Current on chart: <strong>{patientGenotype}</strong> — should tick automatically. Save only if you need to change it.
              </p>
            ) : null}
            <div className="space-y-2">
              <Label>Haemoglobin genotype</Label>
              <Select value={recordGenotype || undefined} onValueChange={setRecordGenotype}>
                <SelectTrigger>
                  <SelectValue placeholder="Select genotype" />
                </SelectTrigger>
                <SelectContent>
                  {GENOTYPES.map((g) => (
                    <SelectItem key={g} value={g}>
                      {g}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {onNavigateTab ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-fit"
                onClick={() => {
                  setActiveRecordModal(null);
                  onNavigateTab("lab");
                }}
              >
                <TestTube className="h-3.5 w-3.5 mr-1" />
                Order HB-GT lab instead
              </Button>
            ) : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setActiveRecordModal(null)}>
              Cancel
            </Button>
            <Button type="button" onClick={handleSaveGenotype} disabled={savingRecord}>
              {savingRecord ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Save genotype
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={selectionOpen} onOpenChange={setSelectionOpen}>
        <DialogContent className={MODAL_SIZES.lg}>
          <DialogHeader>
            <DialogTitle>Edit checklist selection</DialogTitle>
            <DialogDescription>
              Choose which investigations apply to this visit. Defaults come from the annual
              programme (set by admin).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            {catalog.map((item) => (
              <label
                key={item.code}
                className="flex items-start gap-3 rounded-md border px-3 py-2 cursor-pointer hover:bg-muted/50"
              >
                <Checkbox
                  checked={draftSelected.includes(item.code)}
                  onCheckedChange={(v) => toggleDraftCode(item.code, v === true)}
                  className="mt-0.5"
                />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium">{item.label}</div>
                  <div className="flex gap-2 mt-1">
                    <Badge variant="outline" className="text-[10px]">
                      Tier {item.tier}
                    </Badge>
                    <Badge variant="secondary" className="text-[10px]">
                      {capturedViaLabel(item.captured_via)}
                    </Badge>
                  </div>
                </div>
              </label>
            ))}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setSelectionOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={handleSaveSelection} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Save selection
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
