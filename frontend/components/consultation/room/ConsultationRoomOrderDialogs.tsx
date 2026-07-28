"use client";

import { useMemo, useRef } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { MODAL_SIZES } from '@/components/ui/modal-sizes';
import { MedicationGenericPicker } from '@/components/pharmacy/MedicationGenericPicker';
import {
  MedicationSelectionConfigList,
  type MedicationSelectionConfig,
} from '@/components/pharmacy/MedicationSelectionConfigList';
import { FacilityPartnerSelect } from '@/components/referrals/FacilityPartnerSelect';
import { PrescriptionOrderModal } from '@/components/consultation/orders/PrescriptionOrderModal';
import { PrescriptionRefillDialog } from '@/components/consultation/orders/PrescriptionRefillDialog';
import { Icd10DiagnosisMultiPicker } from '@/components/medical/Icd10DiagnosisMultiPicker';
import { TemplateCatalogMultiSelect } from '@/components/medical/TemplateCatalogMultiSelect';
import { validateOrderDiagnoses } from '@/lib/consultation/order-diagnoses';
import {
  DUPLICATE_VISIT_DIAGNOSIS_MESSAGE,
  getDuplicateVisitDiagnosisMessage,
  hasVisitDiagnosis,
} from '@/lib/consultation/visit-diagnoses';
import { prescriptionModalCopy } from '@/lib/consultation/prescription-refill';
import { debugConsultationRoom } from '@/lib/consultation/room-helpers';
import { getNursingOrderIcon } from '@/lib/consultation/room-nursing-helpers';
import {
  type GenericMedicationLike,
  DEFAULT_INJECTION_ROUTE,
  PROCEDURE_DOSE_UNITS,
  formatGenericMedicationLabel,
} from '@/lib/pharmacy/generic-medication';
import {
  ADMINISTRATION_ROUTES,
  INJECTION_ROUTES,
  WOUND_TYPES,
  WOUND_LOCATIONS,
  RADIOLOGY_PROCEDURES,
} from '@/lib/constants/medical-data';
import {
  LAB_OTHER_TEMPLATE_CODE,
  RAD_OTHER_TEMPLATE_CODE,
} from '@/lib/constants/order-template-codes';
import type { Diagnosis, ICD10Code } from '@/lib/services';
import { consultationService } from '@/lib/services';
import {
  Activity,
  AlertTriangle,
  CheckCircle,
  DoorOpen,
  Droplets,
  Eye,
  Loader2,
  Pill,
  Plus,
  ScanLine,
  Send,
  Stethoscope,
  Syringe,
  TestTube,
  UserPlus,
  Wind,
  X,
  Zap,
} from 'lucide-react';
import { toast } from 'sonner';
import type { ConsultationRoomOrderDialogsWorkspace } from '@/hooks/use-consultation-room-orders';

const woundTypes = WOUND_TYPES;
const woundLocations = WOUND_LOCATIONS;

export type ConsultationRoomOrderDialogsProps = {
  workspace: ConsultationRoomOrderDialogsWorkspace;
};

export function ConsultationRoomOrderDialogs({ workspace }: ConsultationRoomOrderDialogsProps) {
  const addingDiagnosisRef = useRef(false);
  const addedIcd10Ids = useMemo(
    () => new Set(workspace.diagnoses.map((d) => d.icd10_code)),
    [workspace.diagnoses],
  );

  const addDiagnosisFromCode = async (dx: ICD10Code) => {
    if (addingDiagnosisRef.current) return;

    const {
      currentPatient,
      diagnoses,
      diagnosisNotes,
      selectedDiagnosisType,
      sessionId,
      setDiagnoses,
      setDiagnosisNotes,
      setDiagnosisSearch,
      setShowAddDiagnosis,
      setShowDiagnosisDropdown,
    } = workspace;

    if (!currentPatient) {
      toast.error('No patient selected');
      return;
    }

    const patientVisitId = currentPatient.visitId ? Number(currentPatient.visitId) : null;
    if (hasVisitDiagnosis(diagnoses, dx.id, patientVisitId)) {
      toast.message(DUPLICATE_VISIT_DIAGNOSIS_MESSAGE);
      return;
    }

    addingDiagnosisRef.current = true;
    try {
      const diagnosisData: Partial<Diagnosis> = {
        patient: Number(currentPatient.id),
        visit: patientVisitId ?? undefined,
        session: sessionId || undefined,
        icd10_code: dx.id,
        diagnosis_text: diagnosisNotes || '',
        status: 'confirmed',
        certainty:
          selectedDiagnosisType === 'Primary'
            ? 'confirmed'
            : selectedDiagnosisType === 'Secondary'
              ? 'probable'
              : 'possible',
        notes: diagnosisNotes || '',
      };

      const newDiagnosis = await consultationService.createDiagnosis(diagnosisData);
      setDiagnoses([...diagnoses, newDiagnosis]);
      toast.success(`Added diagnosis: ${dx.code} - ${dx.description}`);
      setShowAddDiagnosis(false);
      setDiagnosisSearch('');
      setShowDiagnosisDropdown(false);
      setDiagnosisNotes('');
    } catch (err: unknown) {
      const duplicateMessage = getDuplicateVisitDiagnosisMessage(err);
      if (duplicateMessage) {
        toast.message(duplicateMessage);
        return;
      }
      console.error('Error creating diagnosis:', err);
      toast.error('Failed to add diagnosis. Please try again.');
    } finally {
      addingDiagnosisRef.current = false;
    }
  };

  const {
  addEyeOrder,
  addLabOrder,
  addNursingOrder,
  addPhysioOrder,
  addRadiologyOrder,
  addReferral,
  currentPatient,
  diagnoses,
  diagnosisDropdownContainerRef,
  diagnosisNotes,
  diagnosisSearch,
  editingEyeIndex,
  editingPhysioIndex,
  filteredLabTemplates,
  handleAddPrescriptionToOrder,
  handlePrescriptionModalOpenChange,
  handleRefillContinue,
  icd10Codes,
  icd10SearchResults,
  injectionConfigs,
  injectionMedicationResults,
  injectionMedicationSearch,
  injectionSelectedIds,
  isSearchingICD10,
  labTemplateDropdownContainerRef,
  labTemplateSearch,
  selectedLabTemplateDetails,
  loadingInjectionMedications,
  loadingLabTemplates,
  loadingRadiologyTemplates,
  newEye,
  newLabOrder,
  newNursingOrder,
  newPhysio,
  newRadiology,
  newReferral,
  otherLabPinnedTemplate,
  otherRadiologyPinnedTemplate,
  prescriptionModalInitialItems,
  prescriptionModalInitialPriority,
  prescriptionModalIntent,
  prescriptions,
  radiologyTemplateDropdownContainerRef,
  radiologyTemplateSearch,
  selectedRadiologyTemplateDetails,
  radiologyTemplatesError,
  referralReasons,
  referralSpecialties,
  roomRadiologyDropdownList,
  searchICD10Codes,
  searchTimeout,
  selectedDiagnosisType,
  selectedLabTemplates,
  selectedRadiologyTemplates,
  sessionId,
  setDiagnoses,
  setDiagnosisNotes,
  setDiagnosisSearch,
  setEditingEyeIndex,
  setEditingPhysioIndex,
  setIcd10SearchResults,
  setInjectionConfigs,
  setInjectionMedicationResults,
  setInjectionMedicationSearch,
  setInjectionSelectedIds,
  setLabTemplateSearch,
  setNewEye,
  setNewLabOrder,
  setNewNursingOrder,
  setNewPhysio,
  setNewRadiology,
  setNewReferral,
  setRadiologyTemplateSearch,
  setSearchTimeout,
  setSelectedDiagnosisType,
  setSelectedLabTemplates,
  setSelectedLabTemplateDetails,
  setSelectedRadiologyTemplates,
  setSelectedRadiologyTemplateDetails,
  setShowAddDiagnosis,
  setShowAddEye,
  setShowAddLabOrder,
  setShowAddNursingOrder,
  setShowAddPhysio,
  setShowAddRadiology,
  setShowAddReferral,
  setShowDiagnosisDropdown,
  setShowInjectionMedicationDropdown,
  setShowLabTemplateDropdown,
  setShowPrescriptionRefill,
  setShowRadiologyTemplateDropdown,
  showAddDiagnosis,
  showAddEye,
  showAddLabOrder,
  showAddNursingOrder,
  showAddPhysio,
  showAddPrescription,
  showAddRadiology,
  showAddReferral,
  showDiagnosisDropdown,
  showInjectionMedicationDropdown,
  showLabTemplateDropdown,
  showPrescriptionRefill,
  showRadiologyTemplateDropdown,
  toggleLabTemplateSelection,
  toggleRadiologyTemplateSelection,
  wards,
} = workspace;

  const selectedInjectionGenerics = useMemo(() => {
    const map = new Map<string, GenericMedicationLike>();
    injectionMedicationResults.forEach((med: any) => {
      const id = med?.id != null ? String(med.id) : '';
      if (!id || !injectionSelectedIds.has(id)) return;
      map.set(`g:${id}`, med as GenericMedicationLike);
    });
    return map;
  }, [injectionMedicationResults, injectionSelectedIds]);

  const toggleInjectionMedication = (med: GenericMedicationLike, selected: boolean) => {
    const id = med?.id != null ? String(med.id) : '';
    if (!id) return;
    setInjectionSelectedIds((prev) => {
      const next = new Set(prev);
      if (selected) next.add(id);
      else next.delete(id);
      return next;
    });
    if (selected && !injectionConfigs.has(id)) {
      setInjectionConfigs((prev) => {
        const next = new Map(prev);
        next.set(id, {
          dose: '',
          doseUnit: 'vial',
          frequency: 'Once daily (OD)',
          durationDays: '',
          route: DEFAULT_INJECTION_ROUTE,
          instructions: '',
        });
        return next;
      });
    }
    if (!selected) {
      setInjectionConfigs((prev) => {
        const next = new Map(prev);
        next.delete(id);
        return next;
      });
    }
  };

  return (
    <>
      {/* Add Diagnosis Dialog */}
      <Dialog open={showAddDiagnosis} onOpenChange={(open) => { setShowAddDiagnosis(open); if (!open) { setDiagnosisSearch(""); setShowDiagnosisDropdown(false); setDiagnosisNotes(""); } }}>
        <DialogContent className={MODAL_SIZES.md}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Stethoscope className="h-5 w-5 text-rose-500" />
              Add Diagnosis
            </DialogTitle>
            <DialogDescription>
              Set the diagnosis type, search ICD-10, then select a row to save. This dialog closes after each add so the diagnosis list stays in view. Use Add Diagnosis again to enter another code.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-2">
            {/* Diagnosis Type */}
            <div className="space-y-2">
              <Label>Diagnosis Type *</Label>
              <Select value={selectedDiagnosisType} onValueChange={(v: 'Primary' | 'Secondary' | 'Differential') => setSelectedDiagnosisType(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Primary">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-rose-500"></div>
                      Primary - Main diagnosis
                    </div>
                  </SelectItem>
                  <SelectItem value="Secondary">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-amber-500"></div>
                      Secondary - Contributing condition
                    </div>
                  </SelectItem>
                  <SelectItem value="Differential">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                      Differential - Possible diagnosis
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            {/* ICD-10 Search */}
            <div className="space-y-2">
              <Label>Search ICD-10 Code *</Label>
              <div className="relative" ref={diagnosisDropdownContainerRef}>
                <Input 
                  value={diagnosisSearch} 
                  onChange={(e) => {
                    const value = e.target.value;
                    setDiagnosisSearch(value);
                    setShowDiagnosisDropdown(true);

                    // Clear previous timeout
                    if (searchTimeout) {
                      clearTimeout(searchTimeout);
                    }

                    // Set new timeout for debounced search
                    const timeout = setTimeout(() => {
                      if (value.trim()) {
                        searchICD10Codes(value);
                      } else {
                        setIcd10SearchResults([]);
                      }
                    }, 300); // 300ms debounce

                    setSearchTimeout(timeout);
                  }}
                  onFocus={() => setShowDiagnosisDropdown(true)}
                  placeholder="Search by code or condition name (e.g., I10 or Hypertension)..." 
                />
                {showDiagnosisDropdown && (
                  <div className="absolute z-50 w-full mt-1 bg-background border rounded-md shadow-lg max-h-[250px] overflow-y-auto">
                    {(() => {
                      let displayCodes;
                      if (diagnosisSearch.trim()) {
                        displayCodes = icd10SearchResults;
                        debugConsultationRoom(`[ICD-10 Search] "${diagnosisSearch}" returned ${displayCodes.length} results from API`);
                      } else {
                        displayCodes = icd10Codes.slice(0, 20);
                      }
                      displayCodes = displayCodes.filter((dx) => !addedIcd10Ids.has(dx.id));

                      if (displayCodes.length === 0) {
                        if (isSearchingICD10) {
                          return (
                            <div className="p-4 text-center text-muted-foreground text-sm">
                              Searching...
                            </div>
                          );
                        } else if (diagnosisSearch.trim()) {
                          return (
                            <div className="p-4 text-center text-muted-foreground text-sm">
                              {addedIcd10Ids.size > 0
                                ? 'Matching codes are already on this visit'
                                : 'No matching ICD-10 codes found'}
                            </div>
                          );
                        } else {
                          return (
                            <div className="p-4 text-center text-muted-foreground text-sm">
                              {addedIcd10Ids.size > 0
                                ? 'All shown codes are already on this visit — search for another'
                                : 'Start typing to search ICD-10 codes'}
                            </div>
                          );
                        }
                      }

                      return displayCodes.map((dx, index) => (
                        <div 
                          key={`${dx.code}-${index}`}
                          onClick={() => void addDiagnosisFromCode(dx)}
                          className="p-2 hover:bg-muted cursor-pointer"
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="font-medium text-sm flex items-center gap-2">
                                <span className="font-mono bg-muted px-1.5 py-0.5 rounded text-xs">{dx.code}</span>
                                {dx.description}
                              </div>
                            </div>
                            <Badge variant="outline" className="text-xs">{dx.category}</Badge>
                          </div>
                        </div>
                      ));
                    })()}
                  </div>
                )}
              </div>
            </div>
            
            {/* Additional Notes */}
            <div className="space-y-2">
              <Label>Additional Notes (Optional)</Label>
              <Textarea 
                value={diagnosisNotes} 
                onChange={(e) => setDiagnosisNotes(e.target.value)} 
                placeholder="Add any specific notes about this diagnosis..."
                rows={2}
              />
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDiagnosis(false)}>Cancel</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <PrescriptionRefillDialog
        open={showPrescriptionRefill}
        onOpenChange={setShowPrescriptionRefill}
        patientId={currentPatient?.id ? Number(currentPatient.id) : null}
        patientAllergies={currentPatient?.allergies || []}
        existingDraftGenericIds={prescriptions
          .filter((rx) => rx.status === 'Draft')
          .map((rx) => rx.genericId ?? rx.medicationId)
          .filter((id): id is number => typeof id === 'number' && id > 0)}
        onContinue={handleRefillContinue}
      />

      <PrescriptionOrderModal
        open={showAddPrescription}
        onOpenChange={handlePrescriptionModalOpenChange}
        patientAllergies={currentPatient?.allergies || []}
        onSubmit={handleAddPrescriptionToOrder}
        initialItems={prescriptionModalInitialItems}
        initialPriority={prescriptionModalInitialPriority}
        {...prescriptionModalCopy(prescriptionModalIntent)}
        confirmLabel={
          prescriptionModalIntent === 'refill'
            ? 'Add as drafts'
            : prescriptionModalIntent === 'edit'
              ? 'Save changes'
              : undefined
        }
      />

      <Dialog 
        open={showAddLabOrder} 
        onOpenChange={(open) => {
          setShowAddLabOrder(open);
          if (!open) {
            setSelectedLabTemplates(new Set());
            setSelectedLabTemplateDetails(new Map());
            setLabTemplateSearch("");
            setShowLabTemplateDropdown(false);
          }
        }}
      >
        <DialogContent className={MODAL_SIZES.ml}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><TestTube className="h-5 w-5 text-amber-500" />Order Lab Test(s)</DialogTitle>
            <DialogDescription>
              Search and select tests from the catalog. Choose <strong>Other</strong> when the test is not listed, and describe the exact test in <strong>Clinical indication</strong> for the laboratory.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <TemplateCatalogMultiSelect
              label="Search and Select Tests *"
              placeholder="Search by name, code, or sample type (try “Other”)…"
              searchValue={labTemplateSearch}
              onSearchChange={(searchValue) => {
                setLabTemplateSearch(searchValue);
                setShowLabTemplateDropdown(!!searchValue.trim());
              }}
              showDropdown={showLabTemplateDropdown}
              onSearchFocus={() => {
                if (labTemplateSearch.trim()) setShowLabTemplateDropdown(true);
              }}
              dropdownRef={labTemplateDropdownContainerRef}
              loading={loadingLabTemplates}
              loadingText="Loading tests..."
              emptyText="No tests found. Try a different search term."
              items={filteredLabTemplates}
              selectedIds={selectedLabTemplates}
              selectedDetails={selectedLabTemplateDetails}
              pinnedTemplate={otherLabPinnedTemplate}
              onToggle={toggleLabTemplateSelection}
              onClearAll={() => setSelectedLabTemplates(new Set())}
              selectedLabel="Selected Tests"
              isOtherTemplate={(template) =>
                (template.code || '').toUpperCase() === LAB_OTHER_TEMPLATE_CODE
              }
              renderMeta={(template) => (
                <>
                  <div className="text-xs text-muted-foreground mt-1">
                    {template.code} • {template.sample_type}
                  </div>
                  {template.description && (
                    <div className="text-xs text-muted-foreground mt-1 line-clamp-1">
                      {template.description}
                    </div>
                  )}
                </>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Priority</Label>
                <Select value={newLabOrder.priority} onValueChange={(v) => setNewLabOrder({ ...newLabOrder, priority: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Routine"><div className="flex items-center gap-2"><Badge className="bg-blue-100 text-blue-800">Routine</Badge><span className="text-xs text-muted-foreground">Standard TAT</span></div></SelectItem>
                    <SelectItem value="Urgent"><div className="flex items-center gap-2"><Badge className="bg-amber-100 text-amber-800">Urgent</Badge><span className="text-xs text-muted-foreground">Priority processing</span></div></SelectItem>
                    <SelectItem value="STAT"><div className="flex items-center gap-2"><Badge className="bg-rose-100 text-rose-800">STAT</Badge><span className="text-xs text-muted-foreground">Immediate - Emergency</span></div></SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Est. TAT</Label>
                <div className="h-10 px-3 py-2 border rounded-md text-sm text-muted-foreground bg-muted/50 flex items-center">
                  {newLabOrder.priority === 'STAT' ? '30 min - 1 hour' : newLabOrder.priority === 'Urgent' ? '1 - 2 hours' : '2 - 4 hours'}
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Clinical indication *</Label>
              <Textarea
                value={newLabOrder.notes}
                onChange={(e) => setNewLabOrder({ ...newLabOrder, notes: e.target.value })}
                placeholder="Reason for test and instructions for the lab. If you selected Other, write the exact test / panel / send-out details here."
                rows={3}
              />
            </div>
            {newLabOrder.priority === 'STAT' && (
              <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800">
                <p className="text-sm text-rose-700 dark:text-rose-300 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" />
                  STAT orders are for emergencies only. Lab will prioritize immediately.
                </p>
              </div>
            )}
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => {
              setShowAddLabOrder(false);
              setSelectedLabTemplates(new Set());
              setLabTemplateSearch("");
              setShowLabTemplateDropdown(false);
            }}>
              Cancel
            </Button>
            <Button 
              onClick={addLabOrder} 
              disabled={selectedLabTemplates.size === 0} 
              className="bg-amber-500 hover:bg-amber-600"
            >
              <TestTube className="h-4 w-4 mr-2" />
              Add to order
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showAddNursingOrder} onOpenChange={(next) => {
        setShowAddNursingOrder(next);
        if (!next) {
          setInjectionMedicationSearch("");
          setShowInjectionMedicationDropdown(false);
          setInjectionMedicationResults([]);
          setInjectionSelectedIds(new Set());
          setInjectionConfigs(new Map());
        }
      }}>
        <DialogContent className={MODAL_SIZES.ml}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Syringe className="h-5 w-5 text-cyan-500" />
              Add Nursing Order
            </DialogTitle>
            <DialogDescription>
              Add nursing procedure to order - will be sent to Nursing queue
            </DialogDescription>
          </DialogHeader>
          
          {/* Allergy Warning in Dialog */}
          {currentPatient?.allergies && currentPatient.allergies.length > 0 && (
            <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
              <div className="flex items-center gap-2 text-red-700 dark:text-red-400 text-sm">
                <AlertTriangle className="h-4 w-4" />
                <span><strong>Allergies:</strong> {currentPatient.allergies.join(', ')}</span>
              </div>
            </div>
          )}
          
          <div className="space-y-4 py-2">
            {/* Procedure Type */}
            <div className="space-y-2">
              <Label>Procedure Type *</Label>
              <Select 
                value={newNursingOrder.type} 
                onValueChange={(v) => {
                  setNewNursingOrder({ ...newNursingOrder, type: v, medication: "", dosage: "", woundLocation: "", woundType: "", ward: "", admissionDiagnoses: [], presentingComplaint: "" });
                  setInjectionSelectedIds(new Set());
                  setInjectionConfigs(new Map());
                  setInjectionMedicationSearch("");
                  setShowInjectionMedicationDropdown(false);
                }}
              >
                <SelectTrigger><SelectValue placeholder="Select procedure type" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Injection">
                    <div className="flex items-center gap-2">
                      <Syringe className="h-4 w-4 text-rose-500" />
                      Injection
                    </div>
                  </SelectItem>
                  <SelectItem value="Dressing">
                    <div className="flex items-center gap-2">
                      <Activity className="h-4 w-4 text-amber-500" />
                      Wound Dressing
                    </div>
                  </SelectItem>
                  <SelectItem value="Observation Admission">
                    <div className="flex items-center gap-2">
                      <DoorOpen className="h-4 w-4 text-blue-500" />
                      Observation Admission (Day Care)
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Observation admission-specific fields */}
            {newNursingOrder.type === 'Observation Admission' && (
              <>
                <div className="space-y-2">
                  <Label>Observation Ward *</Label>
                  <Select
                    value={newNursingOrder.ward || ''}
                    onValueChange={(v) => setNewNursingOrder({ ...newNursingOrder, ward: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select ward for observation" />
                    </SelectTrigger>
                    <SelectContent className="max-h-[280px]">
                      {wards
                        .filter((ward) => ward.available_beds > 0)
                        .sort((a, b) => b.available_beds - a.available_beds)
                        .map((ward) => (
                          <SelectItem key={ward.id} value={String(ward.id)}>
                            <div className="flex items-center justify-between w-full">
                              <span className="font-medium">{ward.name}</span>
                              <span className={`text-xs px-2 py-1 rounded ${
                                ward.available_beds > ward.total_beds * 0.5 ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' :
                                ward.available_beds > ward.total_beds * 0.2 ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400' :
                                'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                              }`}>
                                {ward.available_beds}/{ward.total_beds} beds
                              </span>
                            </div>
                          </SelectItem>
                        ))}
                      {wards.filter((ward) => ward.available_beds > 0).length === 0 ? (
                        <div className="px-2 py-2 text-xs text-muted-foreground">
                          No wards with available beds right now.
                        </div>
                      ) : null}
                    </SelectContent>
                  </Select>
                </div>
                <Icd10DiagnosisMultiPicker
                  diagnoses={newNursingOrder.admissionDiagnoses}
                  onChange={(admissionDiagnoses) =>
                    setNewNursingOrder({ ...newNursingOrder, admissionDiagnoses })
                  }
                />
                <div className="space-y-2">
                  <Label>Presenting Complaint *</Label>
                  <Textarea
                    value={newNursingOrder.presentingComplaint || ''}
                    onChange={(e) => setNewNursingOrder({ ...newNursingOrder, presentingComplaint: e.target.value })}
                    placeholder="Patient's presenting complaint"
                    rows={2}
                  />
                </div>
              </>
            )}

            {/* Injection-specific fields */}
            {newNursingOrder.type === 'Injection' && (
              <>
                <MedicationGenericPicker
                  active={showAddNursingOrder}
                  label="Search and Select Medications *"
                  placeholder="Search generics by name, active ingredient, category..."
                  selectedKeys={Array.from(injectionSelectedIds).map((id) => `g:${id}`)}
                  selectedGenerics={selectedInjectionGenerics}
                  onToggle={toggleInjectionMedication}
                  onClearAll={() => {
                    setInjectionSelectedIds(new Set());
                    setInjectionConfigs(new Map());
                  }}
                  selectionStyle="checkbox"
                  selectedLabel="Selected medications"
                />

                {injectionSelectedIds.size > 0 && (
                  <MedicationSelectionConfigList
                    selectedIds={Array.from(injectionSelectedIds)}
                    getMedication={(id) => selectedInjectionGenerics.get(`g:${id}`)}
                    configs={injectionConfigs as Map<string, MedicationSelectionConfig>}
                    onUpdateConfig={(id, patch) => {
                      setInjectionConfigs((prev) => {
                        const next = new Map(prev);
                        const current = (next.get(id) || {
                          dose: '',
                          doseUnit: 'vial',
                          frequency: 'Once daily (OD)',
                          durationDays: '',
                          route: DEFAULT_INJECTION_ROUTE,
                          instructions: '',
                        }) as MedicationSelectionConfig;
                        next.set(id, { ...current, ...patch });
                        return next;
                      });
                    }}
                    onRemove={(id) => {
                      setInjectionSelectedIds((prev) => {
                        const next = new Set(prev);
                        next.delete(id);
                        return next;
                      });
                      setInjectionConfigs((prev) => {
                        const next = new Map(prev);
                        next.delete(id);
                        return next;
                      });
                    }}
                    doseUnitOptions={PROCEDURE_DOSE_UNITS}
                    routeOptions={INJECTION_ROUTES}
                  />
                )}
              </>
            )}

            {/* Dressing-specific fields */}
            {newNursingOrder.type === 'Dressing' && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Wound Type *</Label>
                    <Select value={newNursingOrder.woundType} onValueChange={(v) => setNewNursingOrder({ ...newNursingOrder, woundType: v })}>
                      <SelectTrigger><SelectValue placeholder="Select wound type" /></SelectTrigger>
                      <SelectContent>
                        {woundTypes.map(type => (
                          <SelectItem key={type} value={type}>{type}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Location *</Label>
                    <Select
                      value={newNursingOrder.woundLocation}
                      onValueChange={(v) => setNewNursingOrder({ ...newNursingOrder, woundLocation: v })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select location" />
                      </SelectTrigger>
                      <SelectContent className="max-h-[280px]">
                        {woundLocations.map((loc) => (
                          <SelectItem key={loc} value={loc}>
                            {loc}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </>
            )}

            {/* Priority */}
            <div className="space-y-2">
              <Label>Priority</Label>
              <Select value={newNursingOrder.priority} onValueChange={(v) => setNewNursingOrder({ ...newNursingOrder, priority: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Routine">
                    <div className="flex items-center gap-2">
                      <Badge className="bg-blue-100 text-blue-800">Routine</Badge>
                    </div>
                  </SelectItem>
                  <SelectItem value="Urgent">
                    <div className="flex items-center gap-2">
                      <Badge className="bg-amber-100 text-amber-800">Urgent</Badge>
                    </div>
                  </SelectItem>
                  <SelectItem value="STAT">
                    <div className="flex items-center gap-2">
                      <Badge className="bg-red-100 text-red-800">STAT</Badge>
                      <span className="text-xs text-muted-foreground">Immediate</span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            {/* Instructions */}
            <div className="space-y-2">
              <Label>Instructions *</Label>
              <Textarea 
                value={newNursingOrder.instructions} 
                onChange={(e) => setNewNursingOrder({ ...newNursingOrder, instructions: e.target.value })} 
                placeholder="Detailed instructions for the nursing team..."
                rows={3}
              />
            </div>

            {/* STAT Warning */}
            {newNursingOrder.priority === 'STAT' && (
              <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                <p className="text-sm text-red-700 dark:text-red-300 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" />
                  STAT orders require immediate attention from the nursing team.
                </p>
              </div>
            )}
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setShowAddNursingOrder(false);
              setInjectionMedicationSearch("");
              setShowInjectionMedicationDropdown(false);
              setInjectionMedicationResults([]);
              setInjectionSelectedIds(new Set());
              setInjectionConfigs(new Map());
            }}>Cancel</Button>
            <Button 
              onClick={addNursingOrder}
              disabled={
                !newNursingOrder.type ||
                !newNursingOrder.instructions ||
                (newNursingOrder.type === 'Injection' && !newNursingOrder.medication && injectionSelectedIds.size === 0) ||
                (newNursingOrder.type === 'Dressing' && (!newNursingOrder.woundLocation || !newNursingOrder.woundType)) ||
                (newNursingOrder.type === 'Observation Admission' && (!newNursingOrder.ward || validateOrderDiagnoses(newNursingOrder.admissionDiagnoses) !== null || !newNursingOrder.presentingComplaint))
              }
              className="bg-cyan-600 hover:bg-cyan-700"
            >
              <Syringe className="h-4 w-4 mr-2" />
              Add to Order
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Radiology Order Dialog */}
      <Dialog
        open={showAddRadiology}
        onOpenChange={(open) => {
          setShowAddRadiology(open);
          if (!open) {
            setSelectedRadiologyTemplates(new Set());
            setSelectedRadiologyTemplateDetails(new Map());
            setRadiologyTemplateSearch('');
            setShowRadiologyTemplateDropdown(false);
          }
        }}
      >
        <DialogContent className={MODAL_SIZES.ml}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ScanLine className="h-5 w-5 text-indigo-500" />
              Order Imaging Study
            </DialogTitle>
            <DialogDescription>
              Search and select templates (including <strong>Other</strong> when the study is not listed). Put the exact examination details in <strong>clinical indication</strong> for radiology.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-2">
            {/* Radiology Template Selection */}
            <TemplateCatalogMultiSelect
              label="Search and Select Imaging Studies *"
              placeholder="Search imaging studies by name, code, or modality (try “Other”)…"
              searchValue={radiologyTemplateSearch}
              onSearchChange={(value) => {
                setRadiologyTemplateSearch(value);
                setShowRadiologyTemplateDropdown(!!value.trim());
              }}
              showDropdown={showRadiologyTemplateDropdown}
              onSearchFocus={() => {
                if (radiologyTemplateSearch.trim()) setShowRadiologyTemplateDropdown(true);
              }}
              dropdownRef={radiologyTemplateDropdownContainerRef}
              loading={loadingRadiologyTemplates}
              loadingText="Loading templates..."
              emptyText={radiologyTemplatesError || 'No templates match. Try another search.'}
              items={roomRadiologyDropdownList}
              selectedIds={selectedRadiologyTemplates}
              selectedDetails={selectedRadiologyTemplateDetails}
              pinnedTemplate={otherRadiologyPinnedTemplate}
              onToggle={toggleRadiologyTemplateSelection}
              onClearAll={() => setSelectedRadiologyTemplates(new Set())}
              selectedLabel="Selected Studies"
              isOtherTemplate={(template) =>
                (template.code || '').toUpperCase() === RAD_OTHER_TEMPLATE_CODE
              }
              renderMeta={(template) => (
                <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1 flex-wrap">
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                    {template.code}
                  </Badge>
                  <span>{template.category}</span>
                  <span>•</span>
                  <span>{template.body_part || 'N/A'}</span>
                  {template.radiation_exposure === 'high' && (
                    <Badge variant="outline" className="text-[9px] px-1 py-0 text-amber-600">
                      High Rad
                    </Badge>
                  )}
                </div>
              )}
            />

            {/* Priority and LMP */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Priority</Label>
                <Select value={newRadiology.priority} onValueChange={(v) => setNewRadiology({ ...newRadiology, priority: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Routine"><Badge className="bg-blue-100 text-blue-800">Routine</Badge></SelectItem>
                    <SelectItem value="Urgent"><Badge className="bg-amber-100 text-amber-800">Urgent</Badge></SelectItem>
                    <SelectItem value="STAT"><Badge className="bg-red-100 text-red-800">STAT</Badge></SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>LMP</Label>
                <Input
                  type="date"
                  value={newRadiology.lmp}
                  onChange={(e) => setNewRadiology({ ...newRadiology, lmp: e.target.value })}
                />
              </div>
            </div>

            {/* Clinical Indication */}
            <div className="space-y-2">
              <Label>Clinical indication *</Label>
              <Textarea 
                value={newRadiology.clinicalIndication}
                onChange={(e) => setNewRadiology({ ...newRadiology, clinicalIndication: e.target.value })}
                placeholder="Reason for imaging and instructions for radiology. If you selected Other, include exact study, region, modality, and clinical question."
                rows={3}
              />
            </div>

            {/* Provisional Diagnosis */}
            <div className="space-y-2">
              <Label>Provisional Diagnosis</Label>
              <Textarea 
                value={newRadiology.provisionalDiagnosis}
                onChange={(e) => setNewRadiology({ ...newRadiology, provisionalDiagnosis: e.target.value })}
                placeholder="Provisional diagnosis..."
                rows={2}
              />
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddRadiology(false)}>Cancel</Button>
            <Button 
              onClick={addRadiologyOrder}
              disabled={selectedRadiologyTemplates.size === 0 || !newRadiology.clinicalIndication}
              className="bg-indigo-600 hover:bg-indigo-700"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add {selectedRadiologyTemplates.size > 0 ? `(${selectedRadiologyTemplates.size}) ` : ''}to Order
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add/Edit Physiotherapy Order Dialog */}
      <Dialog open={showAddPhysio} onOpenChange={(open) => {
        setShowAddPhysio(open);
        if (!open) {
          setEditingPhysioIndex(null);
          setNewPhysio({ historyClinicalFindings: "", diagnoses: [], drugHistory: "", specialInstructions: "", priority: "normal" });
        }
      }}>
        <DialogContent className={MODAL_SIZES.md}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-emerald-500" />
              {editingPhysioIndex !== null ? 'Edit Physiotherapy Order' : 'Order Physiotherapy'}
            </DialogTitle>
            <DialogDescription>
              {editingPhysioIndex !== null 
                ? 'Update the physiotherapy treatment order details'
                : 'Create a physiotherapy treatment order - will be sent to Physiotherapy pool queue. Choose diagnosis type, search ICD-10, and add one or more diagnoses.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Diagnosis */}
            <div className="space-y-2">
              <Label>History/Clinical Findings</Label>
              <Textarea
                value={newPhysio.historyClinicalFindings}
                onChange={(e) => setNewPhysio({ ...newPhysio, historyClinicalFindings: e.target.value })}
                placeholder="Patient's medical history and clinical findings..."
                rows={3}
              />
            </div>

            <Icd10DiagnosisMultiPicker
              diagnoses={newPhysio.diagnoses}
              onChange={(diagnoses) => setNewPhysio({ ...newPhysio, diagnoses })}
            />

            <div className="space-y-2">
              <Label>Drug History</Label>
              <Textarea
                value={newPhysio.drugHistory}
                onChange={(e) => setNewPhysio({ ...newPhysio, drugHistory: e.target.value })}
                placeholder="Current medications, allergies, and drug history..."
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <Label>Priority</Label>
              <Select value={newPhysio.priority} onValueChange={(v) => setNewPhysio({ ...newPhysio, priority: v as 'low' | 'normal' | 'high' | 'urgent' })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Special Instructions</Label>
              <Textarea
                value={newPhysio.specialInstructions}
                onChange={(e) => setNewPhysio({ ...newPhysio, specialInstructions: e.target.value })}
                placeholder="Any special requirements, contraindications, or notes for physiotherapist..."
                rows={2}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddPhysio(false)}>Cancel</Button>
            <Button
              onClick={addPhysioOrder}
              disabled={validateOrderDiagnoses(newPhysio.diagnoses) !== null}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {editingPhysioIndex !== null ? (
                <>
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Update Order
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Physiotherapy Order
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add/Edit Eye Care Order Dialog */}
      <Dialog open={showAddEye} onOpenChange={(open) => {
        setShowAddEye(open);
        if (!open) {
          setEditingEyeIndex(null);
          setNewEye({
            chiefComplaint: "",
            diagnoses: [],
            treatmentPlan: "",
            specialInstructions: "",
            visualAcuityOd: "",
            visualAcuityOs: "",
            visualAcuityOu: "",
            priority: "normal",
          });
        }
      }}>
        <DialogContent className={MODAL_SIZES.md}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5 text-cyan-500" />
              {editingEyeIndex !== null ? 'Edit Eye Care Order' : 'Order Eye Care'}
            </DialogTitle>
            <DialogDescription>
              {editingEyeIndex !== null
                ? 'Update the eye care order details'
                : 'Create an eye care evaluation order - will be sent to Eye Care pool queue. Choose diagnosis type, search ICD-10, and add one or more diagnoses.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Chief Complaint</Label>
              <Textarea
                value={newEye.chiefComplaint}
                onChange={(e) => setNewEye({ ...newEye, chiefComplaint: e.target.value })}
                placeholder="Patient's chief complaint and reason for eye evaluation..."
                rows={3}
              />
            </div>

            {currentPatient?.visitType === 'annual_checkup' ? (
              <div className="space-y-2 rounded-md border border-cyan-200 bg-cyan-50/50 dark:border-cyan-900 dark:bg-cyan-950/20 p-3">
                <Label>Snellen visual acuity (annual screening)</Label>
                <p className="text-xs text-muted-foreground">
                  Annual check-up only — enter at least one value to complete the vision checklist item.
                </p>
                <div className="grid grid-cols-3 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">VA OD (right)</Label>
                    <Input
                      value={newEye.visualAcuityOd}
                      onChange={(e) => setNewEye({ ...newEye, visualAcuityOd: e.target.value })}
                      placeholder="e.g. 6/6"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">VA OS (left)</Label>
                    <Input
                      value={newEye.visualAcuityOs}
                      onChange={(e) => setNewEye({ ...newEye, visualAcuityOs: e.target.value })}
                      placeholder="e.g. 6/6"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">VA OU (both)</Label>
                    <Input
                      value={newEye.visualAcuityOu}
                      onChange={(e) => setNewEye({ ...newEye, visualAcuityOu: e.target.value })}
                      placeholder="e.g. 6/6"
                    />
                  </div>
                </div>
              </div>
            ) : null}

            <Icd10DiagnosisMultiPicker
              diagnoses={newEye.diagnoses}
              onChange={(diagnoses) => setNewEye({ ...newEye, diagnoses })}
            />

            <div className="space-y-2">
              <Label>Treatment Plan</Label>
              <Textarea
                value={newEye.treatmentPlan}
                onChange={(e) => setNewEye({ ...newEye, treatmentPlan: e.target.value })}
                placeholder="Proposed treatment plan or evaluation goals..."
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <Label>Priority</Label>
              <Select value={newEye.priority} onValueChange={(v) => setNewEye({ ...newEye, priority: v as 'low' | 'normal' | 'high' | 'urgent' })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Special Instructions</Label>
              <Textarea
                value={newEye.specialInstructions}
                onChange={(e) => setNewEye({ ...newEye, specialInstructions: e.target.value })}
                placeholder="Any special requirements, contraindications, or notes for eye care provider..."
                rows={2}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddEye(false)}>Cancel</Button>
            <Button
              onClick={addEyeOrder}
              disabled={validateOrderDiagnoses(newEye.diagnoses) !== null}
              className="bg-cyan-600 hover:bg-cyan-700"
            >
              {editingEyeIndex !== null ? (
                <>
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Update Order
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Eye Care Order
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Referral Dialog */}
      <Dialog open={showAddReferral} onOpenChange={setShowAddReferral}>
        <DialogContent className={MODAL_SIZES.ml}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Send className="h-5 w-5 text-teal-500" />
              Create Referral
            </DialogTitle>
            <DialogDescription>
              Refer {currentPatient?.name} to a specialist or facility
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-2">
            {/* Specialty and Facility */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Specialty *</Label>
                <Select value={newReferral.specialty} onValueChange={(v) => setNewReferral({ ...newReferral, specialty: v })}>
                  <SelectTrigger><SelectValue placeholder="Select specialty" /></SelectTrigger>
                  <SelectContent className="max-h-[250px]">
                    {referralSpecialties.map(spec => (
                      <SelectItem key={spec} value={spec}>{spec}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Priority</Label>
                <Select value={newReferral.priority} onValueChange={(v) => setNewReferral({ ...newReferral, priority: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Routine"><Badge className="bg-blue-100 text-blue-800">Routine</Badge></SelectItem>
                    <SelectItem value="Urgent"><Badge className="bg-amber-100 text-amber-800">Urgent</Badge></SelectItem>
                    <SelectItem value="STAT"><Badge className="bg-red-100 text-red-800">STAT</Badge></SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Facility Selection */}
            <div className="space-y-2">
              <Label>Referral Facility *</Label>
              <FacilityPartnerSelect
                showLabel={false}
                value={{
                  partnerId: newReferral.facility_partner,
                  facility: newReferral.facility,
                  facility_type: newReferral.facilityType || 'internal',
                }}
                onChange={(next) =>
                  setNewReferral({
                    ...newReferral,
                    facility: next.facility,
                    facility_partner: next.partnerId,
                    facilityType: next.facility_type,
                  })
                }
              />
              {newReferral.facilityType && (
                <Badge
                  variant="outline"
                  className={
                    newReferral.facilityType === 'external'
                      ? 'bg-orange-100 text-orange-800'
                      : newReferral.facilityType === 'specialist'
                      ? 'bg-purple-100 text-purple-800'
                      : 'bg-teal-100 text-teal-800'
                  }
                >
                  {newReferral.facilityType.charAt(0).toUpperCase() +
                    newReferral.facilityType.slice(1)}{' '}
                  Referral
                </Badge>
              )}
            </div>

            {/* Reason for Referral */}
            <div className="space-y-2">
              <Label>Reason for Referral *</Label>
              <Select value={newReferral.reason} onValueChange={(v) => setNewReferral({ ...newReferral, reason: v })}>
                <SelectTrigger><SelectValue placeholder="Select reason" /></SelectTrigger>
                <SelectContent>
                  {referralReasons.map(reason => (
                    <SelectItem key={reason} value={reason}>{reason}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Clinical Indication */}
            <div className="space-y-2">
              <Label>Clinical Indication *</Label>
              <Textarea 
                value={newReferral.clinicalSummary}
                onChange={(e) => setNewReferral({ ...newReferral, clinicalSummary: e.target.value })}
                placeholder="Brief summary of patient's condition, relevant history, and reason for referral..."
                rows={3}
              />
            </div>

            {/* Contact Information (Optional) */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Contact Person (Optional)</Label>
                <Input 
                  value={newReferral.contactPerson}
                  onChange={(e) => setNewReferral({ ...newReferral, contactPerson: e.target.value })}
                  placeholder="Dr. / Nurse name"
                />
              </div>
              <div className="space-y-2">
                <Label>Contact Phone (Optional)</Label>
                <Input 
                  value={newReferral.contactPhone}
                  onChange={(e) => setNewReferral({ ...newReferral, contactPhone: e.target.value })}
                  placeholder="e.g., 08012345678"
                />
              </div>
            </div>

            {newReferral.priority === 'STAT' && (
              <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                <p className="text-sm text-red-700 dark:text-red-300 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" />
                  Emergency referrals require immediate coordination with the receiving facility
                </p>
              </div>
            )}
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddReferral(false)}>Cancel</Button>
            <Button 
              onClick={addReferral}
              disabled={!newReferral.specialty || !newReferral.facility || !newReferral.reason}
              className="bg-teal-600 hover:bg-teal-700"
            >
              <Send className="h-4 w-4 mr-2" />
              Add to Order
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </>
  );
}
