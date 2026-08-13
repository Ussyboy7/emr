# Registration UI + Dependent Registration via Full Form Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Change register-patient CTA labels to "Next", and route dependent registration through the full registration wizard instead of the inline modal form.

**Architecture:** Keep the 4-step registration wizard as the single source of truth. Remove the inline dependent-create form and navigate to `/medical-records/patients/new?category=dependent&principal=<pk>&dependent_type=...`, which already supports prefill (`frontend/app/medical-records/patients/new/page.tsx:124-174`). Backend `POST /api/v1/patients/` is reused unchanged.

**Tech Stack:** Next.js 16 App Router, React 18, TypeScript, Tailwind, shadcn/ui, Vitest.

## Global Constraints

- Do not add a new backend endpoint; `POST /api/v1/patients/` already creates dependents.
- Do not remove steps from the 4-step wizard; only re-route dependent creation into it.
- Preserve dependent limits: 5 for employee principals, 1 for retiree principals.
- Follow existing `router.push` patterns; no new HTTP client.
- After successful dependent registration, the Manage Patients list refreshes.

---

### Task 1: Registration step CTA labels use "Next"

**Files:**
- Modify: `frontend/app/medical-records/patients/new/page.tsx:1023-1028`, `:1150-1158`, `:1222-1230`

**Interfaces:**
- Consumes: existing `goToNextStep`, `ArrowRight` icon.
- Produces: consistent "Next" label on the three in-wizard step buttons.

- [ ] **Step 1: Write the failing test**

Create `frontend/app/medical-records/patients/new/page.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import Page from './page';
import { MemoryRouter } from 'react-router';

// The page uses next/navigation; mock it minimally.
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useSearchParams: () => new URLSearchParams(''),
}));

describe('Register Patient wizard CTAs', () => {
  it('labels the step buttons "Next"', async () => {
    render(<Page />);
    expect(await screen.findByText('Next')).toBeTruthy();
    expect(screen.queryByText('Next: Work Info')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to confirm it fails**

Run: `npm run test -- --run`
Expected: FAIL because labels still read `Next: Work Info`.

- [ ] **Step 3: Replace the three labels**

In `frontend/app/medical-records/patients/new/page.tsx`, change each `Next: <Step>` to `Next` (keep the `ArrowRight` icon):

- Line 1025: `Next: Work Info` -> `Next`
- Line 1152: `Next: Contact` -> `Next`
- Line 1223: `Next: Medical & NOK` -> `Next`

- [ ] **Step 4: Run to confirm it passes**

Run: `npm run test -- --run` then `npm run type-check` and `npm run lint`
Expected: test passes; type-check and lint clean.

- [ ] **Step 5: Commit**

```bash
git add frontend/app/medical-records/patients/new/page.tsx frontend/app/medical-records/patients/new/page.test.tsx
git commit -m "feat(registration): label wizard step CTAs as Next"
```

---

### Task 2: Replace inline dependent form with navigation to the full registration page

**Files:**
- Modify: `frontend/components/shared/PrincipalDependentsModal.tsx` (remove inline form `:267-402`; header `:198-212`, footer `:394-401`)
- Modify: `frontend/app/medical-records/patients/page.tsx` (onAfterChange / refresh; lines ~1334-1349)

**Interfaces:**
- Consumes: existing `principalNumericId`, `principalCategory`, `principalPatientId`, `atLimit`, `onOpenChange`, `onAfterChange`.
- Produces: `handleOpenRegistration()` that navigates to the register page with dependent prefill query params.

- [ ] **Step 1: Refactor the modal to a single-action form**

Replace `handles` in `PrincipalDependentsModal.tsx`:

- Remove `creating`, `form`, `resetForm`, `handleCreate`, `RELATIONSHIPS`, `loadedDependents` inline create.
- Keep the dependents **list** view and the footer button.
- The footer button text becomes "Register dependent (full form)" and calls `window.location.href`-free navigation:

```tsx
import { useRouter } from 'next/navigation';

const router = useRouter();
const handleOpenRegistration = () => {
  if (!principalNumericId || atLimit) return;
  const params = new URLSearchParams({
    category: 'dependent',
    principal: String(principalNumericId),
  });
  if (principalCategory === 'retiree') params.set('dependent_type', 'Retiree Dependent');
  else params.set('dependent_type', 'Employee Dependent');
  router.push(`/medical-records/patients/new?${params.toString()}`);
  onOpenChange(false);
};
```

- [ ] **Step 2: Wire the footer button**

Replace the footer block (lines 405-417) `onClick={() => setView('add')}` with `onClick={() => handleOpenRegistration()}` and update the label.

- [ ] **Step 3: Remove the add view**

Set `view` state default to `"list"` and delete the `form`/`handleCreate`/`setView("add")` code paths so the "New dependent" add panel is gone.

- [ ] **Step 4: Refresh Manage Patients on return**

In `patients/page.tsx`, `PrincipalDependentsModal` `onOpenChange` handler remains `setPrincipalDepsOpen(null)`. Add a visibility-reload so the list refetches upcoming at step 3:

```ts
useEffect(() => {
  if (!isEditModalOpen) void loadPatients();
}, [router])
```

(the existing `onAfterChange` already does `()` => void loadPatients(); keep it, and call `onAfterChange?.()` in `handleOpenRegistration` before navigation.)

- [ ] **Step 5: Run frontend tests + type-check**

Run: `npm run test -- --run`, `npm run type-check`, `npm run lint`
Expected: pass; no references to removed `handleCreate`/`form` remain.

- [ ] **Step 6: Commit**

```bash
git add frontend/components/shared/PrincipalDependentsModal.tsx frontend/app/medical-records/patients/page.tsx
git commit -m "feat: route dependent registration through full form"
```