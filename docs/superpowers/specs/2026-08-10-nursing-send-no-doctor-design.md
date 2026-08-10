# Nursing — Send to Room with No Doctor on Seat

**Date:** 2026-08-10
**Status:** Approved (design gate passed)

## Summary

Allow nurses to send a patient to a consultation room even when no doctor is on
seat, behind a simple "No doctor on seat" confirmation dialog. Today this flow
requires the `consultation_queue_override` capability and a mandatory reason,
which blocks regular nurses.

## Decisions (confirmed with user)

- **Dialog**: simple confirm only — no reason field. Warns that the patient will
  wait until a doctor checks in.
- **Scope**: both the nursing **pool-queue** send-to-room picker and the
  **room-queue** reassignment flow.
- **Unavailable rooms**: facility-inactive rooms remain blocked (`assert_room_operational`).
- **Room-queue confirm**: styled dialog (consistent with pool-queue), not `window.confirm`.

## Backend

### `backend/consultation/room_presence.py`

`assert_room_accepting_patients(room, *, request=None)`:

- Keep `assert_room_operational(room)` — inactive facilities stay blocked.
- Allow when the request carries an active `override_presence` flag, for **any**
  authenticated user — remove the `user_can_override_room_presence` gate and the
  reason requirement.
- Still block when no doctor is on seat **and** no `override_presence` flag.

`presence_override_audit_suffix(request)`:

- Keep `(presence override: <reason>)` when a reason is provided.
- When override is active with no reason, emit a generic suffix so the audit
  trail still records the no-doctor send.

`user_can_override_room_presence` is unchanged — still used for doctor room
check-in override at `consultation/views.py:251`.

### `backend/consultation/tests/test_room_presence.py`

Update for the new semantics:

- `test_queue_create_blocked_without_doctor` — keep (nurse, no flag → 400).
- `test_queue_create_blocked_when_not_accepting` — keep the no-flag → 400 case.
- `test_supervisor_override_requires_reason` → override without reason now → 201.
- `test_regular_nurse_cannot_override` → regular nurse override → 201.
- `test_reassign_to_non_accepting_room_blocked` → keep no-flag → 400; add a
  with-override reassign → 200 case.
- New: nurse + `override_presence: true` (no reason) → 201 for queue create.

## Frontend

### `frontend/app/nursing/pool-queue/page.tsx`

- Room picker cards: `canOverrideRoom = room.status !== 'unavailable' && !canSend`
  (drop the `canOverridePresence` dependency). `canClick = canSend || canOverrideRoom`.
- Label: `"Supervisor override available"` → `"No doctor on seat"` (kept only for
  non-available, non-unavailable rooms; `"Cannot send here"` only for unavailable).
- `handleRoomPickerSelect`: for non-available, non-unavailable rooms open the
  no-doctor confirm dialog (no reason).
- Replace the reason-based "Override room presence" dialog with a simple
  "No doctor on seat" confirm: title, description, `Send anyway` / `Cancel`.
- `confirmNoDoctorSend`: `handleSendToRoom(roomId, { override_presence: true })`.

### `frontend/app/nursing/room-queue/page.tsx`

- Reassign dropdown: no-doctor rooms selectable by all nurses
  (`canOverrideRoom = room.status !== 'unavailable' && !canReassign`).
- New Room panel: `needsOverride = targetRoom?.status !== 'unavailable' && !canReassign`;
  warn "No doctor on seat" (no reason textarea).
- `handleReassign`: drop the capability/reason guard; if the target is not
  accepting, open a styled no-doctor confirm dialog before PATCHing, and send
  `{ room, override_presence: true }` (no reason).

## Out of Scope

- Removing the `consultation_queue_override` capability or RBAC catalogs — the
  capability remains defined (still used for room check-in override).
- Changes to the queue-notification behavior (sends to the on-seat doctor).
- Any other send/queue flows outside the two nursing pages.

## Verification

- Backend: run `consultation.tests.test_room_presence` and the broader
  consultation suite.
- Frontend: `npm run type-check` and `npm run lint`; related Vitest suites green.
