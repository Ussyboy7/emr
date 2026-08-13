import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const dialogSource = readFileSync(resolve(__dirname, 'OrderRoutingDialog.tsx'), 'utf8');

describe('laboratory routing dialog contract', () => {
  it('accepts and displays each line processing destination', () => {
    expect(dialogSource).toContain('processing_clinic_name?: string | null');
    expect(dialogSource).toContain('Processing: {test.processing_clinic_name || \'—\'}');
  });

  it('keeps pending triage as the display fallback without changing routing state', () => {
    expect(dialogSource).toContain("test.routing_status || 'pending_triage'");
  });
});
