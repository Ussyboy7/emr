# Email & SMTP — requirements and roadmap

**Status:** Planning / not production-configured  
**Audience:** ICT, infrastructure, EMR administrators, developers  
**Last reviewed:** 2026-06

This document captures what NPA needs to **send email from the EMR** (official sender, SMTP relay, secrets, governance) and what **product work remains** before patients, employees, or retirees receive lab results, reports, or certificates by email.

Implementation is deferred; use this as the checklist when ICT and clinical stakeholders are ready.

---

## Related documentation

| Topic | Document |
|-------|----------|
| Operations & deploy | [operations/RUNBOOK.md](../operations/RUNBOOK.md) |
| Administration | [admin/EMR_ADMINISTRATION_GUIDE.md](../admin/EMR_ADMINISTRATION_GUIDE.md) |
| Support desk | [admin/EMR_SUPPORT_MAINTENANCE.md](../admin/EMR_SUPPORT_MAINTENANCE.md) |
| Audit trail | [architecture/AUDIT.md](../architecture/AUDIT.md) |
| Go-live | [testing/EMR_GO_LIVE_CHECKLIST.md](../testing/EMR_GO_LIVE_CHECKLIST.md) |

---

## 1. What the EMR does today (code baseline)

All outbound mail uses Django `send_mail` via `EmailService` in `backend/common/services.py`.

| Trigger | Recipient | Notes |
|---------|-----------|--------|
| Support ticket submitted | `EMR_SUPPORT_EMAIL` (IT inbox) | `backend/support/views.py` |
| Staff workflow notification | `User.email` on staff account | Only if user enables **Email** in notification preferences (`email_enabled` defaults to **false**) |
| Manual admin API | Any address | `POST /api/v1/common/send-email/` — staff only, plain text |

**Not implemented today:**

- Email lab/radiology PDFs to patients  
- Email medical certificates or annual check-up letters to employees/retirees  
- Email medical records reports to anyone  
- Bulk email to all patients  
- Auto-sync official `@nigerianports.gov.ng` address from HR/AD onto patient records  

Patient charts have an optional `email` field (`patients.Patient.email`); it is displayed in the UI but **not** used for clinical outbound mail yet.

**Branding vs SMTP:** Frontend `NPA_EMR_CONTACT_EMAIL` (`frontend/lib/branding.ts`, default `emr-support@nigerianports.gov.ng`) is for **display and `mailto:` links** only. It does not configure the mail server.

---

## 2. What ICT / mail team must provide

Complete this checklist before production email is enabled.

### 2.1 Service mailbox (recommended)

| Item | Example | Notes |
|------|---------|--------|
| **Sender address** | `emr@nigerianports.gov.ng` or `noreply@nigerianports.gov.ng` | Shown as **From** on outbound mail |
| **Display name** | `NPA EMR` | `DEFAULT_FROM_EMAIL` format: `NPA EMR <emr@nigerianports.gov.ng>` |
| **Support inbox** (receives tickets) | `emr-support@nigerianports.gov.ng` | Already referenced as `EMR_SUPPORT_EMAIL` default |
| **Reply-to** (optional) | `emr-support@nigerianports.gov.ng` | If `noreply@` is used as sender |

Decide whether clinical result email should **reply to clinic** vs central IT — document the policy here when decided.

### 2.2 SMTP / relay details

Obtain from Microsoft 365, Exchange, or your relay provider:

| Setting | Example (M365 — verify with ICT) |
|---------|----------------------------------|
| `EMAIL_HOST` | `smtp.office365.com` |
| `EMAIL_PORT` | `587` |
| `EMAIL_USE_TLS` | `true` |
| `EMAIL_USE_SSL` | `false` (typical for 587 + STARTTLS) |
| `EMAIL_HOST_USER` | Service account UPN / mailbox |
| `EMAIL_HOST_PASSWORD` | App password or cert-based auth secret |
| Allowed senders | EMR server egress IP on allow-list if using IP relay |

**Alternatives ICT may prefer:**

- On-prem Exchange SMTP relay (no auth from trusted subnet)  
- Microsoft Graph API send (requires different integration — not in codebase today)  
- Third-party transactional provider — policy approval required  

### 2.3 DNS & deliverability (ICT)

- **SPF** — include the relay that sends on behalf of `@nigerianports.gov.ng`  
- **DKIM** — sign outbound from the EMR sender domain  
- **DMARC** — align with organisational policy  

Poor DNS setup causes results mail to land in spam or be rejected.

### 2.4 Security

- Store `EMAIL_HOST_PASSWORD` in **secrets** (env file on server, vault, or Docker secrets) — **never** commit to git  
- Use a **dedicated service account**, not a personal mailbox  
- Restrict relay to EMR application hosts only  
- Rotate credentials on the same schedule as other production secrets  

---

## 3. Environment variables (deployment)

Environment files are loaded from `backend/env/<DJANGO_ENV>.env` (see `backend/emr_backend/settings.py`). **Production/staging must not rely on committed `.env` in the repo.**

### 3.1 Required when SMTP is enabled

| Variable | Purpose | Example |
|----------|---------|---------|
| `EMAIL_BACKEND` | Django mail backend | `django.core.mail.backends.smtp.EmailBackend` |
| `EMAIL_HOST` | SMTP hostname | `smtp.office365.com` |
| `EMAIL_PORT` | SMTP port | `587` |
| `EMAIL_USE_TLS` | STARTTLS | `true` |
| `EMAIL_HOST_USER` | Auth user | `emr@nigerianports.gov.ng` |
| `EMAIL_HOST_PASSWORD` | Auth secret | *(from ICT — secret)* |
| `DEFAULT_FROM_EMAIL` | Default **From** header | `NPA EMR <emr@nigerianports.gov.ng>` |
| `SERVER_EMAIL` | Django error emails to admins | Same as sender or ops inbox |

### 3.2 Already used in application code

| Variable | Purpose | Default in code |
|----------|---------|-----------------|
| `EMR_SUPPORT_EMAIL` | Inbox for support ticket notifications | `emr-support@nigerianports.gov.ng` |
| `EMR_SUPPORT_PHONE` | Help desk phone hint (display / future use) | Generic placeholder text |

### 3.3 Local development

| Variable | Purpose |
|----------|---------|
| `EMAIL_BACKEND` | `django.core.mail.backends.console.EmailBackend` — prints mail to backend logs |

Optional: Mailpit or similar in local Docker for visual testing.

### 3.4 Implementation note (developers)

As of this writing, **`EMAIL_*` and `DEFAULT_FROM_EMAIL` are not wired in `settings.py`** — only `EMR_SUPPORT_EMAIL` / `EMR_SUPPORT_PHONE` are. When implementing:

1. Add settings reads from `os.getenv(...)` with safe local defaults.  
2. Document variables in `backend/env/*.env.example` (no secrets).  
3. Add a smoke-test command or health sub-check (optional).  
4. Update [testing/EMR_GO_LIVE_CHECKLIST.md](../testing/EMR_GO_LIVE_CHECKLIST.md) with an email verification step.

**Example production block** (paste into env file after ICT confirms values):

```bash
EMAIL_BACKEND=django.core.mail.backends.smtp.EmailBackend
EMAIL_HOST=smtp.office365.com
EMAIL_PORT=587
EMAIL_USE_TLS=true
EMAIL_HOST_USER=emr@nigerianports.gov.ng
EMAIL_HOST_PASSWORD=<SECRET_FROM_ICT>
DEFAULT_FROM_EMAIL=NPA EMR <emr@nigerianports.gov.ng>
SERVER_EMAIL=emr@nigerianports.gov.ng

EMR_SUPPORT_EMAIL=emr-support@nigerianports.gov.ng
```

---

## 4. Verification (after SMTP is configured)

### 4.1 Support ticket path

1. Sign in as a user with module access.  
2. Submit a ticket from **Help & Support** (`/help?ticket=1`).  
3. Confirm message arrives at `EMR_SUPPORT_EMAIL`.  
4. Confirm ticket appears in **Administration → Support Tickets** and **Audit** (`object_type: support_ticket`).

### 4.2 Staff notification path

1. Ensure test user has a valid `email` on their **staff account** (`/admin/users`).  
2. User enables **Email** under notification preferences.  
3. Trigger a workflow notification (e.g. lab result ready).  
4. Confirm email received with correct **From** address.

### 4.3 Admin send API (optional)

```http
POST /api/v1/common/send-email/
Authorization: Bearer <staff JWT>
Content-Type: application/json

{
  "recipient": "ict-test@nigerianports.gov.ng",
  "subject": "EMR SMTP smoke test",
  "message": "If you receive this, SMTP is working."
}
```

Requires staff user (`is_staff`).

### 4.4 Failure behaviour

- `EmailService.send_email` logs errors and returns `false`; callers generally **do not** roll back the main action (e.g. support ticket still saves if email fails).  
- Monitor backend logs for `Error sending email`.

---

## 5. Two different “email” concepts in the EMR

| Concept | Field / source | Used for |
|---------|----------------|----------|
| **Staff login email** | `accounts.User.email` | Login (username or email), staff notifications |
| **Patient chart email** | `patients.Patient.email` | Contact on record; **not** auto-sent today |

For **employees and retirees**, official NPA mailbox is often the same as staff email, but the EMR does **not** automatically link personal number → `@nigerianports.gov.ng`. Medical records staff must capture `patient.email` or a future HR sync must populate it.

---

## 6. Future product work (clinical outbound mail)

### Phase A — Infrastructure (this document)

- [ ] ICT provides SMTP + sender mailbox  
- [ ] Env vars set on staging/production  
- [ ] `settings.py` wired to env  
- [ ] Smoke tests pass (Section 4)  

### Phase B — Staff notifications (mostly config)

- [ ] Communicate that staff must opt in to email notifications  
- [ ] Ensure `User.email` is correct for all clinical roles  

### Phase C — Patient / employee document email (new features)

| Document | Code starting points | Recipient |
|----------|---------------------|-----------|
| Lab result PDF | `backend/laboratory/`, completed report UI | `patient.email` |
| Radiology report PDF | `backend/radiology/` | `patient.email` |
| Medical certificate | `backend/patients/medical_certificate_pdf.py` | `patient.email` |
| Annual check-up letter | `backend/patients/annual_checkup_pdfs.py` | `patient.email` |
| MR reports | `backend/reports/` | Policy-defined |

Each feature needs UI confirm, API with audit log, validation, and governance sign-off.

### Phase D — Official email enrichment (optional)

- HR / Active Directory sync: personal number → official mailbox  
- Retiree mailing list policy  
- Bounce handling  

---

## 7. Governance & compliance

Before enabling patient-facing email:

- Clinical sign-off on which documents may be emailed  
- Wrong-recipient risk (dependents vs principals)  
- Audit: who sent what, when, to which address  
- PHI in body vs attachment vs secure link  
- NDPR / internal data protection alignment  

---

## 8. Code reference

| Area | Path |
|------|------|
| Mail sender | `backend/common/services.py` — `EmailService` |
| Support ticket notify | `backend/support/views.py` |
| Staff notifications | `backend/notifications/services.py` |
| Admin send API | `backend/common/views.py` — `SendEmailView` |
| Settings | `backend/emr_backend/settings.py` |
| Frontend branding | `frontend/lib/branding.ts` |
| Patient email field | `backend/patients/models.py` |

---

## 9. Open decisions (fill in when ready)

| # | Question | Decision |
|---|----------|----------|
| 1 | Primary SMTP provider (M365 / Exchange / other)? | |
| 2 | Sender address (`emr@` vs `noreply@`)? | |
| 3 | Reply-to for clinical mail? | |
| 4 | Which documents may be emailed in v1? | |
| 5 | Official email: manual chart field vs HR sync? | |
| 6 | Link-only vs PDF attachment policy? | |
| 7 | Go-live approvers (clinical + ICT)? | |

---

## 10. Contacts (organisation — do not put secrets in git)

| Role | Name / team | Contact |
|------|-------------|---------|
| ICT mail / Exchange admin | | |
| EMR application owner | | |
| Clinical governance | | |
| Data protection / compliance | | |

Store credentials in your internal vault, not in this repository.
