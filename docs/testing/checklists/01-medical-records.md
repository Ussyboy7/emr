# UAT Checklist — Medical Records

| Field | Value |
|-------|-------|
| **Release** | |
| **UAT URL** | |
| **Tester** | |
| **Date** | |
| **Test user** | Medical Records Officer / Support |

Guide: [ROLE_MEDICAL_RECORDS.md](../../user/ROLE_MEDICAL_RECORDS.md)

---

## Dashboard — `/medical-records`

| ☐ | ID | Scenario | P/F/N/A | Notes |
|---|-----|----------|---------|-------|
| ☐ | UAT-MR-DASH-01 | Dashboard loads without error | | |
| ☐ | UAT-MR-DASH-02 | Pharmacist denied access (RBAC) | | |

## Register Patient — `/medical-records/patients/new`

| ☐ | ID | Scenario | P/F/N/A | Notes |
|---|-----|----------|---------|-------|
| ☐ | UAT-MR-REG-01 | Register TD-01 (new employee) | | |
| ☐ | UAT-MR-REG-02 | Duplicate search warning | | |
| ☐ | UAT-MR-REG-03 | Register TD-03 (dependent) | | |
| ☐ | UAT-MR-REG-04 | Register TD-04 (non-NPA) | | |
| ☐ | UAT-MR-REG-05 | Photo upload on patient | | |
| ☐ | UAT-MR-REG-06 | Support without page denied | | |

## Manage Patients — `/medical-records/patients`

| ☐ | ID | Scenario | P/F/N/A | Notes |
|---|-----|----------|---------|-------|
| ☐ | UAT-MR-PAT-01 | Search by name / ID / PN | | |
| ☐ | UAT-MR-PAT-02 | Edit demographics (TD-02) | | |
| ☐ | UAT-MR-PAT-03 | Patient detail tabs | | |
| ☐ | UAT-MR-PAT-04 | Merge duplicate (with capability) | | |
| ☐ | UAT-MR-PAT-05 | Merge denied without capability | | |

## Patient Records — `/medical-records/patient-records`

| ☐ | ID | Scenario | P/F/N/A | Notes |
|---|-----|----------|---------|-------|
| ☐ | UAT-MR-REC-01 | Lookup TD-02 | | |
| ☐ | UAT-MR-REC-02 | Same data visible to doctor | | |

## Visits — `/medical-records/visits`

| ☐ | ID | Scenario | P/F/N/A | Notes |
|---|-----|----------|---------|-------|
| ☐ | UAT-MR-VIS-01 | Create visit for TD-01 | | |
| ☐ | UAT-MR-VIS-02 | Edit visit details | | |
| ☐ | UAT-MR-VIS-03 | Visit in nursing pool | | |
| ☐ | UAT-MR-VIS-04 | Cancel visit | | |

## Appointments — `/medical-records/appointments`

| ☐ | ID | Scenario | P/F/N/A | Notes |
|---|-----|----------|---------|-------|
| ☐ | UAT-MR-APT-01 | Schedule appointment (TD-02) | | |
| ☐ | UAT-MR-APT-02 | Reschedule | | |
| ☐ | UAT-MR-APT-03 | Check-in / visit link | | |

## Referrals — `/medical-records/referrals`

| ☐ | ID | Scenario | P/F/N/A | Notes |
|---|-----|----------|---------|-------|
| ☐ | UAT-MR-REF-01 | Referral matches consultation | | |
| ☐ | UAT-MR-REF-02 | Records processing step | | |

## ICD-10 Coding — `/medical-records/coding`

| ☐ | ID | Scenario | P/F/N/A | Notes |
|---|-----|----------|---------|-------|
| ☐ | UAT-MR-ICD-01 | Search diagnosis catalog | | |
| ☐ | UAT-MR-ICD-02 | Code picker in workflow | | |

## Diagnosis Review — `/medical-records/diagnosis-review`

| ☐ | ID | Scenario | P/F/N/A | Notes |
|---|-----|----------|---------|-------|
| ☐ | UAT-MR-DXR-01 | Review queue loads | | |
| ☐ | UAT-MR-DXR-02 | Correct ICD-10 code | | |
| ☐ | UAT-MR-DXR-03 | Doctor without page denied | | |

## Reports — `/medical-records/reports`

| ☐ | ID | Scenario | P/F/N/A | Notes |
|---|-----|----------|---------|-------|
| ☐ | UAT-MR-RPT-01 | Attendance statistics | | |
| ☐ | UAT-MR-RPT-02 | Clinic statistics | | |
| ☐ | UAT-MR-RPT-03 | New registrations | | |
| ☐ | UAT-MR-RPT-04 | Lab statistics | | |
| ☐ | UAT-MR-RPT-05 | Patient demographics | | |
| ☐ | UAT-MR-RPT-06 | Export CSV/PDF | | |
| ☐ | UAT-MR-RPT-07 | Dispensed prescriptions | | |

## Referral Facilities — `/medical-records/settings/referral-facilities`

| ☐ | ID | Scenario | P/F/N/A | Notes |
|---|-----|----------|---------|-------|
| ☐ | UAT-MR-RFF-01 | List facilities | | |
| ☐ | UAT-MR-RFF-02 | Add/edit facility | | |

---

## Sign-off

| Result | ☐ Pass  ☐ Fail |
|--------|----------------|
| **Open defects** | |
| **Tester signature** | |
| **Date** | |
