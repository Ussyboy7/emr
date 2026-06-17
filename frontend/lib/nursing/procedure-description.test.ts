import { describe, expect, it } from 'vitest';
import {
  formatCompletedProcedureDescription,
  parseProcedureDetails,
  resolveProcedureHistoryDetails,
} from './procedure-description';

describe('procedure-description', () => {
  it('parses consultation injection description', () => {
    const details = parseProcedureDetails(
      'injection',
      'Artesunate - 60mg via IM. Give slowly',
      'As ordered',
    );
    expect(details.medication).toBe('Artesunate');
    expect(details.dosage).toBe('60mg');
    expect(details.route).toBe('IM');
  });

  it('formats completed injection like consultation orders', () => {
    const text = formatCompletedProcedureDescription('injection', {
      medication: 'Artesunate',
      dosage: '60mg',
      route: 'IM',
      instructions: 'Give slowly',
    });
    expect(text).toContain('Artesunate - 60mg via IM');
  });

  it('prefers structured API fields in history', () => {
    const { details } = resolveProcedureHistoryDetails('injection', {
      description: 'Injection: wrong • Dose: bad',
      medication_name: 'Artesunate',
      dosage: '60mg',
      route: 'IM',
    });
    expect(details.medication).toBe('Artesunate');
    expect(details.dosage).toBe('60mg');
    expect(details.route).toBe('IM');
  });
});
