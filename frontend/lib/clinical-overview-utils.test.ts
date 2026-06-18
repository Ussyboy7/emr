import { describe, expect, it } from 'vitest';
import { mapClinicalOverviewToPatientHistory } from './clinical-overview-utils';

describe('mapClinicalOverviewToPatientHistory', () => {
  it('merges verified radiology reports with order studies for imaging history', () => {
    const overview = {
      consultations: { results: [], count: 0 },
      lab_results: { results: [], count: 0 },
      radiology_reports: {
        results: [
          {
            id: 10,
            order_id: 'RAD-001',
            patient_name: 'Jane Doe',
            study_details: {
              id: 99,
              procedure: 'Chest X-Ray',
              status: 'verified',
              report: 'Clear lungs',
              verified_at: '2026-06-01T10:00:00Z',
            },
            order_details: { doctor_name: 'Dr Smith' },
          },
        ],
        count: 1,
      },
      radiology_orders: {
        results: [
          {
            id: 1,
            order_id: 'RAD-001',
            ordered_at: '2026-06-01T09:00:00Z',
            studies: [
              {
                id: 99,
                procedure: 'Chest X-Ray',
                status: 'verified',
              },
            ],
          },
        ],
        count: 1,
      },
      prescriptions: { results: [], count: 0 },
      vitals: { results: [], count: 0 },
      physio_orders: { results: [], count: 0 },
      eye_orders: { results: [], count: 0 },
      ward_admissions: { results: [], count: 0 },
      certificates: { results: [], count: 0 },
      referrals: { results: [], count: 0 },
      visits: [],
      annual_checkups: { results: [], count: 0 },
      medical_history: null,
    };

    const history = mapClinicalOverviewToPatientHistory(overview);
    expect(history.imagingOrders).toHaveLength(1);
    expect(history.imagingOrders[0].study_details?.report).toBe('Clear lungs');
    expect(history.imagingOrders[0].order_id).toBe('RAD-001');
  });
});
