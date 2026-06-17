import { describe, expect, it } from 'vitest';
import {
  transformLabTestStatus,
  transformToBackendStatus,
  transformPriority,
  transformToBackendPriority,
  transformProcessingMethod,
  transformToBackendProcessingMethod,
} from './transformers';

describe('transformLabTestStatus', () => {
  it('maps all known statuses', () => {
    expect(transformLabTestStatus('pending')).toBe('Pending');
    expect(transformLabTestStatus('sample_collected')).toBe('Sample Collected');
    expect(transformLabTestStatus('processing')).toBe('Processing');
    expect(transformLabTestStatus('results_ready')).toBe('Results Ready');
    expect(transformLabTestStatus('rejected')).toBe('Rejected');
    expect(transformLabTestStatus('verified')).toBe('Verified');
  });

  it('passes through unknown statuses', () => {
    expect(transformLabTestStatus('custom_status')).toBe('custom_status');
  });
});

describe('transformToBackendStatus', () => {
  it('maps known display statuses to backend', () => {
    expect(transformToBackendStatus('Pending')).toBe('pending');
    expect(transformToBackendStatus('Sample Collected')).toBe('sample_collected');
    expect(transformToBackendStatus('Results Ready')).toBe('results_ready');
  });

  it('lowercases and underscores unknown statuses', () => {
    expect(transformToBackendStatus('My Custom Status')).toBe('my_custom_status');
  });
});

describe('transformPriority', () => {
  it('maps all known priorities', () => {
    expect(transformPriority('routine')).toBe('Routine');
    expect(transformPriority('urgent')).toBe('Urgent');
    expect(transformPriority('stat')).toBe('STAT');
  });

  it('passes through unknown', () => {
    expect(transformPriority('emergency')).toBe('emergency');
  });
});

describe('transformToBackendPriority', () => {
  it('maps known display priorities', () => {
    expect(transformToBackendPriority('Routine')).toBe('routine');
    expect(transformToBackendPriority('Urgent')).toBe('urgent');
    expect(transformToBackendPriority('STAT')).toBe('stat');
  });

  it('lowercases unknown', () => {
    expect(transformToBackendPriority('Emergency')).toBe('emergency');
  });
});

describe('transformProcessingMethod', () => {
  it('maps known methods', () => {
    expect(transformProcessingMethod('in_house')).toBe('In-house');
    expect(transformProcessingMethod('outsourced')).toBe('Outsourced');
  });

  it('passes through unknown', () => {
    expect(transformProcessingMethod('referral')).toBe('referral');
  });
});

describe('transformToBackendProcessingMethod', () => {
  it('maps known display methods', () => {
    expect(transformToBackendProcessingMethod('In-house')).toBe('in_house');
    expect(transformToBackendProcessingMethod('Outsourced')).toBe('outsourced');
  });

  it('lowercases and underscores unknown', () => {
    expect(transformToBackendProcessingMethod('Third Party Lab')).toBe('third_party_lab');
  });
});
