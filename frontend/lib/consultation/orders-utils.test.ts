import { describe, expect, it } from 'vitest';
import {
  buildInjectionOrderSummary,
  buildPrescriptionDrafts,
  buildLabDraftOrders,
  buildLabOrderPayloadFromDrafts,
  buildRadiologyOrderPayloadFromDrafts,
  mapConsultationPriorityToOrderPriority,
  pickHighestPriority,
  buildRadiologyDraftOrders,
  slugLabCodeFromName,
  buildPhysioCreateOrderPayloads,
  buildEyeCreateOrderPayloads,
  mapEyeDraftPriorityToApiPriority,
  pickEyeBatchApiPriority,
} from './orders-utils';

describe('slugLabCodeFromName', () => {
  it('uppercases and normalizes to underscore codes', () => {
    expect(slugLabCodeFromName('Full blood count')).toBe('FULL_BLOOD_COUNT');
    expect(slugLabCodeFromName('  urinalysis   (routine)  ')).toBe('URINALYSIS_ROUTINE');
  });

  it('defaults to LAB when empty after normalization', () => {
    expect(slugLabCodeFromName('   ')).toBe('LAB');
    expect(slugLabCodeFromName('@@@')).toBe('LAB');
  });
});

describe('buildPrescriptionDrafts', () => {
  it('builds draft ids deterministically with createdAtMs', () => {
    const payload = {
      priority: 'Routine',
      clinicalIndication: 'Fever',
      items: [
        {
          generic: 12,
          medication_name: 'Paracetamol',
          dosage: '1',
          frequency: 'Once daily (OD)',
          duration: '3 days',
          quantity: 3,
          unit: 'tablet',
        },
      ],
    } as const;

    const { drafts, rejectedLabels } = buildPrescriptionDrafts(payload as any, 123);
    expect(rejectedLabels).toEqual([]);
    expect(drafts).toHaveLength(1);
    expect(drafts[0].id).toBe('RX-123-12-0');
    expect(drafts[0].dosage).toBe('1 tablet');
    expect(drafts[0].instructions).toBe('Fever');
    expect(drafts[0].status).toBe('Draft');
  });

  it('rejects items without valid generic', () => {
    const payload = {
      priority: 'Routine',
      clinicalIndication: '',
      items: [
        {
          generic: 0,
          medication_name: 'Bad',
          dosage: '',
          frequency: '',
          duration: '',
          quantity: 1,
          unit: 'tablet',
        },
      ],
    } as const;

    const { drafts, rejectedLabels } = buildPrescriptionDrafts(payload as any, 1);
    expect(drafts).toEqual([]);
    expect(rejectedLabels).toEqual(['Bad']);
  });
});

describe('buildInjectionOrderSummary', () => {
  it('builds medication label + combined instructions', () => {
    const selectedIds = new Set(['1', '2']);
    const medications = [
      { id: 1, name: 'Ceftriaxone', strength: '1g', dosage_form: 'vial' },
      { id: 2, name: 'Water for injection', strength: '10ml', dosage_form: 'ampoule' },
    ];
    const configs = new Map([
      [
        '1',
        {
          dose: '1',
          doseUnit: 'vial',
          frequency: 'Daily',
          durationDays: 3,
          instructions: 'Slow IV',
          route: 'IV',
        },
      ],
      ['2', { dose: '1', doseUnit: 'ampoule', instructions: 'Dilute', route: 'IV' }],
    ]);

    const out = buildInjectionOrderSummary({
      selectedIds,
      medications,
      configs,
      fallbackRoute: 'IM',
      fallbackInstructions: '',
    });
    expect(out.medication).toContain('Ceftriaxone (1g, vial)');
    expect(out.medication).toContain(' + ');
    expect(out.dosage).toBe('1 vial + 1 ampoule');
    expect(out.route).toBe('IV');
    expect(out.instructions).toContain('Slow IV');
    expect(out.instructions).toContain('Duration: 3 days');
    expect(out.instructions).toContain('Frequency: Daily');
  });

  it('returns fallbacks when nothing selected', () => {
    const out = buildInjectionOrderSummary({
      selectedIds: new Set(),
      medications: [],
      configs: new Map(),
      fallbackRoute: 'IM',
      fallbackInstructions: 'Use aseptic technique',
    });
    expect(out.medication).toBeUndefined();
    expect(out.dosage).toBeUndefined();
    expect(out.route).toBe('IM');
    expect(out.instructions).toBe('Use aseptic technique');
  });
});

describe('buildLabDraftOrders', () => {
  it('rejects Other when clinical notes are empty', () => {
    const { orders, error } = buildLabDraftOrders({
      selectedTemplateIds: new Set([1]),
      labTemplates: [{ id: 1, name: 'Other', code: 'OTHER', sample_type: 'Blood' }],
      otherPinnedTemplate: null,
      otherTemplateCode: 'OTHER',
      otherClinicalNotes: '',
      priority: 'Routine',
      createdAtMs: 1,
    });
    expect(orders).toEqual([]);
    expect(error).toBe(
      'Clinical indication is required when you select "Other". Describe the exact test for the laboratory.',
    );
  });

  it('builds lab draft orders and attaches notes', () => {
    const { orders, error } = buildLabDraftOrders({
      selectedTemplateIds: new Set([1, 2]),
      labTemplates: [
        { id: 1, name: 'Glucose', code: 'GLU', sample_type: 'Blood' },
        { id: 2, name: 'Other test', code: 'OTHER', sample_type: 'Serum' },
      ],
      otherPinnedTemplate: null,
      otherTemplateCode: 'OTHER',
      otherClinicalNotes: 'Exact test details',
      priority: 'Urgent',
      createdAtMs: 99,
    });
    expect(error).toBeUndefined();
    expect(orders).toHaveLength(2);
    expect(orders[0].id).toBe('LAB-99-1');
    expect(orders[0].notes).toBe('Exact test details');
    expect(orders[1].sampleType).toBe('Serum');
  });
});

describe('buildRadiologyDraftOrders', () => {
  it('rejects Other when clinical indication too short', () => {
    const { orders, error } = buildRadiologyDraftOrders({
      selectedTemplateIds: new Set([1]),
      radiologyTemplates: [{ id: 1, name: 'Other study', code: 'RAD-OTHER' }],
      otherPinnedTemplate: null,
      otherTemplateCode: 'RAD-OTHER',
      clinicalIndication: 'short',
      otherClinicalIndicationMinLen: 8,
      priority: 'Routine',
      createdAtMs: 5,
    });

    expect(orders).toEqual([]);
    expect(error).toBe(
      'You selected "Other". Add more detail in clinical indication (exact study, region, modality, clinical question).',
    );
  });

  it('builds radiology draft orders for pinned Other with enough indication', () => {
    const out = buildRadiologyDraftOrders({
      selectedTemplateIds: new Set([99]),
      radiologyTemplates: [],
      otherPinnedTemplate: { id: 99, name: 'Other study', code: 'RAD-OTHER', modality: 'CT' },
      otherTemplateCode: 'RAD-OTHER',
      clinicalIndication: 'Exact region and modality details',
      priority: 'Urgent',
      provisionalDiagnosis: 'Pneumonia',
      lmp: undefined,
      createdAtMs: 2,
    });

    expect(out.error).toBeUndefined();
    expect(out.orders).toHaveLength(1);
    expect(out.orders[0].id).toBe('RAD-99-2');
    expect(out.orders[0].procedure).toBe('Other study');
    expect(out.orders[0].category).toBe('CT');
    expect(out.orders[0].provisionalDiagnosis).toBe('Pneumonia');
    expect(out.orders[0].status).toBe('Draft');
  });
});

describe('pickHighestPriority', () => {
  it('returns highest ranked value among inputs', () => {
    const rank = { STAT: 0, Urgent: 1, Routine: 2 };
    const out = pickHighestPriority(['Routine', 'Urgent', 'Routine'], rank, 'Routine');
    expect(out).toBe('Urgent');
  });

  it('returns fallback on empty list', () => {
    const rank = { stat: 0, urgent: 1, routine: 2 };
    const out = pickHighestPriority<string>([], rank, 'routine');
    expect(out).toBe('routine');
  });
});

describe('mapConsultationPriorityToOrderPriority', () => {
  it('maps Routine/Urgent/STAT values', () => {
    expect(mapConsultationPriorityToOrderPriority('Routine')).toBe('routine');
    expect(mapConsultationPriorityToOrderPriority('Urgent')).toBe('urgent');
    expect(mapConsultationPriorityToOrderPriority('STAT')).toBe('stat');
    expect(mapConsultationPriorityToOrderPriority('unknown')).toBe('routine');
  });
});

describe('buildLabOrderPayloadFromDrafts', () => {
  it('builds payload with highest priority and fallback code', () => {
    const payload = buildLabOrderPayloadFromDrafts([
      {
        id: '1',
        test: 'Full blood count',
        testId: 11,
        priority: 'Routine',
        notes: 'first',
      },
      {
        id: '2',
        test: 'Random test name',
        priority: 'STAT',
        notes: '',
      },
    ]);
    expect(payload.priority).toBe('stat');
    expect(payload.clinical_notes).toBe('first');
    expect(payload.tests_data[0].code).toBe('FULL_BLOOD_COUNT');
    expect(payload.tests_data[1].code).toBe('RANDOM_TEST_NAME');
    expect(payload.tests_data[1].template).toBeNull();
  });
});

describe('buildRadiologyOrderPayloadFromDrafts', () => {
  it('builds studies using template fallback logic', () => {
    const payload = buildRadiologyOrderPayloadFromDrafts(
      [
        {
          id: 'r1',
          procedure: 'Chest X-Ray',
          templateId: 4,
          category: 'X-Ray',
          bodyPart: 'Chest',
          clinicalIndication: 'Persistent cough',
          priority: 'Urgent',
          provisionalDiagnosis: 'CAP',
        },
      ],
      [{ id: 4, name: 'Chest X-Ray', modality: 'X-Ray', body_part: 'Thorax' }],
    );

    expect(payload.priority).toBe('urgent');
    expect(payload.clinical_notes).toBe('Persistent cough');
    expect(payload.provisional_diagnosis).toBe('CAP');
    expect(payload.studies_data[0].template).toBe(4);
    expect(payload.studies_data[0].body_part).toBe('Thorax');
  });
});

describe('mapEyeDraftPriorityToApiPriority', () => {
  it('maps draft priorities to API values', () => {
    expect(mapEyeDraftPriorityToApiPriority('urgent')).toBe('urgent');
    expect(mapEyeDraftPriorityToApiPriority('high')).toBe('urgent');
    expect(mapEyeDraftPriorityToApiPriority('normal')).toBe('routine');
    expect(mapEyeDraftPriorityToApiPriority('low')).toBe('routine');
    expect(mapEyeDraftPriorityToApiPriority('stat')).toBe('stat');
  });
});

describe('pickEyeBatchApiPriority', () => {
  it('returns highest mapped API priority across drafts', () => {
    expect(pickEyeBatchApiPriority(['low', 'normal'])).toBe('routine');
    expect(pickEyeBatchApiPriority(['normal', 'high'])).toBe('urgent');
    expect(pickEyeBatchApiPriority(['low', 'urgent'])).toBe('urgent');
  });
});

describe('buildPhysioCreateOrderPayloads', () => {
  it('builds one API payload per draft with per-order priority', () => {
    const payloads = buildPhysioCreateOrderPayloads(
      [
        {
          historyClinicalFindings: 'Back pain',
          diagnosis: 'Lumbar strain',
          drugHistory: 'None',
          specialInstructions: 'Avoid heavy lifting',
          priority: 'high',
        },
        {
          historyClinicalFindings: '',
          diagnosis: 'Frozen shoulder',
          drugHistory: 'Ibuprofen',
          priority: 'normal',
        },
      ],
      { patientId: 42, visitId: 7, sessionId: 99 },
    );

    expect(payloads).toHaveLength(2);
    expect(payloads[0]).toMatchObject({
      patient: 42,
      visit: 7,
      history_clinical_findings: 'Back pain',
      diagnosis: 'Lumbar strain',
      drug_history: 'None',
      special_instructions: 'Avoid heavy lifting',
      priority: 'high',
      consultation_session: 99,
      referral_source: 'doctor',
    });
    expect(payloads[1].priority).toBe('normal');
    expect(payloads[1].special_instructions).toBeUndefined();
  });

  it('formats diagnoses array for API payload', () => {
    const payloads = buildPhysioCreateOrderPayloads(
      [
        {
          historyClinicalFindings: 'Back pain',
          diagnoses: [
            { type: 'Primary', code: 'M54.5', description: 'Low back pain' },
            { type: 'Secondary', code: 'M25.511', description: 'Pain in right shoulder' },
          ],
          drugHistory: 'None',
          priority: 'high',
        },
      ],
      { patientId: 42, visitId: 7, sessionId: 99 },
    );
    expect(payloads[0].diagnosis).toBe(
      '[Primary] M54.5 - Low back pain\n[Secondary] M25.511 - Pain in right shoulder',
    );
  });

  it('omits visit when visit id is invalid', () => {
    const payloads = buildPhysioCreateOrderPayloads(
      [{ historyClinicalFindings: '', diagnosis: 'Test', drugHistory: '', priority: 'low' }],
      { patientId: 1, visitId: Number.NaN, sessionId: 2 },
    );
    expect(payloads[0].visit).toBeUndefined();
  });
});

describe('buildEyeCreateOrderPayloads', () => {
  it('applies batch API priority to every draft order', () => {
    const payloads = buildEyeCreateOrderPayloads(
      [
        {
          chiefComplaint: 'Blurred vision',
          diagnosis: 'Myopia',
          treatmentPlan: 'Glasses',
          visualAcuityOd: '6/9',
          priority: 'normal',
        },
        {
          chiefComplaint: 'Eye pain',
          diagnosis: 'Uveitis',
          treatmentPlan: 'Steroid drops',
          priority: 'urgent',
        },
      ],
      { patientId: 10, visitId: null, sessionId: 55 },
    );

    expect(payloads).toHaveLength(2);
    expect(payloads[0].priority).toBe('urgent');
    expect(payloads[1].priority).toBe('urgent');
    expect(payloads[0]).toMatchObject({
      patient: 10,
      chief_complaint: 'Blurred vision',
      diagnosis: 'Myopia',
      treatment_plan: 'Glasses',
      visual_acuity_od: '6/9',
      consultation_session: 55,
    });
    expect(payloads[0].visit).toBeUndefined();
    expect(payloads[1].visual_acuity_od).toBeUndefined();
  });
});

