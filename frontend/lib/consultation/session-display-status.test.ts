import { describe, expect, it } from 'vitest';

import { consultationDisplayStatus } from './session-display-status';

describe('consultationDisplayStatus', () => {
  it('maps completed sessions to Completed', () => {
    expect(consultationDisplayStatus('completed')).toBe('Completed');
  });

  it('maps active sessions to In Progress', () => {
    expect(consultationDisplayStatus('active')).toBe('In Progress');
  });

  it('keeps paused sessions distinct from In Progress', () => {
    expect(consultationDisplayStatus('paused')).toBe('Paused');
  });

  it('keeps cancelled sessions distinct from In Progress', () => {
    expect(consultationDisplayStatus('cancelled')).toBe('Cancelled');
  });

  it('falls back to In Progress for missing or unknown statuses', () => {
    expect(consultationDisplayStatus(undefined)).toBe('In Progress');
    expect(consultationDisplayStatus('')).toBe('In Progress');
  });
});
