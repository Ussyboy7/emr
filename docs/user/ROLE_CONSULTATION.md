# Consultation (Doctor) — User Guide

For clinicians starting consultations, documenting encounters, and placing orders.

**Quick start:** [EMR_USER_QUICK_START_GUIDE.md](EMR_USER_QUICK_START_GUIDE.md) · **Workflow:** [VISIT_LIFECYCLE.md](../workflows/VISIT_LIFECYCLE.md)

## Typical sidebar modules

- Consultation dashboard
- Start Consultation
- Room / workspace views
- Wards (inpatient)
- Referrals (if configured)

## Daily tasks

| Task | Path |
|------|------|
| Pick patient from queue | Start Consultation |
| Document encounter | Consultation workspace |
| Order investigations | Lab / radiology from consultation |
| Prescribe | Pharmacy orders from consultation |
| Complete visit | End consultation / close workflow |

## Clinical documentation

- Chief complaint, history, examination, assessment, and plan should be completed per local policy.
- Link orders to the **active visit**.
- Review nursing vitals before documenting.

## Orders

- **Laboratory:** select tests; confirm patient and visit on order summary.
- **Pharmacy:** strength, route, duration per formulary.
- **Radiology:** modality and clinical indication where required.

## Access note

Consultation roles often allow **patient detail** API access for active care but not the full **patient list** — use queue and search flows provided in consultation screens.

## Problems?

- **Patient not on queue:** visit not in progress or nursing not complete.
- **Orders not appearing downstream:** verify visit ID; check module queues with lab/pharmacy lead.
- **Cannot complete consultation:** outstanding required fields or orders — read on-screen validation.

Support: [EMR_SUPPORT_MAINTENANCE.md](../admin/EMR_SUPPORT_MAINTENANCE.md)
