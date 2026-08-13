import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const pageSource = readFileSync(resolve(__dirname, 'page.tsx'), 'utf8');

describe('duplicate visit recovery', () => {
  it('offers Manage Visits with the selected patient preserved in the search', () => {
    const duplicateErrorBranch = pageSource.slice(
      pageSource.indexOf("errorMessage = 'This patient already has an open visit"),
      pageSource.indexOf('setIsSubmitting(false);', pageSource.indexOf("errorMessage = 'This patient already has an open visit")),
    );

    expect(duplicateErrorBranch).toContain('label: \'Manage Visits\'');
    expect(duplicateErrorBranch).toContain('encodeURIComponent(selectedPatient.name)');
    expect(duplicateErrorBranch).toContain("/medical-records/visits?search=");
  });
});

describe('visit clinic selection display', () => {
  it('does not render a second clinic badge summary beside the selectable grid', () => {
    const facilitySection = pageSource.slice(
      pageSource.indexOf('{/* Facility (site) and clinics */}'),
      pageSource.indexOf('{/* Date & Time */}'),
    );

    expect(facilitySection).toContain('formData.clinics.includes(clinic)');
    expect(facilitySection).not.toContain('{formData.clinics.map(');
    expect(facilitySection).not.toContain('<Star className="h-3 w-3" />');
    expect(pageSource).toContain('{formData.clinics.join(\', \')}');
  });
});
