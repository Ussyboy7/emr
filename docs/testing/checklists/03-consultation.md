# UAT Checklist — Consultation (Doctors)

| Field | Value |
|-------|-------|
| **Release** | |
| **UAT URL** | |
| **Tester** | |
| **Date** | |
| **Test user** | Medical Doctor |
| **Room** | |

Guide: [ROLE_CONSULTATION.md](../../user/ROLE_CONSULTATION.md) · **Depends on:** Nursing vitals on TD-01

---

## Dashboard — `/consultation`

| ☐ | ID | Scenario | P/F/N/A | Notes |
|---|-----|----------|---------|-------|
| ☐ | UAT-CON-DASH-01 | Dashboard / queue loads | | |

## Start Consultation — `/consultation/start`

| ☐ | ID | Scenario | P/F/N/A | Notes |
|---|-----|----------|---------|-------|
| ☐ | UAT-CON-START-01 | Pick patient from queue | | |
| ☐ | UAT-CON-START-02 | Nursing vitals visible | | |
| ☐ | UAT-CON-START-03 | Room presence on seat | | |

## Consultation Room — `/consultation/room/[roomId]`

| ☐ | ID | Scenario | P/F/N/A | Notes |
|---|-----|----------|---------|-------|
| ☐ | UAT-CON-ROOM-01 | Start session | | |
| ☐ | UAT-CON-ROOM-02 | Document complaint / exam / plan | | |
| ☐ | UAT-CON-ROOM-03 | Add ICD-10 diagnosis | | |
| ☐ | UAT-CON-ROOM-04 | Lab order → lab queue | | |
| ☐ | UAT-CON-ROOM-05 | Radiology order → rad queue | | |
| ☐ | UAT-CON-ROOM-06 | Pharmacy Rx → pharmacy queue | | |
| ☐ | UAT-CON-ROOM-07 | Nursing procedure order | | |
| ☐ | UAT-CON-ROOM-08 | Physio order → physio queue | | |
| ☐ | UAT-CON-ROOM-09 | Eye clinic order → eyecare queue | | |
| ☐ | UAT-CON-ROOM-10 | Complete consultation | | |
| ☐ | UAT-CON-ROOM-11 | Annual checkup panel (if used) | | |

## History — `/consultation/history`

| ☐ | ID | Scenario | P/F/N/A | Notes |
|---|-----|----------|---------|-------|
| ☐ | UAT-CON-HIST-01 | Search TD-02 consultations | | |
| ☐ | UAT-CON-HIST-02 | Session detail matches orders | | |

## Ward Rounds — `/consultation/wards`

| ☐ | ID | Scenario | P/F/N/A | Notes |
|---|-----|----------|---------|-------|
| ☐ | UAT-CON-WARD-01 | Admitted patients listed | | |
| ☐ | UAT-CON-WARD-02 | Create ward doctor order | | |
| ☐ | UAT-CON-WARD-03 | Edit/cancel pending order | | |
| ☐ | UAT-CON-WARD-04 | Admission handoff (TD-05) | | |

## Referrals — `/consultation/referrals`

| ☐ | ID | Scenario | P/F/N/A | Notes |
|---|-----|----------|---------|-------|
| ☐ | UAT-CON-REF-01 | Generate external referral | | |
| ☐ | UAT-CON-REF-02 | Same ID in Medical Records | | |

## Analytics — `/consultation/analytics`

| ☐ | ID | Scenario | P/F/N/A | Notes |
|---|-----|----------|---------|-------|
| ☐ | UAT-CON-ANL-01 | Monthly consultation report | | |

---

## Sign-off

| Result | ☐ Pass  ☐ Fail |
|--------|----------------|
| **Open defects** | |
| **Tester signature** | |
| **Date** | |
