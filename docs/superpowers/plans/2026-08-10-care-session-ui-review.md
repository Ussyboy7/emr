# Care Session UI Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the ward care-session workspace clearer, expose nursing instruction creation, and restore consultation/visit report viewing.

**Architecture:** Keep the existing care-session page and tab components. Reduce the top-level navigation to five workflows, keep Instructions separate from Orders, and reuse existing order/instruction components rather than adding a second data flow.

**Tech Stack:** Next.js App Router, React, TypeScript, shadcn/ui, Vitest.

## Global Constraints

- Preserve existing ward permissions and backend APIs.
- Keep Instructions as a dedicated workflow.
- Use `Clinical progress note` instead of `Assessment and plan`.
- Do not remove existing order, handover, history, or report viewer functionality.

### Task 1: Restore Report Viewer

**Files:**
- Modify: `frontend/app/wards/admissions/[admissionId]/page.tsx:286-297`

- [ ] Set `showConsultationReport` to `true` after loading a consultation report successfully.
- [ ] Keep the loading state visible while the report is fetched.
- [ ] Verify both consultation and visit history callbacks use the same viewer path.

### Task 2: Consolidate Care Session Navigation

**Files:**
- Modify: `frontend/components/ward/care-session/CareSessionTabs.tsx`

- [ ] Remove the `Activities` tab from the top-level tab list.
- [ ] Keep its observation and handover content reachable from `Overview` or `Notes`; prefer moving the two existing sections into `Overview` below the clinical snapshot.
- [ ] Keep `Overview`, `Orders`, `Instructions`, `Notes`, and `History` as the five visible tabs.
- [ ] Remove unused imports and props only after TypeScript confirms no remaining consumers.

### Task 3: Make Instructions Actionable

**Files:**
- Modify: `frontend/components/ward/care-session/tabs/InstructionsTab.tsx`
- Modify: `frontend/components/ward/care-session/CareSessionTabs.tsx`
- Modify: `frontend/app/wards/admissions/[admissionId]/page.tsx`

- [ ] Add an `Add instruction` action in the Instructions tab for users who can add ward orders while the admission is active.
- [ ] Reuse the existing `WardDoctorOrdersSection` add-order workflow through a controlled open callback, or extract only its nursing-instruction form if the component cannot be controlled without exposing unrelated order UI.
- [ ] Refresh the instruction list after a successful creation.
- [ ] Keep admission instructions read-only and labeled as historical provenance.

### Task 4: Clarify Notes Copy

**Files:**
- Modify: `frontend/components/ward/care-session/tabs/NotesTab.tsx`

- [ ] Rename `Assessment and plan` to `Clinical progress note`.
- [ ] Rename `Save note` to `Save progress note`.
- [ ] Keep the nursing handover composer visually and semantically separate.

### Task 5: Verify

**Files:**
- Test: existing frontend test suite

- [ ] Run `npm run type-check` from `frontend/`.
- [ ] Run `npm run lint` from `frontend/`.
- [ ] Run `npm run test` from `frontend/`.
- [ ] Run `git diff --check`.
- [ ] Run `make docs-check`; report any pre-existing page-catalog mismatch separately.
