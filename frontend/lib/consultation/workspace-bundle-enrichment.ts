/**
 * Map session workspace-bundle API payloads to display shapes used in the
 * consultation room, history viewer, and consultation report loader.
 */
import type { SessionWorkspaceBundle } from '@/lib/services/consultation-service';
import { buildOrderedLabResultViewRows } from '@/lib/laboratory/template-utils';
import { formatDisplayTime } from '@/lib/dates';

function formatLabResult(value: unknown, normalRange?: Record<string, any>): string {
  if (value == null || value === '') return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (typeof value !== 'object' || Array.isArray(value)) return String(value);

  const payload = value as Record<string, unknown>;
  if (!Object.keys(payload).length) return '';

  const rows = buildOrderedLabResultViewRows(payload as Record<string, any>, normalRange);
  if (!rows.length) return '';

  return rows
    .map((r) => {
      const unit = r.unit ? ` ${r.unit}` : '';
      const range = r.normalRange ? ` (${r.normalRange})` : '';
      return `${r.parameter}: ${r.value}${unit}${range}`.trim();
    })
    .join('\n');
}

function labTestHasResultFile(test: any): boolean {
  const rf = test?.result_file;
  if (rf != null && rf !== false) {
    if (typeof rf === 'string') {
      if (rf.trim().length > 0) return true;
    } else if (typeof rf === 'object' && rf) {
      if (typeof (rf as { url?: string }).url === 'string' && (rf as { url: string }).url.trim().length > 0) {
        return true;
      }
      return true;
    }
  }
  const attachments = test?.result_attachments || test?.reportAttachments;
  if (Array.isArray(attachments) && attachments.length > 0) return true;
  return false;
}

/** Text for lab tables in session viewer, PDF, and shared modal. */
export function summarizeLabTestForConsultationReport(test: any): string {
  const status = String(test?.status ?? '').toLowerCase();
  const norm = test?.template_normal_range || test?.template?.normal_range;
  const fromResults = formatLabResult(test?.results ?? test?.result ?? '', norm).trim();
  if (fromResults) return fromResults;
  if (labTestHasResultFile(test)) {
    return 'PDF report on file';
  }
  if (status === 'verified' || status === 'results_ready') {
    return 'Completed';
  }
  return '';
}

export type EnrichedSessionDisplayData = {
  prescriptions: Array<{
    id: string;
    medication: string;
    dosage: string;
    frequency: string;
    duration: string;
    quantity: number;
  }>;
  labOrders: Array<{
    id: string;
    test: string;
    status: string;
    priority: string;
    result: string;
    orderedBy: string;
    createdAt: string;
  }>;
  radiologyOrders: Array<{
    id: string;
    procedure: string;
    priority: string;
    status: string;
    finding: string;
    orderedBy: string;
    createdAt: string;
  }>;
  nursingOrders: Array<{
    id: string;
    type: string;
    instructions: string;
    status: string;
    priority: string;
    orderedBy: string;
    createdAt: string;
  }>;
  physioOrders: Array<{ diagnosis: string; priority: string; status: string }>;
  eyeOrders: Array<{ diagnosis: string; priority: string; status: string }>;
  diagnoses: Array<{
    id: string | number;
    code: string;
    name: string;
    type: string;
    notes: string;
    status?: string;
    certainty?: string;
    diagnosed_at?: string;
  }>;
  vitals: Record<string, string | number>;
};

function mapPrescriptions(results: unknown[]): EnrichedSessionDisplayData['prescriptions'] {
  return (results || []).flatMap((p: any) => {
    const items =
      p.medications && p.medications.length
        ? p.medications
        : p.medication_name || p.medication
          ? [p]
          : [];
    return items.map((m: any) => ({
      id: String(p.id) + (m.id != null ? `-${m.id}` : ''),
      medication:
        m.medication_name || m.medication?.name || p.medication_name || p.medication || 'Unknown',
      dosage: m.dose || m.dosage || p.dose || p.dosage || '',
      frequency: m.frequency || p.frequency || '',
      duration: m.duration || p.duration || '',
      quantity: m.quantity ?? p.quantity ?? 0,
    }));
  });
}

function mapLabOrders(results: unknown[]): EnrichedSessionDisplayData['labOrders'] {
  return (results || []).flatMap((order: any) => {
    const tests = order.tests || [];
    if (!tests.length) return [];
    return tests.map((test: any) => ({
      id: `LAB-${order.id}-${test.id}`,
      test: (test.name ?? test.test_name ?? test.template_name ?? '').toString().trim(),
      status: test.status ?? order.status ?? '',
      priority: order.priority ?? '',
      result: summarizeLabTestForConsultationReport(test),
      orderedBy: order.doctor_name ?? '',
      createdAt: test.created_at ?? order.ordered_at ?? '',
    }));
  });
}

function mapRadiologyOrders(results: unknown[]): EnrichedSessionDisplayData['radiologyOrders'] {
  return (results || []).flatMap((order: any) => {
    const studies = order.studies || [];
    if (studies.length) {
      return studies.map((s: any) => ({
        id: `RAD-${order.id}-${s.id}`,
        procedure: (s.procedure ?? order.procedure_name ?? order.procedure ?? '').toString().trim(),
        priority: order.priority ?? '',
        status: s.status ?? order.status ?? '',
        finding: (s.report ?? s.findings ?? s.impression ?? s.finding ?? order.finding ?? '')
          .toString()
          .trim(),
        orderedBy: order.doctor_name ?? '',
        createdAt: s.created_at ?? order.ordered_at ?? '',
      }));
    }
    const proc = (order.procedure_name ?? order.procedure ?? '').toString().trim();
    if (!proc) return [];
    return [
      {
        id: String(order.id),
        procedure: proc,
        priority: order.priority ?? '',
        status: order.status ?? '',
        finding: (order.report ?? order.findings ?? order.impression ?? order.finding ?? '')
          .toString()
          .trim(),
        orderedBy: order.doctor_name ?? '',
        createdAt: order.ordered_at ?? '',
      },
    ];
  });
}

function mapNursingOrders(results: unknown[]): EnrichedSessionDisplayData['nursingOrders'] {
  return (results || []).map((order: any) => ({
    id: String(order.id),
    type: order.order_type || order.type || 'General',
    instructions: order.instructions || '',
    status: order.status || 'pending',
    priority: order.priority === 'urgent' ? 'Urgent' : order.priority === 'high' ? 'High' : 'Medium',
    orderedBy: order.ordered_by_name || 'Unknown',
    createdAt: order.created_at || new Date().toISOString(),
  }));
}

function mapPhysioOrEyeOrders(results: unknown[]): Array<{ diagnosis: string; priority: string; status: string }> {
  return (results || []).map((o: any) => ({
    diagnosis: (o.diagnosis ?? o.chief_complaint ?? '').toString().trim(),
    priority: o.priority ?? '',
    status: o.status ?? '',
  }));
}

function mapDiagnoses(results: unknown[]): EnrichedSessionDisplayData['diagnoses'] {
  return (results || []).map((d: any) => ({
    id: d.id,
    code: d.icd10_code_details?.code || '',
    name: d.icd10_code_details?.description || d.diagnosis_text || '',
    type:
      d.certainty === 'confirmed'
        ? 'Primary'
        : d.certainty === 'probable'
          ? 'Secondary'
          : 'Differential',
    notes: d.notes || '',
    status: d.status,
    certainty: d.certainty,
    diagnosed_at: d.diagnosed_at,
  }));
}

/** Pick the latest vitals row, preferring one with a complete blood pressure reading. */
export function vitalsDisplayFromRecords(vitalsResults: unknown[]): Record<string, string | number> {
  const rows = [...(vitalsResults || [])].sort(
    (a: any, b: any) =>
      new Date(b.recorded_at || 0).getTime() - new Date(a.recorded_at || 0).getTime(),
  );
  const latest =
    (rows.find((v: any) => v.blood_pressure_systolic && v.blood_pressure_diastolic) as any) || (rows[0] as any);
  if (!latest) return {};
  return {
    temperature: latest.temperature || '',
    bloodPressure:
      latest.blood_pressure_systolic && latest.blood_pressure_diastolic
        ? `${latest.blood_pressure_systolic}/${latest.blood_pressure_diastolic}`
        : '',
    heartRate: latest.heart_rate || '',
    respiratoryRate: latest.respiratory_rate || '',
    oxygenSaturation: latest.oxygen_saturation || '',
    weight: latest.weight || '',
    height: latest.height || '',
    recordedAt: latest.recorded_at || '',
  };
}

export function enrichSessionDisplayFromWorkspaceBundle(
  bundle: SessionWorkspaceBundle,
  vitalsRows?: unknown[],
): EnrichedSessionDisplayData {
  const vitalsSource =
    vitalsRows && vitalsRows.length > 0 ? vitalsRows : bundle.vitals?.results || [];
  return {
    prescriptions: mapPrescriptions(bundle.prescriptions?.results || []),
    labOrders: mapLabOrders(bundle.lab_orders?.results || []),
    radiologyOrders: mapRadiologyOrders(bundle.radiology_orders?.results || []),
    nursingOrders: mapNursingOrders(bundle.nursing_orders?.results || []),
    physioOrders: mapPhysioOrEyeOrders(bundle.physio_orders?.results || []),
    eyeOrders: mapPhysioOrEyeOrders(bundle.eye_orders?.results || []),
    diagnoses: mapDiagnoses(bundle.diagnoses?.results || []),
    vitals: vitalsDisplayFromRecords(vitalsSource),
  };
}

/** Room editor state: prescriptions / lab / radiology / nursing order forms. */
export function transformBundleToRoomEditableOrders(bundle: SessionWorkspaceBundle) {
  const prescriptions = (bundle.prescriptions?.results || []).flatMap((rx: any) =>
    (rx.medications || []).map((item: any) => ({
      id: `RX-${rx.id}-${item.id}`,
      prescriptionId: rx.id,
      medication: item.medication?.name || item.medication_name || 'Unknown',
      genericId: item.generic ?? item.generic_id,
      brandMedicationId: item.medication?.id ?? item.medication_id,
      medicationId: item.generic ?? item.generic_id ?? item.medication?.id ?? item.medication_id,
      genericName: item.medication?.generic_name || item.generic_name || '',
      unit: item.unit || item.medication_details?.unit || 'tablet',
      strength: item.strength || item.medication_details?.strength || '',
      form: item.dosage_form || item.medication_details?.form || '',
      dosage: item.dose || item.dosage || '',
      frequency: item.frequency || '',
      duration: item.duration || '',
      quantity: item.quantity || 0,
      route: item.route || 'Oral',
      instructions: item.instructions || '',
      priority: item.priority || 'Routine',
      status:
        rx.status === 'dispensed'
          ? 'Dispensed'
          : rx.status === 'partially_dispensed'
            ? 'Partially Dispensed'
            : rx.status === 'cancelled'
              ? 'Cancelled'
              : rx.status === 'pending'
                ? 'Sent to Pharmacy'
                : 'Draft',
    })),
  );

  const labOrders: Array<{
    id: string;
    test: string;
    testId: unknown;
    code: unknown;
    sampleType: unknown;
    priority: string;
    notes: string;
    status: 'Sent to Lab';
  }> = [];
  (bundle.lab_orders?.results || []).forEach((order: any) => {
    (order.tests || []).forEach((test: any) => {
      labOrders.push({
        id: `LAB-${order.id}-${test.id}`,
        test: test.name || 'Unknown Test',
        testId: test.template,
        code: test.code,
        sampleType: test.sample_type,
        priority:
          order.priority === 'routine'
            ? 'Routine'
            : order.priority === 'urgent'
              ? 'Urgent'
              : 'STAT',
        notes: test.notes || order.clinical_notes || '',
        status: 'Sent to Lab',
      });
    });
  });

  const radiologyOrders: Array<{
    id: string;
    procedure: string;
    category: string;
    bodyPart: string;
    clinicalIndication: string;
    priority: string;
    provisionalDiagnosis?: string;
    lmp?: string;
    status: 'Sent to Radiology';
  }> = [];
  (bundle.radiology_orders?.results || []).forEach((order: any) => {
    (order.studies || []).forEach((study: any) => {
      radiologyOrders.push({
        id: `RAD-${order.id}-${study.id}`,
        procedure: study.procedure || 'Unknown Procedure',
        category: study.modality || 'X-Ray',
        bodyPart: study.body_part || '',
        clinicalIndication: order.clinical_notes || '',
        priority:
          order.priority === 'routine'
            ? 'Routine'
            : order.priority === 'urgent'
              ? 'Urgent'
              : 'STAT',
        provisionalDiagnosis: order.provisional_diagnosis || undefined,
        lmp: order.lmp || undefined,
        status: 'Sent to Radiology',
      });
    });
  });

  const nursingOrders: Array<{
    id: string;
    type: string;
    medication: string;
    dosage: string;
    route: string;
    woundLocation: string;
    woundType: string;
    instructions: string;
    priority: string;
    status: 'Sent to Nursing';
  }> = [];
  (bundle.nursing_orders?.results || []).forEach((order: any) => {
    nursingOrders.push({
      id: order.id.toString(),
      type: order.order_type || 'Injection',
      medication: order.description?.split(' - ')[1] || '',
      dosage: order.frequency || '',
      route: 'As ordered',
      woundLocation: '',
      woundType: '',
      instructions: order.description || '',
      priority:
        order.priority === 'medium' ? 'Routine' : order.priority === 'high' ? 'Urgent' : 'STAT',
      status: 'Sent to Nursing',
    });
  });

  return { prescriptions, labOrders, radiologyOrders, nursingOrders };
}

/** Workspace bundle slice used by ConsultationDetailModal and history edit flows. */
export type WorkspaceBundleLike = Pick<
  SessionWorkspaceBundle,
  'prescriptions' | 'lab_orders' | 'radiology_orders' | 'nursing_orders' | 'physio_orders' | 'vitals'
>;

function formatOrderPriority(priority: unknown): string {
  const s = String(priority ?? '').toLowerCase();
  if (s === 'stat') return 'STAT';
  if (s === 'urgent') return 'Urgent';
  if (s === 'routine') return 'Routine';
  return String(priority || 'Routine');
}

function filterOrdersBySessionTime<T extends { created_at?: string; createdAt?: string }>(
  orders: T[],
  sessionStart: Date | null | undefined,
  sessionEnd: Date | null | undefined,
): T[] {
  if (!sessionStart) return orders;
  const end = sessionEnd ?? new Date();
  return orders.filter((order) => {
    const orderDate = new Date(order.created_at || order.createdAt || '');
    return orderDate >= sessionStart && orderDate <= end;
  });
}

function mapPrescriptionsForConsultationDetail(
  results: unknown[],
  sessionStart?: Date | null,
  sessionEnd?: Date | null,
) {
  const filtered = filterOrdersBySessionTime((results || []) as Array<{ created_at?: string }>, sessionStart, sessionEnd);
  return filtered.map((p: any) => ({
    id: String(p.id),
    medication:
      p.medication_name ||
      (p.medication && typeof p.medication === 'object' && p.medication.name) ||
      (p.medication && typeof p.medication === 'string' && !/^\d+$/.test(p.medication) && p.medication) ||
      'Unknown',
    strength: p.strength || '',
    form: p.form || '',
    dosage: p.dosage || '',
    frequency: p.frequency || '',
    duration: p.duration || '',
    instructions: p.instructions || '',
  }));
}

function mapLabOrdersForConsultationDetail(
  results: unknown[],
  sessionStart?: Date | null,
  sessionEnd?: Date | null,
) {
  const filtered = filterOrdersBySessionTime((results || []) as LabOrderData[], sessionStart, sessionEnd);
  return filtered.flatMap((l: any) => {
    if (l.tests && Array.isArray(l.tests) && l.tests.length > 0) {
      return l.tests.map((test: any) => ({
        id: `LAB-${l.id}-${test.id}`,
        test: test.name || test.test_name || test.template?.name || 'Unknown Test',
        priority: formatOrderPriority(l.priority),
        instructions: test.notes || l.clinical_notes || '',
        status: test.status || 'pending',
        orderedBy: l.doctor_name || l.created_by_name || 'Unknown',
        createdAt: test.created_at || l.ordered_at || new Date().toISOString(),
        result: test.results ? summarizeLabTestForConsultationReport(test) : undefined,
      }));
    }
    const testName = l.test_name || l.test || l.name || 'Unknown Test';
    return [
      {
        id: String(l.id),
        test: testName,
        priority: formatOrderPriority(l.priority),
        instructions: l.clinical_notes || '',
        status: l.status || 'pending',
        orderedBy: l.doctor_name || l.created_by_name || 'Unknown',
        createdAt: l.ordered_at || l.created_at || new Date().toISOString(),
        result: undefined,
      },
    ];
  });
}

function mapRadiologyOrdersForConsultationDetail(
  results: unknown[],
  sessionStart?: Date | null,
  sessionEnd?: Date | null,
) {
  const filtered = filterOrdersBySessionTime((results || []) as any[], sessionStart, sessionEnd);
  return filtered.flatMap((r: any) => {
    if (r.studies && Array.isArray(r.studies) && r.studies.length > 0) {
      return r.studies.map((study: any) => ({
        id: `RAD-${r.id}-${study.id}`,
        study: study.procedure || study.study_type || study.name || 'Unknown Study',
        priority: formatOrderPriority(r.priority),
        instructions: study.technical_notes || r.clinical_notes || '',
        status: study.status || 'pending',
        orderedBy: r.doctor_name || r.created_by_name || 'Unknown',
        createdAt: study.created_at || r.ordered_at || new Date().toISOString(),
        result:
          study.report || study.findings
            ? `${study.findings || ''}\n${study.impression || ''}`.trim()
            : undefined,
      }));
    }
    return [
      {
        id: String(r.id),
        study: r.study_type || r.study || r.name || 'Unknown Study',
        priority: formatOrderPriority(r.priority),
        instructions: r.clinical_notes || '',
        status: r.status || 'pending',
        orderedBy: r.doctor_name || r.created_by_name || 'Unknown',
        createdAt: r.ordered_at || r.created_at || new Date().toISOString(),
      },
    ];
  });
}

function mapNursingOrdersForConsultationDetail(
  results: unknown[],
  sessionStart?: Date | null,
  sessionEnd?: Date | null,
) {
  const filtered = filterOrdersBySessionTime((results || []) as any[], sessionStart, sessionEnd);
  return filtered.map((n: any) => ({
    id: String(n.id),
    type: n.order_type || n.type || 'General',
    instructions: n.instructions || '',
    status: n.status || 'pending',
    priority:
      n.priority === 'urgent'
        ? 'Urgent'
        : n.priority === 'high'
          ? 'High'
          : n.priority === 'medium'
            ? 'Medium'
            : n.priority === 'low'
              ? 'Low'
              : String(n.priority || 'Medium'),
    orderedBy: n.ordered_by_name || 'Unknown',
    createdAt: n.created_at || new Date().toISOString(),
  }));
}

function mapPhysioOrdersForConsultationDetail(results: unknown[]) {
  return (results || []).map((o: any) => ({
    id: String(o.id),
    diagnosis: (o.diagnosis ?? o.chief_complaint ?? '').toString().trim(),
    chiefComplaint: o.chief_complaint ?? '',
    priority: formatOrderPriority(o.priority),
    status: o.status ?? 'pending',
  }));
}

function mapVitalsForConsultationDetail(results: unknown[]) {
  return (results || []).map((v: any) => {
    const temp = v.temperature
      ? typeof v.temperature === 'string'
        ? parseFloat(v.temperature)
        : Number(v.temperature)
      : null;
    const systolic =
      v.blood_pressure_systolic ||
      v.systolic ||
      (v.blood_pressure ? parseFloat(String(v.blood_pressure).split('/')[0]) : null) ||
      0;
    const diastolic =
      v.blood_pressure_diastolic ||
      v.diastolic ||
      (v.blood_pressure ? parseFloat(String(v.blood_pressure).split('/')[1]) : null) ||
      0;
    const weight = v.weight
      ? typeof v.weight === 'string'
        ? parseFloat(v.weight)
        : Number(v.weight)
      : null;
    const height = v.height
      ? typeof v.height === 'string'
        ? parseFloat(v.height)
        : Number(v.height)
      : null;
    const oxygenSat = v.oxygen_saturation
      ? typeof v.oxygen_saturation === 'string'
        ? parseFloat(v.oxygen_saturation)
        : Number(v.oxygen_saturation)
      : null;
    const bmiRaw = v.bmi != null && v.bmi !== '' ? Number(v.bmi) : NaN;
    const painRaw = v.pain_scale != null && v.pain_scale !== '' ? Number(v.pain_scale) : NaN;
    const bsRaw = v.blood_sugar != null && v.blood_sugar !== '' ? Number(v.blood_sugar) : NaN;
    const rbsRaw =
      v.random_blood_sugar != null && v.random_blood_sugar !== '' ? Number(v.random_blood_sugar) : NaN;

    return {
      id: String(v.id),
      systolic: systolic || 0,
      diastolic: diastolic || 0,
      heartRate: v.heart_rate || v.heartRate || 0,
      temperature: temp || 0,
      respiratoryRate: v.respiratory_rate || v.respiratoryRate || 0,
      weight: weight != null && !Number.isNaN(weight) ? weight : undefined,
      height: height != null && !Number.isNaN(height) ? height : undefined,
      oxygenSaturation: oxygenSat != null && !Number.isNaN(oxygenSat) ? oxygenSat : 0,
      bmi: !Number.isNaN(bmiRaw) ? bmiRaw : undefined,
      painScale: !Number.isNaN(painRaw) ? painRaw : undefined,
      bloodSugar: !Number.isNaN(bsRaw) ? bsRaw : undefined,
      randomBloodSugar: !Number.isNaN(rbsRaw) ? rbsRaw : undefined,
      comment: v.notes || v.comment || '',
      recordedBy:
        v.recorded_by_name ||
        (typeof v.recorded_by === 'object'
          ? v.recorded_by?.full_name || v.recorded_by?.username
          : v.recorded_by) ||
        'Unknown',
      date: v.recorded_at || v.created_at || new Date().toISOString(),
      time: formatDisplayTime(v.recorded_at) || '00:00',
    };
  });
}

type LabOrderData = { tests?: unknown[]; created_at?: string; [key: string]: unknown };

/** Map workspace bundle rows to ConsultationDetailModal list shapes (with optional session time filter). */
export function buildConsultationDetailOrdersFromBundle(
  bundle: WorkspaceBundleLike,
  options: {
    sessionStart?: Date | null;
    sessionEnd?: Date | null;
    vitalsOverride?: unknown[] | null;
  } = {},
) {
  const { sessionStart, sessionEnd, vitalsOverride } = options;
  const vitalsRows =
    vitalsOverride && vitalsOverride.length > 0
      ? vitalsOverride
      : bundle.vitals?.results || [];

  return {
    prescriptions: mapPrescriptionsForConsultationDetail(
      bundle.prescriptions?.results || [],
      sessionStart,
      sessionEnd,
    ),
    labOrders: mapLabOrdersForConsultationDetail(
      bundle.lab_orders?.results || [],
      sessionStart,
      sessionEnd,
    ),
    radiologyOrders: mapRadiologyOrdersForConsultationDetail(
      bundle.radiology_orders?.results || [],
      sessionStart,
      sessionEnd,
    ),
    nursingOrders: mapNursingOrdersForConsultationDetail(
      bundle.nursing_orders?.results || [],
      sessionStart,
      sessionEnd,
    ),
    physioOrders: mapPhysioOrdersForConsultationDetail(bundle.physio_orders?.results || []),
    vitals: mapVitalsForConsultationDetail(vitalsRows),
  };
}

/** Sync consultation history edit modal state from session + workspace bundle. */
export function extractSessionEditState(
  bundle: SessionWorkspaceBundle,
  session: {
    presentation_complaint?: string | null;
    history_of_presenting_illness?: string | null;
    physical_examination?: string | null;
    assessment?: string | null;
    plan?: string | null;
    status?: string;
  },
) {
  const enriched = enrichSessionDisplayFromWorkspaceBundle(bundle);
  const safeStr = (v: unknown): string => (v != null && typeof v === 'string' ? v : '');
  const diagnosisCodes = enriched.diagnoses.map((d) => ({
    id: String(d.id),
    code: d.code,
    name: d.name,
    type: d.type as 'Primary' | 'Secondary' | 'Differential',
    notes: d.notes,
  }));

  return {
    editPrescriptions: bundle.prescriptions.results || [],
    editLabOrders: bundle.lab_orders.results || [],
    editRadiologyOrders: bundle.radiology_orders.results || [],
    editPhysioOrders: bundle.physio_orders.results || [],
    editNursingOrders: bundle.nursing_orders.results || [],
    formPatch: {
      presentationComplaint: safeStr(session.presentation_complaint),
      historyOfPresentIllness: safeStr(session.history_of_presenting_illness),
      physicalExamination: safeStr(session.physical_examination),
      assessment: safeStr(session.assessment),
      plan: safeStr(session.plan),
      status: session.status === 'completed' ? ('Completed' as const) : ('In Progress' as const),
      diagnosisCodes,
    },
  };
}
