import type { PrescriptionOrderSubmitInput } from '@/components/consultation/orders/PrescriptionOrderModal';
import { normalizePrescriptionDoseUnit } from '@/lib/pharmacy/infer-dose-unit';
import { formatOrderDiagnoses, type OrderDiagnosisEntry } from '@/lib/consultation/order-diagnoses';

export type PrescriptionDraft = {
  id: string;
  prescriptionId?: number;
  medication: string;
  genericId?: number;
  brandMedicationId?: number;
  medicationId?: number;
  genericName: string;
  unit?: string;
  strength?: string;
  form?: string;
  dose?: string;
  dosage: string;
  frequency: string;
  duration: string;
  quantity: number;
  route: string;
  instructions: string;
  priority: string;
  status: 'Draft' | 'Sent to Pharmacy' | 'Processing' | 'Partially Dispensed' | 'Dispensed' | 'Cancelled';
};

export function buildPrescriptionDrafts(
  payload: PrescriptionOrderSubmitInput,
  createdAtMs: number = Date.now(),
): { drafts: PrescriptionDraft[]; rejectedLabels: string[] } {
  const drafts: PrescriptionDraft[] = [];
  const rejectedLabels: string[] = [];

  payload.items.forEach((item, index) => {
    const genericPk =
      typeof item.generic === 'number' && Number.isFinite(item.generic) && item.generic > 0
        ? item.generic
        : null;
    if (!genericPk) {
      rejectedLabels.push(item.medication_name || `item #${index + 1}`);
      return;
    }
    const unit = normalizePrescriptionDoseUnit(item.unit, item.dosage_form);
    const doseValue = (item.dosage || '').trim();
    const normalizedDose = doseValue ? `${doseValue} ${unit}`.trim() : `1 ${unit}`.trim();

    drafts.push({
      id: `RX-${createdAtMs}-${genericPk}-${index}`,
      medication: item.medication_name || 'Medication',
      genericId: genericPk,
      brandMedicationId: undefined,
      medicationId: genericPk,
      genericName: item.medication_name || 'Medication',
      unit,
      strength: item.strength || '',
      form: item.dosage_form || '',
      dose: normalizedDose,
      dosage: normalizedDose,
      frequency: item.frequency || 'Once daily (OD)',
      duration: item.duration || 'As directed',
      quantity: item.quantity || 1,
      route: item.route || 'Oral',
      instructions: (item.instructions || payload.clinicalIndication || '').trim(),
      priority: payload.priority,
      status: 'Draft',
    });
  });

  return { drafts, rejectedLabels };
}

export function slugLabCodeFromName(name: string): string {
  return (
    (name || '')
      .trim()
      .substring(0, 24)
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '_')
      .replace(/^_|_$/g, '') || 'LAB'
  );
}

export type InjectionMedicationLike = {
  id: number | string;
  name?: string;
  strength?: string;
  dosage_form?: string;
};

export type InjectionConfigLike = {
  dose?: string;
  doseUnit?: string;
  frequency?: string;
  durationDays?: number | '';
  instructions?: string;
  route?: string;
};

export function buildInjectionOrderSummary(args: {
  selectedIds: Set<string>;
  medications: InjectionMedicationLike[];
  configs: Map<string, InjectionConfigLike>;
  fallbackRoute?: string;
  fallbackInstructions?: string;
}): { medication?: string; dosage?: string; route?: string; instructions: string } {
  const { selectedIds, medications, configs, fallbackRoute, fallbackInstructions } = args;

  if (!selectedIds || selectedIds.size === 0) {
    return {
      medication: undefined,
      dosage: undefined,
      route: fallbackRoute,
      instructions: fallbackInstructions || '',
    };
  }

  const selectedMeds = medications.filter((m) => selectedIds.has(String(m.id)));
  const medication = selectedMeds
    .map((m) => {
      const name = m.name || '';
      const strength = (m.strength || '').toString().trim();
      const dosageForm = (m.dosage_form || '').toString().trim();
      if (strength && dosageForm) return `${name} (${strength}, ${dosageForm})`;
      if (strength) return `${name} (${strength})`;
      if (dosageForm) return `${name} (${dosageForm})`;
      return name;
    })
    .join(' + ');

  const doses: string[] = [];
  const freqParts: string[] = [];
  const durParts: string[] = [];
  const instrParts: string[] = [];

  // Preserve insertion order of selectedIds set (matches UI selection order well enough).
  Array.from(selectedIds).forEach((id) => {
    const cfg = configs.get(id);
    if (!cfg) return;
    const doseText = cfg.dose ? `${cfg.dose} ${cfg.doseUnit || ''}`.trim() : '';
    if (doseText) doses.push(doseText);
    if (cfg.frequency) freqParts.push(cfg.frequency);
    if (cfg.durationDays !== '' && cfg.durationDays != null) durParts.push(`${cfg.durationDays} days`);
    if (cfg.instructions?.trim()) instrParts.push(cfg.instructions.trim());
  });

  const dosage = doses.join(' + ') || undefined;
  const lastId = Array.from(selectedIds).pop();
  const lastRoute = lastId ? configs.get(lastId)?.route : undefined;
  const route = lastRoute || fallbackRoute;
  const combinedInstr = [
    ...instrParts,
    ...(durParts.length ? [`Duration: ${durParts.join(', ')}`] : []),
    ...(freqParts.length ? [`Frequency: ${freqParts.join(', ')}`] : []),
  ]
    .filter(Boolean)
    .join('. ');

  return {
    medication: medication || undefined,
    dosage,
    route,
    instructions: combinedInstr || fallbackInstructions || '',
  };
}

export type LabTemplateLike = {
  id: number | string;
  name: string;
  code?: string;
  sample_type?: string;
};

export type LabDraftOrder = {
  id: string;
  test: string;
  testId: number | string;
  code?: string;
  sampleType: string;
  priority: string;
  notes: string;
  status: 'Draft';
};

export function buildLabDraftOrders(args: {
  selectedTemplateIds: Set<number>;
  labTemplates: LabTemplateLike[];
  otherPinnedTemplate: LabTemplateLike | null;
  otherTemplateCode: string;
  otherClinicalNotes: string;
  priority: string;
  createdAtMs?: number;
}): { orders: LabDraftOrder[]; error?: string } {
  const {
    selectedTemplateIds,
    labTemplates,
    otherPinnedTemplate,
    otherTemplateCode,
    otherClinicalNotes,
    priority,
    createdAtMs = Date.now(),
  } = args;

  const selectedTemplates = Array.from(selectedTemplateIds)
    .map((id) => {
      const fromCatalog = labTemplates.find((t) => t.id === id);
      if (fromCatalog) return fromCatalog;
      if (otherPinnedTemplate && otherPinnedTemplate.id === id) return otherPinnedTemplate;
      return null;
    })
    .filter((t): t is LabTemplateLike => !!t);

  const hasOther = selectedTemplates.some(
    (t) => (t.code || '').toUpperCase() === otherTemplateCode,
  );

  if (hasOther && !String(otherClinicalNotes || '').trim()) {
    return {
      orders: [],
      error:
        'Clinical indication is required when you select "Other". Describe the exact test for the laboratory.',
    };
  }

  const orders: LabDraftOrder[] = selectedTemplates.map((template) => ({
    id: `LAB-${createdAtMs}-${template.id}`,
    test: template.name,
    testId: template.id,
    code: template.code,
    sampleType: template.sample_type || 'Blood',
    priority,
    notes: otherClinicalNotes,
    status: 'Draft',
  }));

  return { orders };
}

export type RadiologyTemplateLike = {
  id: number | string;
  name: string;
  code?: string;
  modality?: string;
  category?: string;
  body_part?: string;
};

export type RadiologyDraftOrder = {
  id: string;
  procedure: string;
  templateId?: number | string;
  category: string;
  bodyPart: string;
  clinicalIndication: string;
  priority: string;
  provisionalDiagnosis?: string;
  lmp?: string;
  status: 'Draft';
};

export function buildRadiologyDraftOrders(args: {
  selectedTemplateIds: Set<number>;
  radiologyTemplates: RadiologyTemplateLike[];
  otherPinnedTemplate: RadiologyTemplateLike | null;
  otherTemplateCode: string;
  clinicalIndication: string;
  otherClinicalIndicationMinLen?: number;
  priority: string;
  provisionalDiagnosis?: string;
  lmp?: string;
  createdAtMs?: number;
}): { orders: RadiologyDraftOrder[]; error?: string } {
  const {
    selectedTemplateIds,
    radiologyTemplates,
    otherPinnedTemplate,
    otherTemplateCode,
    clinicalIndication,
    otherClinicalIndicationMinLen = 8,
    priority,
    provisionalDiagnosis,
    lmp,
    createdAtMs = Date.now(),
  } = args;

  const selectedTemplates = Array.from(selectedTemplateIds)
    .map((templateId) => {
      const fromCatalog = radiologyTemplates.find((t) => t.id === templateId);
      if (fromCatalog) return fromCatalog;
      if (otherPinnedTemplate && otherPinnedTemplate.id === templateId) return otherPinnedTemplate;
      return null;
    })
    .filter((t): t is RadiologyTemplateLike => !!t);

  const hasOther = selectedTemplates.some(
    (t) => (t.code || '').toUpperCase() === otherTemplateCode,
  );

  if (hasOther && clinicalIndication.trim().length < otherClinicalIndicationMinLen) {
    return {
      orders: [],
      error:
        'You selected "Other". Add more detail in clinical indication (exact study, region, modality, clinical question).',
    };
  }

  const orders: RadiologyDraftOrder[] = selectedTemplates.map((template) => ({
    id: `RAD-${template.id}-${createdAtMs}`,
    procedure: template.name,
    templateId: template.id,
    category: template.modality || template.category || '',
    bodyPart: template.body_part || '',
    clinicalIndication,
    priority,
    provisionalDiagnosis: provisionalDiagnosis || undefined,
    lmp: lmp || undefined,
    status: 'Draft',
  }));

  return { orders };
}

export function pickHighestPriority<T extends string>(
  values: T[],
  rank: Record<string, number>,
  fallback: T,
): T {
  if (!Array.isArray(values) || values.length === 0) return fallback;
  return values.reduce<T>((best, value) => {
    const currentRank = rank[value] ?? Number.MAX_SAFE_INTEGER;
    const bestRank = rank[best] ?? Number.MAX_SAFE_INTEGER;
    return currentRank < bestRank ? value : best;
  }, fallback);
}

export function mapConsultationPriorityToOrderPriority(
  value: string,
): 'routine' | 'urgent' | 'stat' {
  const normalized = (value || '').trim().toLowerCase();
  if (normalized === 'stat') return 'stat';
  if (normalized === 'urgent') return 'urgent';
  return 'routine';
}

export type LabSendDraftLike = {
  id: string;
  test: string;
  testId?: number | string;
  code?: string;
  sampleType?: string;
  priority: string;
  notes?: string;
};

export type LabOrderPayload = {
  priority: 'routine' | 'urgent' | 'stat';
  clinical_notes?: string;
  tests_data: Array<{
    name: string;
    code: string;
    sample_type: string;
    template: number | string | null;
    status: 'pending';
    notes: string;
  }>;
};

export function buildLabOrderPayloadFromDrafts(
  draftOrders: LabSendDraftLike[],
): LabOrderPayload {
  const priorityOrder: Record<string, number> = { STAT: 0, Urgent: 1, Routine: 2 };
  const selectedPriority = pickHighestPriority(
    draftOrders.map((o) => o.priority),
    priorityOrder,
    'Routine',
  );
  const combinedNotes = draftOrders
    .map((o) => (o.notes || '').trim())
    .filter(Boolean)
    .join('; ');

  return {
    priority: mapConsultationPriorityToOrderPriority(selectedPriority),
    clinical_notes: combinedNotes || undefined,
    tests_data: draftOrders.map((order) => ({
      name: order.test,
      code: order.code || slugLabCodeFromName(order.test),
      sample_type: order.sampleType || 'Blood',
      template: order.testId != null ? order.testId : null,
      status: 'pending',
      notes: order.notes || '',
    })),
  };
}

export type RadiologySendDraftLike = {
  id: string;
  procedure: string;
  templateId?: number | string;
  category?: string;
  bodyPart?: string;
  clinicalIndication?: string;
  priority: string;
  provisionalDiagnosis?: string;
  lmp?: string;
};

export type RadiologyTemplateResolutionLike = {
  id?: number | string;
  name?: string;
  modality?: string;
  body_part?: string;
};

export type RadiologyOrderPayload = {
  priority: 'routine' | 'urgent' | 'stat';
  clinical_notes: string;
  provisional_diagnosis?: string;
  lmp?: string;
  studies_data: Array<{
    procedure: string;
    body_part: string;
    modality: string;
    status: 'pending';
    template?: number | string;
  }>;
};

export function buildRadiologyOrderPayloadFromDrafts(
  draftOrders: RadiologySendDraftLike[],
  templates: RadiologyTemplateResolutionLike[],
): RadiologyOrderPayload {
  const priorityOrder: Record<string, number> = { STAT: 0, Urgent: 1, Routine: 2 };
  const selectedPriority = pickHighestPriority(
    draftOrders.map((o) => o.priority),
    priorityOrder,
    'Routine',
  );

  const combinedClinicalNotes =
    draftOrders.find((o) => (o.clinicalIndication || '').trim())?.clinicalIndication || '';
  const combinedProvisionalDiagnosis =
    draftOrders.find((o) => (o.provisionalDiagnosis || '').trim())?.provisionalDiagnosis || '';
  const combinedLmp = draftOrders.find((o) => (o.lmp || '').trim())?.lmp || '';

  const studies_data = draftOrders.map((order) => {
    const template =
      order.templateId != null
        ? templates.find((t) => t.id === order.templateId)
        : templates.find((t) => t.name === order.procedure);
    const studyData: {
      procedure: string;
      body_part: string;
      modality: string;
      status: 'pending';
      template?: number | string;
    } = {
      procedure: order.procedure,
      body_part: (template?.body_part as string) || order.bodyPart || '',
      modality: (template?.modality as string) || order.category || 'X-Ray',
      status: 'pending',
    };
    const tid = order.templateId ?? template?.id;
    if (tid != null) studyData.template = tid;
    return studyData;
  });

  return {
    priority: mapConsultationPriorityToOrderPriority(selectedPriority),
    clinical_notes: combinedClinicalNotes,
    provisional_diagnosis: combinedProvisionalDiagnosis || undefined,
    lmp: combinedLmp || undefined,
    studies_data,
  };
}

export type PhysioEyeDraftPriority = 'low' | 'normal' | 'high' | 'urgent';

export const PHYSIO_EYE_DRAFT_PRIORITY_RANK: Record<PhysioEyeDraftPriority, number> = {
  urgent: 0,
  high: 1,
  normal: 2,
  low: 3,
};

export function mapEyeDraftPriorityToApiPriority(
  priority: string,
): 'routine' | 'urgent' | 'stat' {
  const normalized = (priority || '').trim().toLowerCase();
  if (normalized === 'stat') return 'stat';
  if (normalized === 'urgent' || normalized === 'high') return 'urgent';
  return 'routine';
}

export function pickEyeBatchApiPriority(
  priorities: string[],
): 'routine' | 'urgent' | 'stat' {
  const highest = pickHighestPriority(
    priorities as PhysioEyeDraftPriority[],
    PHYSIO_EYE_DRAFT_PRIORITY_RANK,
    'normal',
  );
  return mapEyeDraftPriorityToApiPriority(highest);
}

export type PhysioSendDraftLike = {
  historyClinicalFindings: string;
  diagnoses?: OrderDiagnosisEntry[];
  diagnosis?: string;
  drugHistory: string;
  specialInstructions?: string;
  priority: string;
};

function resolveOrderDiagnosisText(order: {
  diagnoses?: OrderDiagnosisEntry[];
  diagnosis?: string;
}): string {
  if (order.diagnoses?.length) return formatOrderDiagnoses(order.diagnoses);
  return (order.diagnosis || '').trim();
}

export type PhysioCreateOrderPayload = {
  patient: number;
  visit?: number;
  history_clinical_findings: string;
  diagnosis: string;
  drug_history: string;
  special_instructions?: string;
  priority: string;
  consultation_session: number;
  referral_source: 'doctor';
};

export type PhysioEyeOrderContext = {
  patientId: number;
  visitId?: number | null;
  sessionId: number;
};

function resolveVisitIdForOrderPayload(
  visitId?: number | null,
): number | undefined {
  return visitId != null && !Number.isNaN(visitId) ? visitId : undefined;
}

export function buildPhysioCreateOrderPayloads(
  draftOrders: PhysioSendDraftLike[],
  context: PhysioEyeOrderContext,
): PhysioCreateOrderPayload[] {
  const visit = resolveVisitIdForOrderPayload(context.visitId);
  return draftOrders.map((order) => ({
    patient: context.patientId,
    visit,
    history_clinical_findings: order.historyClinicalFindings,
    diagnosis: resolveOrderDiagnosisText(order),
    drug_history: order.drugHistory,
    special_instructions: order.specialInstructions || undefined,
    priority: order.priority,
    consultation_session: context.sessionId,
    referral_source: 'doctor',
  }));
}

export type EyeSendDraftLike = {
  chiefComplaint: string;
  diagnoses?: OrderDiagnosisEntry[];
  diagnosis?: string;
  treatmentPlan: string;
  specialInstructions?: string;
  visualAcuityOd?: string;
  visualAcuityOs?: string;
  visualAcuityOu?: string;
  priority: string;
};

export type EyeCreateOrderPayload = {
  patient: number;
  visit?: number;
  chief_complaint: string;
  diagnosis: string;
  treatment_plan: string;
  special_instructions?: string;
  visual_acuity_od?: string;
  visual_acuity_os?: string;
  visual_acuity_ou?: string;
  priority: 'routine' | 'urgent' | 'stat';
  consultation_session: number;
};

export function buildEyeCreateOrderPayloads(
  draftOrders: EyeSendDraftLike[],
  context: PhysioEyeOrderContext,
): EyeCreateOrderPayload[] {
  const batchPriority = pickEyeBatchApiPriority(draftOrders.map((o) => o.priority));
  const visit = resolveVisitIdForOrderPayload(context.visitId);
  return draftOrders.map((order) => ({
    patient: context.patientId,
    visit,
    chief_complaint: order.chiefComplaint,
    diagnosis: resolveOrderDiagnosisText(order),
    treatment_plan: order.treatmentPlan,
    special_instructions: order.specialInstructions || undefined,
    visual_acuity_od: order.visualAcuityOd || undefined,
    visual_acuity_os: order.visualAcuityOs || undefined,
    visual_acuity_ou: order.visualAcuityOu || undefined,
    priority: batchPriority,
    consultation_session: context.sessionId,
  }));
}

