import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const pageSource = readFileSync(resolve(__dirname, 'page.tsx'), 'utf8');

describe('Register Patient wizard CTAs', () => {
  it('uses Next for every in-wizard step button', () => {
    expect(pageSource.match(/>\s*Next\s*</g) ?? []).toHaveLength(3);
    expect(pageSource).not.toMatch(/Next:\s*(Work Info|Contact|Medical & NOK)/);
  });
});
