import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const pageSource = readFileSync(resolve(__dirname, 'page.tsx'), 'utf8');

describe('laboratory line destination transform', () => {
  it('maps the backend line processing destination into the routing dialog model', () => {
    expect(pageSource).toContain('processing_clinic_name?: string | null');
    expect(pageSource).toContain('processing_clinic_name: apiTest.processing_clinic_name');
    expect(pageSource).toContain('tests={(selectedOrder?.tests || []).map((test) => ({ ...test');
  });
});
