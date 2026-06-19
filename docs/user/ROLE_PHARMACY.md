# Pharmacy — User Guide

For pharmacists dispensing prescriptions and managing inventory views.

**Quick start:** [EMR_USER_QUICK_START_GUIDE.md](EMR_USER_QUICK_START_GUIDE.md) · **Pharmacy workflow notes:** [PHARMACY.md](../workflows/PHARMACY.md)

## Typical sidebar modules

- Pharmacy dashboard
- Prescriptions / dispensing queue
- Completed dispensing
- Dispensary inventory
- Dispensary requests (from Central Store)
- Central store (Bode Thomas operators)
- **HOD Store** (Pharmacy Head only — see below)
- Analytics (if enabled)

## Daily tasks

| Task | Path |
|------|------|
| Pending prescriptions | Dispensing queue |
| Dispense medication | Open Rx → dispense |
| Partial dispense / owe | Per local policy on same screen |
| Dispensary stock check | Dispensary inventory |
| Order from Central Store | Dispensary Requests |

## HOD Store (Head of Pharmacy only)

Available at **Bode Thomas Clinic** for the **primary Head of Pharmacy** (not deputy heads). Super admins can also access for support.

| Task | Path |
|------|------|
| View HOD stock | HOD Store → Inventory tab |
| Issue medication (no prescription) | HOD Store → Issue tab |
| Order from Central Store | HOD Requests → Orders to HOD store |
| Confirm receipt from Central Store | HOD Requests → confirm when status is issued |
| View issue history | HOD Dispense History |

**Central Store** staff use **Store Requests → HOD Store** to issue stock to the HOD store or to **request stock back** from the HOD store (From HOD store tab).

HOD issues are tracked separately from prescription dispensing and appear under **Pharmacy Analytics → HOD Store**.

## Dispensing checks

- Patient name, visit, and allergies visible on chart.
- Match drug, strength, route, and quantity to prescription.
- Document counselling or refusal per policy.
- Mark complete only when physically dispensed.

## Problems?

- **Rx not visible:** consultation not finalized or wrong visit.
- **Stock mismatch:** inventory module may be out of sync — follow paper fallback SOP and report to admin.
- **Interaction alerts:** resolve per clinical protocol before dispensing.
- **HOD Store not visible:** you must be the assigned **primary** Pharmacy department head at Bode Thomas, or have the HOD Store pages on your role.

Support: [EMR_SUPPORT_MAINTENANCE.md](../admin/EMR_SUPPORT_MAINTENANCE.md)
