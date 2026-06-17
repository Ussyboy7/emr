import { describe, expect, it } from 'vitest';
import {
  formatPriority,
  formatRoomDate,
  formatRoomTime,
  initialsFromQueueDisplayName,
  joinPresentationComplaintLines,
  normalizeGenderLabel,
  parsePresentationComplaintValue,
  processVitals,
  splitPresentationComplaintLines,
} from './room-helpers';

describe('initialsFromQueueDisplayName', () => {
  it('skips honorifics for avatar initials', () => {
    expect(initialsFromQueueDisplayName('Mr EMENIKE Okafor')).toBe('EO');
  });

  it('uses first two letters of single name when no surname', () => {
    expect(initialsFromQueueDisplayName('Adebayo')).toBe('AD');
  });

  it('returns ? for empty input', () => {
    expect(initialsFromQueueDisplayName('   ')).toBe('?');
  });
});

describe('formatPriority', () => {
  it('maps stat and routine labels', () => {
    expect(formatPriority('stat')).toBe('STAT');
    expect(formatPriority('routine')).toBe('Routine');
    expect(formatPriority('urgent')).toBe('Urgent');
  });
});

describe('formatRoomDate and formatRoomTime', () => {
  it('returns N/A for missing values', () => {
    expect(formatRoomDate(undefined)).toBe('N/A');
    expect(formatRoomTime(undefined)).toBe('N/A');
  });
});

describe('presentation complaint helpers', () => {
  const optionSet = new Set(['headache', 'fever']);
  const optionLabelMap = new Map([
    ['headache', 'Headache'],
    ['fever', 'Fever'],
  ]);

  it('splits lines and strips carriage returns', () => {
    expect(splitPresentationComplaintLines('a\r\nb')).toEqual(['a', 'b']);
  });

  it('parses known options vs custom text', () => {
    const parsed = parsePresentationComplaintValue(
      'Headache\nCustom note here',
      optionLabelMap,
      optionSet,
    );
    expect(parsed.selected).toEqual(['Headache']);
    expect(parsed.customText).toBe('Custom note here');
  });

  it('joins selected options and custom lines', () => {
    expect(joinPresentationComplaintLines(['Headache'], 'Custom note')).toBe(
      'Headache\nCustom note',
    );
  });
});

describe('normalizeGenderLabel', () => {
  it('normalizes common gender codes', () => {
    expect(normalizeGenderLabel('male')).toBe('Male');
    expect(normalizeGenderLabel('F')).toBe('Female');
    expect(normalizeGenderLabel('')).toBe('');
  });
});

describe('processVitals', () => {
  it('formats blood pressure and numeric fields', () => {
    const result = processVitals({
      temperature: 36.7,
      blood_pressure_systolic: 120,
      blood_pressure_diastolic: 80,
      heart_rate: 72,
      respiratory_rate: 18,
      oxygen_saturation: 98,
      weight: 70,
      height: 175,
      bmi: 22.9,
      recorded_at: '2026-06-15T09:00:00Z',
    });
    expect(result?.bloodPressure).toBe('120/80');
    expect(result?.heartRate).toBe('72');
    expect(result?.temperature).toBe('36.7');
    expect(result?.bmi).toBe('22.9');
  });

  it('returns undefined for null input', () => {
    expect(processVitals(null)).toBeUndefined();
  });
});
