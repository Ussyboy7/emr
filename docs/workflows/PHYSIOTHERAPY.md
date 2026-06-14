# Physiotherapy Flow: Consultation to End of Treatment

Detailed, critical walkthrough from when a doctor orders physiotherapy during a consultation to the end of the physio treatment. Uses concrete examples and calls out gaps and bugs.

---

## Fixes applied

The following have been implemented:

- **Consultation room:** `physioOrders` is loaded from `getOrders({ consultation_session: sessionId })` when `sessionId` is set; merged with drafts so the doctor sees real statuses (Sent to Physiotherapy, Scheduled, In Progress, Completed) and does not lose them on refresh. A link **View in Physiotherapy queue →** to `/physiotherapy/pool-queue` was added.
- **Pool queue – Start Session:** The primary button when starting a **new** session (`!currentSession`) is now **"Start Session"** (was "Complete Session").
- **Pool queue – End treatment plan:** An **"End treatment plan"** button (when `order.status === 'in_progress'`) calls `handleCompleteOrder` so the order can be completed without relying on "Complete Session" with no `in_progress` sessions.
- **Pool queue – Completed tab:** A **Completed** tab and stat card were added to show completed orders.
- **Pool queue – Physiotherapist:** `physiotherapist` is taken from `useCurrentUser` (no longer hardcoded `1`) in createSession, createNextSession, and related flows.
- **Complete Session – no auto-create next:** `handleCompleteIndividualSession` no longer auto-creates the next session as `in_progress`. Use **Continue Session** or **Schedule Next** when more sessions are needed.
- **physioService.completeOrder:** Implemented as a wrapper around `updateOrder(orderId, { status: 'completed', completed_at })`; it no longer calls the non-existent `POST /orders/{id}/complete/`.
- **DB unique constraint:** `PhysioSession` has `UniqueConstraint` on `(order, session_number)`; migration `0007_add_unique_order_session_number`.
- **Complete Session dialog:** The dialog description now states that only the green **Complete Session** flow sets the session to completed and that it will appear under Physiotherapy → Completed Sessions; **Save Session** in Start/Continue does not.

**Not done (optional):**

- Backend `POST /physiotherapy/orders/{id}/complete/` was not added; `completeOrder` uses `updateOrder` instead.
- A separate "archived" or different status for sessions documented only via Start/Continue (not green Complete) was not introduced; the UI clarifies that only the green Complete path leads to Completed Sessions.

---

## 1. Consultation room: doctor orders physiotherapy

### 1.1 Prerequisites

- Doctor is in a **consultation room** (`/consultation/room/[roomId]`).
- A **consultation session** is active: doctor has started a session (or restored one), so `sessionId` is set (e.g. `42`).
- A **patient** is in the room (`currentPatient`), e.g. `{ id: 5, name: "Mr Uthman Musa Yaro", ... }`.

### 1.2 Adding draft orders

1. Doctor opens the **Physiotherapy** tab in the orders panel.
2. Clicks **"Add Physio Order"** and fills the form:
   - **Diagnosis** (required), e.g. `pain lower back`
   - Chief complaint, e.g. `Dull, aching pain in lower lumbar region`
   - Treatment goal, e.g. `Reduce pain, improve function`
   - Special instructions (optional)
   - Priority: `routine` | `urgent` | `stat`
3. Submits → one **draft** order is appended to local state `physioOrders` with `status: 'Draft'`.
4. Doctor can add more drafts, or **Edit** / **Remove** only Draft ones.

**Example after adding two drafts:**

```ts
physioOrders = [
  { id: 'physio-1738012345678', diagnosis: 'pain lower back', chiefComplaint: '...', treatmentGoal: '...', priority: 'routine', status: 'Draft' },
  { id: 'physio-1738012350000', diagnosis: 'neck stiffness', chiefComplaint: '...', treatmentGoal: '...', priority: 'routine', status: 'Draft' }
]
```

**Critical:**

- All of this is **local React state only**. Nothing is in the database yet.
- `physioOrders` is **never** loaded from the API when the doctor selects a patient or when `sessionId` is set.
- On **page refresh**, `physioOrders` is reset to `[]` and all drafts (and the doctor’s view of “Sent to Physiotherapy”) are lost. Real orders created via **Send** remain in the DB, but the consultation room does not re-fetch them.

---

### 1.3 Sending orders to physiotherapy

1. Doctor clicks **"Send to Physio (N)"** (N = number of Draft orders).
2. `sendPhysioOrders`:
   - Requires `currentPatient` and `sessionId`; if missing, shows error and exits.
   - Takes only `physioOrders` with `status === 'Draft'`.
   - For each draft, calls:

     ```ts
     physioService.createOrder({
       patient: numericPatientId,           // e.g. 5
       diagnosis: order.diagnosis,
       chief_complaint: order.chiefComplaint,
       treatment_goal: order.treatmentGoal,
       special_instructions: order.specialInstructions || undefined,
       priority: order.priority,
       consultation_session: sessionId     // e.g. 42
     })
     ```

   - Backend: `POST /physiotherapy/orders/` with `PhysioOrderCreateSerializer`.  
     `perform_create` does `serializer.save(ordered_by=request.user, sessions_completed=0)`.  
     `status` stays default `'pending'`; `consultation_session` is stored.
3. Local state is updated: those drafts are switched to `status: 'Sent to Physiotherapy'`.

**Example:** 2 drafts → 2 `PhysioOrder` rows in the DB, e.g. `id=1` and `id=2`, both `status='pending'`, `consultation_session=42`, `patient_id=5`.

**Critical:**

- The consultation room **never** refetches `physioOrders` from the API. It never shows backend statuses like `scheduled`, `in_progress`, `completed`.
- So the doctor’s view is effectively: **Draft** → **Sent to Physiotherapy**, and then it is static. They do not see when physio has scheduled, started, or finished.
- There is no in-room link to the Physiotherapy pool queue or to a list of orders for this consultation.

---

## 2. Physiotherapy pool queue: order appears

### 2.1 How orders are loaded

- **Pool queue** (`/physiotherapy/pool-queue`) calls `physioService.getOrders({ page, page_size, search })` (no `status` in the request).
- Backend returns **all** orders; the UI filters by `activeTab`: `pending` | `scheduled` | `in_progress` | `cancelled`.
- **Completed** orders are not shown in any tab; they effectively “leave” the main queue view.

So the two new orders (e.g. `id=1`, `id=2`) appear under **Pending** (default tab).

**Example card:**

> **Mr Uthman Musa Yaro** · PENDING · 0 sessions completed · pain lower back  
> E-A2000 · Dr. X · 2m ago  
> [Manage Order]

---

### 2.2 Schedule (Pending → Scheduled)

1. Physio opens an order (e.g. order `id=1`) → **Manage Order** (View) dialog.
2. Clicks **"Schedule Session"** (only when `status === 'pending'`).
3. In the Schedule dialog, picks date/time and saves.
4. Frontend: `physioService.scheduleOrder(order.id, scheduledAt)`  
   → `POST /physiotherapy/orders/{id}/schedule/` with `{ scheduled_at }`.
5. Backend `schedule` action sets `order.scheduled_at` and `order.status = 'scheduled'`.

Order moves from **Pending** to **Scheduled** tab.

**Critical:**

- `schedule` does **not** create any `PhysioSession`. The first session is only created at **Start Session**.

---

## 3. Start Session (Scheduled or Pending → In progress)

### 3.1 From pool queue

1. In the View dialog, when `status` is `scheduled` or `pending`, physio sees **"Start Session"**.
2. Clicks it → **Start Session** dialog opens.  
   - Patient vitals are loaded if `selectedOrder.patient` is set.
   - A big form is shown: A–F (Presenting complaint, Pain before, Medical/social, Physical exam, Functional, Clinical reasoning, Treatment plan, etc.).
3. Physio can fill part or all, then:
   - **"Complete Session"** (primary button when it’s a **new** session, i.e. no `currentSession`):  
     - This label is misleading: it does **not** complete the session. It creates a new session and optionally marks the order in progress (see below). The button should be named **"Start Session"** or **"Save & Start"** in this branch.
   - The handler is `handleStartSession`. For a **new** session (`!currentSession`):
     - `getSessions({ order: selectedOrder.id })` to get existing sessions.
     - `nextSessionNumber = existingSessions.results.length + 1` (e.g. 1 for the first).
     - `createSession` with a large payload (order, physiotherapist, session_number, scheduled_at, all form fields, `status: 'in_progress'`).
     - `updateOrder(selectedOrder.id, { status: 'in_progress' })`.
   - Backend: `POST /physiotherapy/sessions/` with `PhysioSessionCreateSerializer` (now accepts full assessment).  
     Order’s `status` is not changed by the session create; the frontend sets it to `in_progress` via `updateOrder`.

**Example:** First time → `PhysioSession` `id=1`, `order_id=1`, `session_number=1`, `status='in_progress'`. Order `id=1` becomes `in_progress`.

**Critical:**

- `physiotherapist` is hardcoded to `1` in several places (`createSession`, `createNextSession`, etc.). Should come from auth.
- If the create serializer had been the old restricted one, only a few fields would have been stored; that has been fixed, but any past sessions created before the fix would have lost data.
- The button label **"Complete Session"** when starting a new session is wrong: it creates and starts, it does not complete.

---

## 4. In‑progress order: Continue Session vs Complete Session

### 4.1 Continue Session

- Shown when `order.status === 'in_progress'`.
- On click:
  - `getSessions({ order })` → `nextSessionNumber = max(session_number) + 1`.
  - `createSession` with **minimal** payload: `{ order, physiotherapist, session_number, scheduled_at, status: 'in_progress' }`. No assessment fields.
  - Form is prefilled from the **last completed** session (presenting complaint, medical_history, functional_goals, diagnosis_impression, clinical_reasoning) if it exists; otherwise empty.
  - **Start Session** dialog opens with `currentSession = createdSession`.
- Physio fills/edits the form and clicks **"Save Session"** (the button text when `currentSession` exists).
- `handleStartSession` sees `currentSession` → `updateSession(currentSession.id, fullFormPayload)` (PATCH). Session is updated; status remains `in_progress`. Order stays `in_progress`.

**Example:** After one completed session, **Continue Session** creates `PhysioSession` `id=4`, `session_number=2`, `status='in_progress'`. Physio documents in the form and saves → PATCH updates that session. No new session is created on Save.

**Critical:**

- The **new** session is created with minimal data. All assessment is intended to be added via the form and then **Save Session**. If the user closes the dialog without saving, that new session stays nearly empty (and can duplicate a `session_number` if logic is wrong elsewhere).
- Duplicate `session_number` for the same order (e.g. two “Session 2”) has been observed; the create logic and any other session-creation paths should be reviewed.

---

### 4.2 Complete Session (green button)

- Also when `order.status === 'in_progress'`.
- On click:
  - `getSessions({ order, status: 'in_progress' })`.
  - If there **is** at least one `in_progress` session:
    - `currentSession = results[0]`, open **Complete Session** dialog, View dialog closes.
    - Form: Treatment performed (required), Pain after, Progress notes, Home exercises, Next session plan, Follow‑up instructions.
    - On submit: `handleCompleteIndividualSession(currentSession.id, formData)`:
      - `updateSession(sessionId, { status: 'completed', completed_at, treatment_performed, pain_level_after, progress_notes, exercises_prescribed (from home_exercises), next_session_plan, recommendations, follow_up_instructions })`.
      - `getSessions({ order })` → `completedCount = results.filter(s => s.status === 'completed').length`.
      - `updateOrder(order.id, { sessions_completed: completedCount })`.
      - Then it **always** creates a “next” session: `createSession({ order, physiotherapist, session_number: completedCount + 1, scheduled_at: now, status: 'in_progress', presenting_complaint, medical_history, medications, functional_goals, clinical_reasoning })` from `sessionData`.  
        So after completing e.g. Session 2, Session 3 is auto-created as `in_progress` immediately.
  - If there is **no** `in_progress` session:
    - `handleCompleteOrder(order)` is called instead (see below).

**Example:** Session 2 was `in_progress`. Complete Session runs → Session 2 becomes `completed`, `sessions_completed=2`, and Session 3 is created as `in_progress`. The order stays `in_progress`.

**Critical:**

- **Completing one session always creates the next one** as `in_progress`. There is no “this was the last session” step in this flow. To actually finish the **order**, the physio must use **Complete Session** when there is **no** `in_progress` session (see 4.3), or an equivalent “Complete order” action.
- The “next” session is created from `sessionData`, which at this point is the **Complete Session** form, not the big assessment form. So `presenting_complaint`, `medical_history`, etc. can be empty or from a previous Start/Continue. The create serializer now accepts them, but the source of truth for the **new** session is not the Complete Session form.
- Home exercises are sent as `exercises_prescribed` (backend); the UI uses “Home exercises” and the mapping was fixed so it is stored.

---

### 4.3 Completing the whole order

`handleCompleteOrder(order)` runs when the user clicks **Complete Session** and there is **no** `in_progress` session (e.g. they were all completed or none exist).

- `getSessions({ order })`; for every session with `status !== 'completed'`, `updateSession(..., { status: 'completed', completed_at })`.
- `updateOrder(order.id, { status: 'completed', completed_at })`.

So the **order** becomes `completed`. It then no longer matches any pool-queue tab (pending/scheduled/in_progress/cancelled) and disappears from the main queue.

**Critical:**

- There is no dedicated “Complete order” / “End treatment plan” button. The only way to run `handleCompleteOrder` is **Complete Session** when there are no `in_progress` sessions. That is easy to miss; a clearer “Complete order” when the plan is done would help.
- `physioService.completeOrder` exists in the frontend but calls `POST /physiotherapy/orders/{id}/complete/`, which **does not exist** in the backend. The actual implementation correctly uses `updateOrder`; `completeOrder` is dead code and can 404 if used.

---

## 5. Where sessions and orders are visible after that

### 5.1 Completed Sessions page

- **Route:** `/physiotherapy/completed`.
- **Data:** `physioService.getSessions({ status: 'completed', page, page_size })`.
- Shows **sessions** with `status === 'completed'`, not orders.  
  So a completed **order** is only represented here indirectly by its completed sessions.
- For each session: View, Session Report, Edit, Add recommendation.  
  **Edit** opens the full assessment form and PATCHes the session; reports and history then show the updated data.

**Critical:**

- Only sessions that went through the **Complete Session** dialog (green button) and were submitted get `status='completed'`.  
  **Save Session** in the Start/Continue form does **not** set `status='completed'`. So if a physio only uses Start/Continue and never the green Complete, those sessions will not appear here.

---

### 5.2 Pool queue – Sessions list and Edit

- In the **View** (Manage Order) dialog, when `isViewDialogOpen` and `selectedOrder` are set, `getSessions({ order: selectedOrder.id })` loads `orderSessionsList`.
- A **Sessions** block lists sessions (by `session_number`) with an **Edit** button each. Edit uses the same assessment form as the Completed page and PATCHes the session.

So both **in‑progress** and **completed** sessions for an order can be edited from the pool queue as long as the order is still open in the View dialog. Completed **orders** themselves are no longer in the pool queue tabs.

---

### 5.3 Consultation room – history and session viewer

- **History** (physio): `physioService.getOrders({ patient })` → `rawPhysioResults` → `physioHistory`.  
  Shows **orders** for the patient (all statuses), not per-session. Good for “has this patient had physio?” and which orders exist.
- **Session viewer** (when inspecting a past consultation):  
  `physioService.getOrders({ consultation_session: session.id, patient, page_size })` → `enrichedSession.physioOrders` with `diagnosis`, `priority`, `status`.  
  So the referring doctor can see that an order existed and its high-level status, but not the detailed session documentation.

**Critical:**

- The **Physiotherapy** orders tab in the **active** consultation (the one used to add/send orders) **does not** load from `getOrders({ consultation_session: sessionId })`. So:
  - After a refresh, the doctor loses the list of drafts and “Sent to Physiotherapy” for the current session.
  - They never see “Scheduled”, “In Progress”, or “Completed” for those orders in the same tab.  
  That would require loading and merging `physioOrders` from the API when `sessionId` and `patient` are set, and optionally when the Physiotherapy tab is focused.

---

### 5.4 Patient medical records

- **Route:** e.g. `/medical-records/patients/[patientId]` → **Physio** tab.
- **Data:** `physioService.getOrders({ patient })`.  
  Lists **orders** with diagnosis, status, sessions completed, etc. No inline session reports; for details the user must go to Physiotherapy → Completed (or similar) and find the session.

---

## 6. End‑to‑end example (concrete)

1. **Consultation**  
   - Doctor, session `42`, patient `5` (Mr Uthman).  
   - Adds 1 draft: diagnosis `pain lower back`, chief complaint, treatment goal, `routine`.  
   - **Send to Physio** → `PhysioOrder` `id=1`, `status=pending`, `consultation_session=42`, `patient=5`.

2. **Pool queue – Schedule**  
   - Order `1` in Pending. Physio opens it, **Schedule Session** → `scheduled_at` set, `status=scheduled`.

3. **Pool queue – Start Session**  
   - **Start Session** → form partially filled (e.g. presenting complaint, pain 6/10).  
   - Submits (button “Complete Session” in the new-session branch) → `PhysioSession` `id=1`, `session_number=1`, `status=in_progress`; order `1` → `in_progress`.  
   - That session is **not** completed; it stays `in_progress`.

4. **Pool queue – Complete Session (first time)**  
   - **Complete Session** → there is an `in_progress` session (id=1).  
   - Complete Session dialog: treatment performed, pain after 3/10, progress notes, home exercises. Submit.  
   - Session `1` → `completed`; `sessions_completed=1`; `PhysioSession` `id=3` (or next id) created as `session_number=2`, `in_progress`.  
   - Order stays `in_progress`.

5. **Pool queue – Complete Session (second time)**  
   - **Complete Session** again → `in_progress` session (id=3, Session 2).  
   - Complete Session dialog filled and submitted.  
   - Session 2 → `completed`; `sessions_completed=2`; Session 3 auto-created as `in_progress`.  
   - Order still `in_progress`.

6. **Pool queue – End the order**  
   - Physio does **not** open **Continue Session** (to avoid creating Session 4).  
   - For the existing `in_progress` Session 3, they could either:  
     - Complete it (which would create Session 4), or  
     - Rely on **Complete Session** when there are no `in_progress` sessions.  
   - To get “no in_progress”: e.g. delete or alter the in_progress session in DB, or have a dedicated “Complete order” that does not depend on “Complete Session” when the list is empty.  
   - In the current design: **Complete Session** with no `in_progress` sessions calls `handleCompleteOrder` → all non‑completed sessions are marked completed and the order is set `status=completed`, `completed_at` set.  
   - So: if the physio first gets rid of the auto-created `in_progress` session (or never creates it by changing the flow), then **Complete Session** can end the order. In the default flow, they would have to complete the auto-created session and then run **Complete Session** once more when no `in_progress` session remains.

7. **Completed Sessions**  
   - Sessions `1` and `2` (and any later completed ones) show in `/physiotherapy/completed`.  
   - Session reports, Edit, and Add recommendation work.  
   - Order `1` is `completed` and no longer in the pool-queue tabs; it can still be seen in patient history and consultation session viewer.

---

## 7. Summary of critical issues

| Issue | Where | Impact | Status |
|-------|-------|--------|--------|
| `physioOrders` in the consultation room is never loaded from the API | Consultation room | Drafts and “Sent” state are lost on refresh; doctor never sees Scheduled/In Progress/Completed for the current session. | **Fixed** |
| No in-room view of order status after “Sent to Physiotherapy” | Consultation room | Doctor has no feedback that physio has acted on the order. | **Fixed** (load from API + link to pool queue) |
| “Complete Session” button used to create and start a new session | Pool queue, Start Session dialog | Misleading label; should be “Start Session” or “Save & Start” when `!currentSession`. | **Fixed** (now "Start Session") |
| Completing a session always creates the next as `in_progress` | `handleCompleteIndividualSession` | No explicit “last session” in the normal flow; order stays in progress until **Complete Session** is used with no `in_progress` sessions. | **Fixed** (auto-create removed) |
| No dedicated “Complete order” / “End treatment plan” | Pool queue | Hard to discover; depends on **Complete Session** when there are no `in_progress` sessions. | **Fixed** (End treatment plan button) |
| `physioService.completeOrder` calls non‑existent `/orders/{id}/complete/` | Frontend | Dead or broken if ever used; backend has no such action. | **Fixed** (uses `updateOrder`) |
| `physiotherapist: 1` hardcoded | Pool queue, createSession, createNextSession, etc. | All sessions are attributed to user `1`; should use current user. | **Fixed** |
| Completed orders not shown in any pool-queue tab | Pool queue | By design they leave the main queue, but there is no “Completed” or “History” tab in the same view. | **Fixed** (Completed tab) |
| Sessions only reach Completed page if completed via the green Complete Session dialog | Backend + pool queue | Save Session in Start/Continue does not set `status=completed`; those sessions never appear in Completed. | **Clarified** (note in Complete Session dialog) |
| Duplicate `session_number` for same order possible | Session create logic | Needs clear rules and ideally a DB constraint on `(order_id, session_number)`. | **Fixed** (DB constraint) |

---

## 8. Suggested improvements (short)

*(Most of these have been implemented; see **Fixes applied** above.)*

1. **Consultation room** — **Done.** Load from API when `sessionId` is set; link to pool queue added.

2. **Pool queue** — **Done.** Start Session button renamed; End treatment plan button added; Completed tab added.

3. **Session creation after Complete Session** — **Done.** Auto-create next session removed; use Continue Session or Schedule Next when more sessions are needed.

4. **Backend / frontend** — **Done.** `physioService.completeOrder` now uses `updateOrder`; `physiotherapist` from current user; DB unique constraint on `(order_id, session_number)`. *Optional:* `POST /physiotherapy/orders/{id}/complete/` was not added.

5. **Completed Sessions** — **Clarified.** The Complete Session dialog now states that only the green **Complete Session** flow leads to the Completed Sessions list; Save Session in Start/Continue does not. *Optional:* A separate "archived" status was not introduced.
