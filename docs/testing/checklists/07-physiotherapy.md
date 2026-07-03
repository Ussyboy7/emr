# UAT Checklist — Physiotherapy

| Field | Value |
|-------|-------|
| **Release** | |
| **UAT URL** | |
| **Tester** | |
| **Date** | |
| **Test user** | Physiotherapist |

Guide: [PHYSIOTHERAPY.md](../../workflows/PHYSIOTHERAPY.md) · **Depends on:** Physio order from Consultation (UAT-CON-ROOM-08)

---

## Dashboard — `/physiotherapy`

| ☐ | ID | Scenario | P/F/N/A | Notes |
|---|-----|----------|---------|-------|
| ☐ | UAT-PHY-DASH-01 | Pending orders count | | |

## Orders — `/physiotherapy/orders`

| ☐ | ID | Scenario | P/F/N/A | Notes |
|---|-----|----------|---------|-------|
| ☐ | UAT-PHY-ORD-01 | UAT order in pending queue | | |
| ☐ | UAT-PHY-ORD-02 | Schedule session | | |
| ☐ | UAT-PHY-ORD-03 | Start session + assessment | | |
| ☐ | UAT-PHY-ORD-04 | Complete session (green button) | | |
| ☐ | UAT-PHY-ORD-05 | End treatment plan | | |
| ☐ | UAT-PHY-ORD-06 | Completed orders tab | | |
| ☐ | UAT-PHY-ORD-07 | Doctor sees status in consultation | | |

## Completed Sessions — `/physiotherapy/completed`

| ☐ | ID | Scenario | P/F/N/A | Notes |
|---|-----|----------|---------|-------|
| ☐ | UAT-PHY-CMP-01 | Session in completed list | | |
| ☐ | UAT-PHY-CMP-02 | Session report accurate | | |

## Analytics — `/physiotherapy/analytics`

| ☐ | ID | Scenario | P/F/N/A | Notes |
|---|-----|----------|---------|-------|
| ☐ | UAT-PHY-ANL-01 | Throughput metrics | | |

---

## Sign-off

| Result | ☐ Pass  ☐ Fail |
|--------|----------------|
| **Open defects** | |
| **Tester signature** | |
| **Date** | |
