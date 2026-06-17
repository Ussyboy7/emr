import { describe, expect, it } from 'vitest';
import {
  parseDurationDays,
  parseDosageNumber,
  isRefillablePrescription,
  isRefillableLine,
  prescriptionItemToOrderInput,
  localDraftToOrderInput,
  apiPrescriptionLineToOrderInput,
  orderInputToCreateItem,
  prescriptionModalCopy,
  refillLineKey,
  getRefillablePrescriptions,
  orderInputsFromSelectedLines,
} from './prescription-refill';

describe('refillLineKey', () => {
  it('builds colon-separated key', () => {
    expect(refillLineKey(10, 5)).toBe('10:5');
  });
});

describe('parseDurationDays', () => {
  it('extracts number from "X days"', () => {
    expect(parseDurationDays('7 days')).toBe(7);
    expect(parseDurationDays('14 Day course')).toBe(14);
  });

  it('returns empty string for null/undefined', () => {
    expect(parseDurationDays(null)).toBe('');
    expect(parseDurationDays(undefined)).toBe('');
    expect(parseDurationDays('')).toBe('');
  });

  it('returns empty string when no day pattern found', () => {
    expect(parseDurationDays('As directed')).toBe('');
  });
});

describe('parseDosageNumber', () => {
  it('extracts leading number', () => {
    expect(parseDosageNumber('2.5 mg')).toBe('2.5');
    expect(parseDosageNumber('1 tablet')).toBe('1');
  });

  it('returns "1" for null', () => {
    expect(parseDosageNumber(null)).toBe('1');
  });

  it('returns full string when no leading number', () => {
    expect(parseDosageNumber('half tablet')).toBe('half tablet');
  });
});

describe('isRefillablePrescription', () => {
  it('returns false for cancelled', () => {
    expect(isRefillablePrescription({ status: 'cancelled' } as any)).toBe(false);
  });

  it('returns true for pending', () => {
    expect(isRefillablePrescription({ status: 'pending' } as any)).toBe(true);
  });

  it('returns true for dispensed', () => {
    expect(isRefillablePrescription({ status: 'dispensed' } as any)).toBe(true);
  });
});

describe('isRefillableLine', () => {
  const rx = {} as any;

  it('returns false for prescribing_record_only', () => {
    expect(isRefillableLine(rx, { prescribing_record_only: true, generic: 1 } as any)).toBe(false);
  });

  it('returns false for superseded line', () => {
    expect(isRefillableLine(rx, { superseded_at: '2024-01-01', generic: 1 } as any)).toBe(false);
  });

  it('returns false when no generic id', () => {
    expect(isRefillableLine(rx, { generic: null } as any)).toBe(false);
    expect(isRefillableLine(rx, { generic: 0 } as any)).toBe(false);
  });

  it('returns true for valid generic', () => {
    expect(isRefillableLine(rx, { generic: 42 } as any)).toBe(true);
  });

  it('falls back to generic_id field', () => {
    expect(isRefillableLine(rx, { generic: null, generic_id: 5 } as any)).toBe(true);
  });
});

describe('prescriptionItemToOrderInput', () => {
  it('returns null when no generic', () => {
    expect(prescriptionItemToOrderInput({ generic: null } as any)).toBeNull();
  });

  it('maps item to order input', () => {
    const result = prescriptionItemToOrderInput({
      generic: 10,
      medication_name: 'Amoxicillin',
      unit: 'Capsule',
      dose: '500mg',
      frequency: 'TDS',
      duration: '7 days',
      quantity: 21,
      route: 'Oral',
      instructions: 'After meals',
    } as any);
    expect(result).toBeTruthy();
    expect(result!.generic).toBe(10);
    expect(result!.unit).toBe('capsule');
    expect(result!.dosage).toBe('500');
    expect(result!.quantity).toBe(21);
  });

  it('defaults quantity to at least 1', () => {
    const result = prescriptionItemToOrderInput({
      generic: 1,
      quantity: 0,
    } as any);
    expect(result!.quantity).toBe(1);
  });
});

describe('localDraftToOrderInput', () => {
  it('returns null when no genericId or medicationId', () => {
    expect(localDraftToOrderInput({})).toBeNull();
    expect(localDraftToOrderInput({ genericId: 0 })).toBeNull();
  });

  it('maps local draft to order input', () => {
    const result = localDraftToOrderInput({
      genericId: 7,
      medication: 'Paracetamol',
      dosage: '1g',
      frequency: 'QID',
      duration: '3 days',
      quantity: 12,
    });
    expect(result).toBeTruthy();
    expect(result!.generic).toBe(7);
    expect(result!.dosage).toBe('1');
  });

  it('falls back to medicationId', () => {
    const result = localDraftToOrderInput({ medicationId: 15 });
    expect(result!.generic).toBe(15);
  });
});

describe('apiPrescriptionLineToOrderInput', () => {
  it('returns null when no valid generic', () => {
    expect(apiPrescriptionLineToOrderInput({ generic: null })).toBeNull();
    expect(apiPrescriptionLineToOrderInput({})).toBeNull();
  });

  it('maps api line fields', () => {
    const result = apiPrescriptionLineToOrderInput({
      generic: 3,
      medication_name: 'Ibuprofen',
      dose: '400mg',
      unit: 'Tablet',
      route: 'Oral',
      frequency: 'BD',
      duration: '5 days',
      quantity: 10,
    });
    expect(result!.generic).toBe(3);
    expect(result!.dosage).toBe('400');
  });
});

describe('orderInputToCreateItem', () => {
  it('returns null for invalid generic', () => {
    expect(orderInputToCreateItem({ generic: 0 } as any)).toBeNull();
    expect(orderInputToCreateItem({ generic: -1 } as any)).toBeNull();
    expect(orderInputToCreateItem({ generic: NaN } as any)).toBeNull();
  });

  it('maps order input to create payload', () => {
    const item = orderInputToCreateItem({
      generic: 5,
      medication_name: 'Drug A',
      dosage: '2',
      frequency: 'OD',
      duration: '7 days',
      quantity: 7,
      unit: 'tablet',
      route: 'Oral',
      instructions: 'With food',
    } as any);
    expect(item).toBeTruthy();
    expect(item!.generic).toBe(5);
    expect(item!.dose).toBe('2');
    expect(item!.dispensed_quantity).toBe(0);
    expect(item!.is_dispensed).toBe(false);
  });
});

describe('prescriptionModalCopy', () => {
  it('returns edit copy', () => {
    const copy = prescriptionModalCopy('edit');
    expect(copy.dialogTitle).toBe('Edit prescription');
    expect(copy.confirmLabel).toBe('Save changes');
  });

  it('returns refill copy', () => {
    const copy = prescriptionModalCopy('refill');
    expect(copy.dialogTitle).toBe('Review refill prescription');
    expect(copy.confirmLabel).toBeUndefined();
  });

  it('returns empty for add/null', () => {
    expect(prescriptionModalCopy('add')).toEqual({});
    expect(prescriptionModalCopy(null)).toEqual({});
  });
});

describe('getRefillablePrescriptions', () => {
  it('filters out cancelled and limits to 20', () => {
    const rxs = Array.from({ length: 25 }, (_, i) => ({
      id: i,
      status: i === 3 ? 'cancelled' : 'dispensed',
      prescribed_at: `2024-01-${String(i + 1).padStart(2, '0')}`,
      medications: [],
    }));
    const result = getRefillablePrescriptions(rxs as any);
    expect(result.every((r: any) => r.status !== 'cancelled')).toBe(true);
    expect(result.length).toBeLessThanOrEqual(20);
  });
});

describe('orderInputsFromSelectedLines', () => {
  it('collects selected refillable lines deduped by generic', () => {
    const prescriptions = [
      {
        id: 1,
        status: 'dispensed',
        medications: [
          { id: 10, generic: 100, quantity: 5 },
          { id: 11, generic: 200, quantity: 3 },
        ],
      },
    ] as any;
    const selected = new Set<`${number}:${number}`>(['1:10', '1:11']);
    const result = orderInputsFromSelectedLines(prescriptions, selected);
    expect(result).toHaveLength(2);
    expect(result[0].generic).toBe(100);
    expect(result[1].generic).toBe(200);
  });

  it('deduplicates by generic', () => {
    const prescriptions = [
      {
        id: 1, status: 'dispensed',
        medications: [{ id: 10, generic: 100, quantity: 5 }],
      },
      {
        id: 2, status: 'dispensed',
        medications: [{ id: 20, generic: 100, quantity: 3 }],
      },
    ] as any;
    const selected = new Set<`${number}:${number}`>(['1:10', '2:20']);
    const result = orderInputsFromSelectedLines(prescriptions, selected);
    expect(result).toHaveLength(1);
  });
});
