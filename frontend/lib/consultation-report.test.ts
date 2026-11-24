import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/services', () => ({ patientService: {} }));

import { buildConsultationReportHTML, type ConsultationReportSession } from './consultation-report';

const sessionWithStatus = (status: string): ConsultationReportSession => ({
  id: 1,
  patient_name: 'Jane Doe',
  status,
  started_at: '2026-11-24T09:00:00Z',
  ended_at: '2026-11-24T09:20:00Z',
});

describe('buildConsultationReportHTML status', () => {
  it('prints Completed for completed sessions', () => {
    expect(buildConsultationReportHTML(sessionWithStatus('completed'))).toContain(
      '<td>Completed</td>',
    );
  });

  it('prints Cancelled instead of In Progress', () => {
    const html = buildConsultationReportHTML(sessionWithStatus('cancelled'));
    expect(html).toContain('<td>Cancelled</td>');
    expect(html).not.toContain('In Progress');
  });

  it('prints Paused instead of In Progress', () => {
    const html = buildConsultationReportHTML(sessionWithStatus('paused'));
    expect(html).toContain('<td>Paused</td>');
    expect(html).not.toContain('In Progress');
  });
});
