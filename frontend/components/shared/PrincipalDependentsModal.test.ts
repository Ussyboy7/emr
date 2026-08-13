import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const modalSource = readFileSync(resolve(__dirname, 'PrincipalDependentsModal.tsx'), 'utf8');

describe('PrincipalDependentsModal dependent registration', () => {
  it('routes eligible principals to the full dependent registration form', () => {
    expect(modalSource).toContain('useRouter');
    expect(modalSource).toContain('category: "dependent"');
    expect(modalSource).toContain('principal: String(principalNumericId)');
    expect(modalSource).toContain("router.push(`/medical-records/patients/new?");
    expect(modalSource).toContain('onAfterChange?.()');
    expect(modalSource).toContain('if (!principalNumericId || atLimit) return;');
    expect(modalSource).toContain('principalCategory === "retiree" ? 1 : 5');
    expect(modalSource).toContain('onOpenChange(false);');
    expect(modalSource).toContain('Register dependent (full form)');
    expect(modalSource).not.toContain('handleCreate');
    expect(modalSource).not.toContain('setView("add")');
  });
});
