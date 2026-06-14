# EMR: Annual Employee Check-up + HR Module + Oracle HR Sync

**Status (Jun 2026):** P1 annual check-up — **implemented**. Oracle HR sync — **deferred**. HR compliance dashboard — **P2**.

---

## P1 (implemented)

Clinical workflow for employee annual check-ups:

- Visit type `annual_checkup` on `Visit`
- `AnnualCheckup` model (OneToOne → Visit): programme year, components, fitness outcome, clinical PDF
- API: `/api/v1/annual-checkups/` — list, retrieve, create, patch, sign-off, report PDF
- Frontend: visit type on Medical Records → Create Visit; **Annual** tab in consultation room
- Doctor-only sign-off (`system_role = Medical Doctor`)

### Locked decisions

| Topic | Decision |
| --- | --- |
| Programme year | Jan–Dec calendar year |
| Cohort | `Patient.category=employee` AND `is_active=True` |
| Sign-off | Medical Doctor only |
| Due cutoff (v1) | No hard cutoff — soft programme year only |
| Exemptions / HR dashboard | P2 |

### Tier A components (every employee, every year)

| Code | Label |
| --- | --- |
| `vitals` | Vitals (BP, HR, Temp, SpO₂, RR) |
| `anthropometry` | Anthropometry & BMI |
| `vision_acuity` | Visual acuity (Snellen) — skippable |
| `lab_fbc` | FBC — skippable |
| `lab_fbs` | FBS — skippable |
| `lab_urinalysis` | Urinalysis — skippable |
| `history_review` | Medical history review |
| `physical_exam` | Physical examination |
| `fitness_assessment` | Doctor fitness assessment |

### Tier B auto-rules (at visit creation)

| Component | Trigger |
| --- | --- |
| ECG | Age ≥ 40 OR BMI ≥ 30 OR family cardiac history |
| HbA1c + lipid profile | Age ≥ 40 OR known IFG |
| Mammography | Female, age ≥ 40 |
| Pap smear | Female, age ≥ 25 |
| PSA | Male, age ≥ 50 |
| Chest X-ray | Smoker (desk-role 3-year rule → v2) |

Tier C (role-specific) deferred to v2.

---

## P2 (planned)

- Human Resources role + privacy-bounded pages
- Compliance dashboard (attended / not attended / in progress / exempt)
- `AnnualCheckupExemption` model
- HR-safe outcome letter PDF (separate from clinical `report_pdf`)
- CSV export for auditors

---

## Oracle EBS HRMS sync (deferred)

One-way read-only sync: Oracle → EMR employee roster.

### Preferred integration

- DBA view `HR.V_EMR_EMPLOYEE_FEED`
- Read-only user `EMR_HR_SYNC`
- `python-oracledb` thin mode
- Celery beat → `sync_oracle_hr` management command

### Non-negotiable sync rules

- Upsert by `personal_number`; never hard-delete patients
- HR-owned fields only; never overwrite clinic-collected clinical/contact overrides
- Refuse bulk deactivate >10% without explicit flag
- Conflict queue for personal_number mismatches
- `--dry-run` default for first 2 weeks in production
- Audit every change; diff report each run

### NPA IT checklist (when ready)

1. Read-only Oracle user `EMR_HR_SYNC`
2. View `HR.V_EMR_EMPLOYEE_FEED` (or equivalent grants)
3. Network: EMR subnet → Oracle `:1521`
4. TNS/DSN for UAT and PROD
5. TLS (`TCPS`?) requirement
6. UAT credentials for development
7. Local conventions: personal number field, retirement codes, Officer vs Staff
8. Export `HR_LOCATIONS_ALL` for Clinic FK mapping
9. Test/UAT instance (never develop against prod)

### Planned app structure

```
backend/oracle_hr/
  services.py
  transforms.py
  conflict.py
  tasks.py
  management/commands/sync_oracle_hr.py
```

Env: `ORACLE_HR_ENABLED`, `ORACLE_HR_USER`, `ORACLE_HR_PASSWORD`, `ORACLE_HR_DSN`, `ORACLE_HR_VIEW`.

---

## AD/SSO (separate future track)

- `django-auth-ldap` or SAML/OIDC
- AD groups → `system_role` (e.g. `EMR-Doctors`, `EMR-HR`)

---

## Privacy (HR access — P2)

- HR default: compliance + fitness outcome only
- Clinical detail requires explicit doctor action, not a permission toggle
- Audit HR reads of outcome data
