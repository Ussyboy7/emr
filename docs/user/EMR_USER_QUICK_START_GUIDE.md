# EMR User Quick Start Guide

Getting started with the NPA Electronic Medical Records system. Your IT team will provide the **login URL** and **initial credentials** — do not use shared or default passwords from old documentation.

## Before you start

- **Browser:** Chrome or Edge (recommended), Firefox supported.
- **Login:** Use the URL provided by IT (e.g. `https://<your-emr-host>/login`).
- **Help in app:** `/help` and the notification bell.
- **Clinical workflow overview:** [workflows/VISIT_LIFECYCLE.md](../workflows/VISIT_LIFECYCLE.md)

## Login

1. Open your organisation's EMR login URL.
2. Enter **username** and **password**.
3. After sign-in you land on your **home module** (depends on your role).
4. Use **Sign out** when leaving a shared workstation.

If login fails repeatedly, contact your supervisor or IT — accounts may lock after too many attempts.

## What you see depends on your role

The sidebar only shows modules your role allows. Common patterns:

| Role type | Typical modules |
|-----------|-----------------|
| Medical records | Register patients, visits, appointments, reports |
| Nursing | Queues, vitals, procedures, ward care |
| Doctor / consultation | Start consultation, orders, prescriptions, referrals |
| Laboratory | Lab orders, verification, completed tests |
| Pharmacy | Prescriptions, dispensing, inventory |
| Radiology | Imaging orders, verification, viewer |
| Administration | Users, roles, clinics, system health, audit |

If you need access to a module, ask your administrator to update your **role pages** — not your password.

## Role-specific guides

| Role | Guide |
|------|--------|
| Medical records | [ROLE_MEDICAL_RECORDS.md](ROLE_MEDICAL_RECORDS.md) |
| Nursing | [ROLE_NURSING.md](ROLE_NURSING.md) |
| Consultation / doctors | [ROLE_CONSULTATION.md](ROLE_CONSULTATION.md) |
| Laboratory | [ROLE_LABORATORY.md](ROLE_LABORATORY.md) |
| Pharmacy | [ROLE_PHARMACY.md](ROLE_PHARMACY.md) |
| Administration | [ROLE_ADMINISTRATION.md](ROLE_ADMINISTRATION.md) |

---

## Medical records

| Task | Menu path |
|------|-----------|
| Register new patient | Medical Records → Register Patient |
| Search / edit patients | Medical Records → Manage Patients |
| Lookup records | Medical Records → Patient Records |
| New visit | Medical Records → Create Visit |
| Appointments | Medical Records → Appointments |

## Nursing

| Task | Menu path |
|------|-----------|
| Queue | Nursing → Pool / Room Queue |
| Record vitals | Nursing → Vitals / patient vitals flows |
| Procedures | Nursing → Procedures |

## Consultation (doctors)

| Task | Menu path |
|------|-----------|
| Start visit | Consultation → Start Consultation |
| Room workspace | Open patient from queue / room |
| Orders | Lab, pharmacy, radiology, referrals from consultation screen |

## Laboratory / pharmacy / radiology

Use your module's **Orders** queue for new work and **Verification** (or equivalent) to sign off results. Completed items appear under **Completed** lists.

---

## Tips

- **Search:** Patient search is available from medical records modules.
- **Save:** Save forms before navigating away.
- **Confidentiality:** Do not share login details; log out on shared PCs.
- **Slow performance:** Try refresh; if persistent, report to IT with time and screen.

## Getting help

1. In-app **Help** (`/help`)
2. Department supervisor
3. IT support (contact details from your organisation)

Technical and security issues: see [EMR_SUPPORT_MAINTENANCE.md](../admin/EMR_SUPPORT_MAINTENANCE.md).

---

*For trainers: pair this guide with a short demo using test patients in a training environment.*
