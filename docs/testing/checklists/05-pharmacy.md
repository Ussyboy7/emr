# UAT Checklist — Pharmacy

| Field | Value |
|-------|-------|
| **Release** | |
| **UAT URL** | |
| **Tester** | |
| **Date** | |
| **Test user** | Pharmacist / Support / HOD |

Guides: [ROLE_PHARMACY.md](../../user/ROLE_PHARMACY.md) · [PHARMACY.md](../../workflows/PHARMACY.md) · **Depends on:** Rx from Consultation (UAT-CON-ROOM-06)

---

## Dashboard — `/pharmacy`

| ☐ | ID | Scenario | P/F/N/A | Notes |
|---|-----|----------|---------|-------|
| ☐ | UAT-PHR-DASH-01 | Pending Rx count matches queue | | |

## Prescriptions — `/pharmacy/prescriptions`

| ☐ | ID | Scenario | P/F/N/A | Notes |
|---|-----|----------|---------|-------|
| ☐ | UAT-PHR-RX-01 | UAT Rx in queue | | |
| ☐ | UAT-PHR-RX-02 | Full dispense + stock decrement | | |
| ☐ | UAT-PHR-RX-03 | Partial dispense / owe balance | | |
| ☐ | UAT-PHR-RX-04 | Topical dispense (tubes/packs) | | |
| ☐ | UAT-PHR-RX-05 | Allergy warning visible | | |

## Dispense History — `/pharmacy/history`

| ☐ | ID | Scenario | P/F/N/A | Notes |
|---|-----|----------|---------|-------|
| ☐ | UAT-PHR-HIS-01 | TD-02 dispensation recorded | | |

## Inventory — `/pharmacy/inventory`

| ☐ | ID | Scenario | P/F/N/A | Notes |
|---|-----|----------|---------|-------|
| ☐ | UAT-PHR-INV-01 | Batch qty after dispense | | |
| ☐ | UAT-PHR-INV-02 | Batch movement history | | |

## Stock Requests — `/pharmacy/requests`

| ☐ | ID | Scenario | P/F/N/A | Notes |
|---|-----|----------|---------|-------|
| ☐ | UAT-PHR-REQ-01 | Request from central store | | |
| ☐ | UAT-PHR-REQ-02 | Receive issued stock | | |

## Drug Master — `/pharmacy/drugs`, `/pharmacy/generics`

| ☐ | ID | Scenario | P/F/N/A | Notes |
|---|-----|----------|---------|-------|
| ☐ | UAT-PHR-MAS-01 | Search brand/generic | | |
| ☐ | UAT-PHR-MAS-02 | Add brand linked to generic | | |

## Central Store — `/pharmacy/store`

| ☐ | ID | Scenario | P/F/N/A | Notes |
|---|-----|----------|---------|-------|
| ☐ | UAT-PHR-STR-01 | Store inventory (Bode Thomas) | | |
| ☐ | UAT-PHR-STR-02 | Issue to dispensary | | |

## HOD Store — `/pharmacy/hod-store` *(HOD @ Bode Thomas only)*

| ☐ | ID | Scenario | P/F/N/A | Notes |
|---|-----|----------|---------|-------|
| ☐ | UAT-PHR-HOD-01 | HOD sees HOD Store menu | | |
| ☐ | UAT-PHR-HOD-02 | Staff pharmacist denied | | |
| ☐ | UAT-PHR-HOD-03 | Issue without prescription | | |
| ☐ | UAT-PHR-HOD-04 | HOD request from central | | |

## Analytics — `/pharmacy/analytics`

| ☐ | ID | Scenario | P/F/N/A | Notes |
|---|-----|----------|---------|-------|
| ☐ | UAT-PHR-ANL-01 | Dispense stats match UAT | | |
| ☐ | UAT-PHR-ANL-02 | HOD segment separate | | |

---

## Sign-off

| Result | ☐ Pass  ☐ Fail |
|--------|----------------|
| **Open defects** | |
| **Tester signature** | |
| **Date** | |
