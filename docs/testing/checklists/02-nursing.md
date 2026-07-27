# UAT Checklist — Nursing

| Field | Value |
|-------|-------|
| **Release** | |
| **UAT URL** | |
| **Tester** | |
| **Date** | |
| **Test user** | Nursing Officer / Support |

Guide: [ROLE_NURSING.md](../../user/ROLE_NURSING.md) · **Depends on:** TD-01 visit from Medical Records

---

## Dashboard — `/nursing`

| ☐ | ID | Scenario | P/F/N/A | Notes |
|---|-----|----------|---------|-------|
| ☐ | UAT-NRS-DASH-01 | Dashboard / queue counts load | | |

## Pool Queue — `/nursing/pool-queue`

| ☐ | ID | Scenario | P/F/N/A | Notes |
|---|-----|----------|---------|-------|
| ☐ | UAT-NRS-POOL-01 | TD-01 visit visible | | |
| ☐ | UAT-NRS-POOL-02 | Record vitals (BP, pulse, temp) | | |
| ☐ | UAT-NRS-POOL-03 | Advance stage per SOP | | |
| ☐ | UAT-NRS-POOL-04 | Date filter works | | |

## Room Queue — `/nursing/room-queue`

| ☐ | ID | Scenario | P/F/N/A | Notes |
|---|-----|----------|---------|-------|
| ☐ | UAT-NRS-ROOM-01 | Consultation rooms listed | | |
| ☐ | UAT-NRS-ROOM-02 | Doctor on seat → Accepting | | |
| ☐ | UAT-NRS-ROOM-03 | Send patient to accepting room | | |
| ☐ | UAT-NRS-ROOM-04 | Away room blocks send | | |
| ☐ | UAT-NRS-ROOM-05 | Supervisor override with reason | | |
| ☐ | UAT-NRS-ROOM-06 | Override denied without capability | | |

## Vitals History — `/nursing/vitals-history`

| ☐ | ID | Scenario | P/F/N/A | Notes |
|---|-----|----------|---------|-------|
| ☐ | UAT-NRS-VIT-01 | Search TD-02 vitals history | | |
| ☐ | UAT-NRS-VIT-02 | Values match pool entry | | |

## Procedures — `/nursing/procedures`

| ☐ | ID | Scenario | P/F/N/A | Notes |
|---|-----|----------|---------|-------|
| ☐ | UAT-NRS-PROC-01 | Procedures queue loads | | |
| ☐ | UAT-NRS-PROC-02 | Complete procedure order | | |
| ☐ | UAT-NRS-PROC-03 | History shows completion | | |

## Ward Care — `/nursing/wards` (Care · Tasks · Timeline)

| ☐ | ID | Scenario | P/F/N/A | Notes |
|---|-----|----------|---------|-------|
| ☐ | UAT-NRS-WARD-01 | Admitted patients listed | | |
| ☐ | UAT-NRS-WARD-02 | Care tab — snapshot + observation form | | |
| ☐ | UAT-NRS-WARD-03 | Save observation (TD-05) | | |
| ☐ | UAT-NRS-WARD-04 | Tasks shows active only (no Active/History tabs) | | |
| ☐ | UAT-NRS-WARD-05 | Administer pending ward order | | |
| ☐ | UAT-NRS-WARD-06 | Timeline — handover note | | |
| ☐ | UAT-NRS-WARD-07 | Timeline — compact completed orders | | |
| ☐ | UAT-NRS-WARD-08 | Bed assign/change/remove | | |
| ☐ | UAT-NRS-WARD-09 | Complete discharge wizard (if ordered) | | |

## Ward Stock — `/nursing/inventory`

| ☐ | ID | Scenario | P/F/N/A | Notes |
|---|-----|----------|---------|-------|
| ☐ | UAT-NRS-INV-01 | Ward stock list | | |
| ☐ | UAT-NRS-INV-02 | Issue / adjust stock | | |

## Drug Requests — `/nursing/requests`

| ☐ | ID | Scenario | P/F/N/A | Notes |
|---|-----|----------|---------|-------|
| ☐ | UAT-NRS-REQ-01 | Request drug from pharmacy | | |
| ☐ | UAT-NRS-REQ-02 | Confirm receipt | | |

## Analytics — `/nursing/analytics`

| ☐ | ID | Scenario | P/F/N/A | Notes |
|---|-----|----------|---------|-------|
| ☐ | UAT-NRS-ANL-01 | Pool metrics for period | | |

---

## Sign-off

| Result | ☐ Pass  ☐ Fail |
|--------|----------------|
| **Open defects** | |
| **Tester signature** | |
| **Date** | |
