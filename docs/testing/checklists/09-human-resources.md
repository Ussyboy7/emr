# UAT Checklist — Human Resources

| Field | Value |
|-------|-------|
| **Release** | |
| **UAT URL** | |
| **Tester** | |
| **Date** | |
| **Test user** | HR Officer (with `hr_compliance_manage`) |

**Test patient:** TD-06 (employee due annual check-up)

---

## Dashboard — `/hr`

| ☐ | ID | Scenario | P/F/N/A | Notes |
|---|-----|----------|---------|-------|
| ☐ | UAT-HR-DASH-01 | Compliance summary loads | | |

## Annual Check-ups — `/hr/annual-checkups`

| ☐ | ID | Scenario | P/F/N/A | Notes |
|---|-----|----------|---------|-------|
| ☐ | UAT-HR-ACU-01 | Find TD-06; status correct | | |
| ☐ | UAT-HR-ACU-02 | Filter / export | | |
| ☐ | UAT-HR-ACU-03 | Doctor sign-off → compliant | | |

## Exemptions — `/hr/exemptions`

| ☐ | ID | Scenario | P/F/N/A | Notes |
|---|-----|----------|---------|-------|
| ☐ | UAT-HR-EXM-01 | Create approved exemption | | |
| ☐ | UAT-HR-EXM-02 | Write denied without capability | | |

---

## Sign-off

| Result | ☐ Pass  ☐ Fail |
|--------|----------------|
| **Open defects** | |
| **Tester signature** | |
| **Date** | |
