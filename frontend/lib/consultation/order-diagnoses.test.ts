import { describe, expect, it } from 'vitest';
import {
  formatOrderDiagnoses,
  getOrderDiagnosisSummary,
  parseOrderDiagnoses,
  validateOrderDiagnoses,
} from './order-diagnoses';

describe('order-diagnoses', () => {
  it('formats multiple diagnoses with types', () => {
    const formatted = formatOrderDiagnoses([
      { type: 'Primary', code: 'I10', description: 'Essential hypertension' },
      { type: 'Secondary', code: 'E11.9', description: 'Type 2 diabetes' },
    ]);
    expect(formatted).toContain('[Primary] I10 - Essential hypertension');
    expect(formatted).toContain('[Secondary] E11.9 - Type 2 diabetes');
  });

  it('round-trips parse and format', () => {
    const raw = '[Primary] M54.5 - Low back pain\n[Secondary] M25.511 - Pain in right shoulder';
    const entries = parseOrderDiagnoses(raw);
    expect(entries).toHaveLength(2);
    expect(formatOrderDiagnoses(entries)).toBe(raw);
  });

  it('parses legacy free-text as primary', () => {
    const entries = parseOrderDiagnoses('M54.5 - Low back pain');
    expect(entries[0]).toEqual({
      type: 'Primary',
      code: 'M54.5',
      description: 'Low back pain',
    });
  });

  it('parses inline multiple diagnoses on one line', () => {
    const raw =
      '[Primary] H52.1 - Myopia [Primary] A15.5 - Tuberculosis of larynx [Secondary] A00 - Cholera [Differential] A05 - Other bacterial foodborne intoxications';
    const entries = parseOrderDiagnoses(raw);
    expect(entries).toHaveLength(4);
    expect(entries[0]).toMatchObject({ type: 'Primary', code: 'H52.1', description: 'Myopia' });
    expect(entries[2]).toMatchObject({ type: 'Secondary', code: 'A00', description: 'Cholera' });
  });

  it('summarizes primary diagnosis for list cards', () => {
    const summary = getOrderDiagnosisSummary({
      diagnosisText:
        '[Primary] H52.1 - Myopia\n[Secondary] A00 - Cholera',
      fallbackTitle: 'Eye evaluation',
    });
    expect(summary.title).toBe('H52.1 — Myopia');
    expect(summary.extraCount).toBe(1);
  });

  it('requires at least one primary diagnosis', () => {
    expect(
      validateOrderDiagnoses([{ type: 'Secondary', code: 'E11.9', description: 'Diabetes' }]),
    ).toMatch(/Primary/);
    expect(
      validateOrderDiagnoses([{ type: 'Primary', code: 'I10', description: 'HTN' }]),
    ).toBeNull();
  });
});
