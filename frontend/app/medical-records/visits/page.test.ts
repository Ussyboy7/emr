import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const pageSource = readFileSync(resolve(__dirname, 'page.tsx'), 'utf8');

describe('visit action visibility', () => {
  it('shows the clinical summary action when completed or has completed clinic legs', () => {
    const actionSection = pageSource.slice(
      pageSource.indexOf('{/* Actions */}'),
      pageSource.indexOf('{/* Actions */}') + 700,
    );

    expect(actionSection).toContain(
      "visit.visitStatusRaw === 'completed' || visit.completedClinics.length > 0",
    );
    expect(actionSection).not.toContain("visit.visitStatusRaw !== 'cancelled'");
  });

  it('shows the cancel action only for scheduled visits and keeps nursing scheduled-only', () => {
    const actionSection = pageSource.slice(
      pageSource.indexOf('{/* Actions */}'),
      pageSource.indexOf('{visit.visitStatusRaw === \'completed\'}'),
    );

    expect(actionSection).toContain("visit.visitStatusRaw === 'scheduled' &&");
    expect(actionSection).not.toContain("visit.visitStatusRaw === 'scheduled' || visit.visitStatusRaw === 'in_progress'");
  });
});

describe('visit polling', () => {
  it('pauses while the clinical summary modal is open', () => {
    const pollingSection = pageSource.slice(
      pageSource.indexOf('const pollingPaused = useMemo('),
      pageSource.indexOf('useEffect(() => {', pageSource.indexOf('const pollingPaused = useMemo(')),
    );

    const dependencyStart = pollingSection.indexOf('[');
    expect(pollingSection.slice(0, dependencyStart)).toContain('isReportModalOpen');
    expect(pollingSection.slice(dependencyStart)).toContain('isReportModalOpen');
  });

  it('does not reference a standalone consultation report modal', () => {
    expect(pageSource).not.toContain('isConsultationReportModalOpen');
    expect(pageSource).not.toContain('ConsultationReportModal');
  });
});
