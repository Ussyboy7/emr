# Medical Records Reports Comparison: EMR vs NPA-EMR

## Overview
This document compares the medical records reports functionality between the `emr` and `npa-emr` codebases to identify gaps and required improvements.

---

## Current State: EMR (`emr/frontend/app/medical-records/reports/page.tsx`)

### Features Present:
1. **Basic Report Types** (4 types):
   - Medical Certificate
   - Discharge Summary
   - Referral Letter
   - Lab Report

2. **UI Components**:
   - Report type cards
   - Search and filter functionality
   - Recent reports table
   - Dialog-based report creation
   - Report signing workflow

3. **Limitations**:
   - ❌ No backend API integration
   - ❌ Uses mock data (`initialReports: []`)
   - ❌ No date filtering
   - ❌ No export functionality (CSV/Excel)
   - ❌ No separate pages for detailed reports
   - ❌ No analytics or statistics
   - ❌ Hardcoded patient list
   - ❌ No report templates
   - ❌ Limited report customization

---

## Current State: NPA-EMR (`npa-emr/frontend/app/medical-records/reports/`)

### Features Present:

#### 1. **Main Reports Hub** (`page.tsx`)
   - Dashboard-style overview with 11 report types
   - Quick statistics cards
   - Navigate to individual report pages

#### 2. **Individual Report Pages** (11 separate pages):

##### a) **Attendance Summary** (`attendance-summary/page.tsx`)
   - Patient attendance by category (Officers, Staff, Dependents, Retirees, Non-NPA)
   - Employee vs Non-Employee breakdown
   - Date range filtering (month, year, custom range)
   - CSV/Excel export
   - Backend API: `/api/reports/attendance-summary/`

##### b) **Clinic Attendance** (`clinic-attendance/page.tsx`)
   - Specialized clinic reports:
     - Diamond Club
     - Sickle Cell Clinic
     - Healthron
     - Eye Clinic
     - Physiotherapy
   - Filtering by clinic and date range
   - Export capabilities

##### c) **Services & Activities** (`services-activities/page.tsx`)
   - Injections
   - Dressing
   - Sick Leave
   - Referrals
   - Observations
   - Monthly statistics

##### d) **Dispensed Prescriptions** (`dispensed-prescriptions/page.tsx`)
   - Monthly prescription dispensing statistics
   - By patient category
   - Export functionality

##### e) **Laboratory Attendance** (`laboratory-attendance/page.tsx`)
   - Lab services by patient category
   - Monthly breakdown
   - Test type analysis

##### f) **Radiological Services** (`radiological-services/page.tsx`)
   - X-Ray statistics
   - ECG statistics
   - Ultrasound statistics
   - Other imaging services
   - Date filtering

##### g) **Referral Tracking** (`referral-tracking/page.tsx`)
   - New referrals tracking
   - Follow-ups to retainership hospitals
   - Referral status monitoring

##### h) **Disease Pattern** (`disease-pattern/page.tsx`)
   - Top diagnoses analysis
   - Disease trends
   - ICD-10 code statistics
   - Time-series analysis

##### i) **G.O.P Attendance** (`gop-attendance/page.tsx`)
   - General Outpatient attendance
   - By patient category
   - Monthly/Yearly trends

##### j) **Weekend Call Duty** (`weekend-duty/page.tsx`)
   - Weekend attendance statistics
   - After-hours attendance
   - On-call duty reports

##### k) **Comprehensive Report** (`comprehensive/page.tsx`)
   - All-in-one report combining:
     - Total visits
     - Prescriptions (total and dispensed)
     - Lab tests
     - Nursing orders
     - Injections and dressing
     - Category breakdown
     - Monthly trends
   - Year filtering
   - Full export functionality

---

## Key Features in NPA-EMR Missing in EMR

### 1. **Backend Integration**
   - ✅ API service integration (`apiService.get()`)
   - ✅ Proper error handling
   - ✅ Loading states
   - ✅ Data transformation

### 2. **Filtering & Date Range**
   - ✅ Year selection
   - ✅ Month selection
   - ✅ Custom date range
   - ✅ Quick filters (This Month, This Year)

### 3. **Export Functionality**
   - ✅ CSV export
   - ✅ Excel export (FileSpreadsheet)
   - ✅ Print functionality
   - ✅ Formatted exports with headers

### 4. **Analytics & Statistics**
   - ✅ Summary statistics
   - ✅ Percentage calculations
   - ✅ Trend analysis
   - ✅ Category breakdowns
   - ✅ Quick stats dashboard

### 5. **Report Structure**
   - ✅ Separate pages for each report type
   - ✅ Detailed data tables
   - ✅ Charts and visualizations
   - ✅ Comprehensive data views

### 6. **Navigation**
   - ✅ Router-based navigation
   - ✅ Back navigation
   - ✅ Breadcrumb support
   - ✅ DashboardLayout integration

---

## Recommended Implementation Plan for EMR

### Phase 1: Backend API Setup
1. Create report endpoints in `emr/backend/reports/` or `emr/backend/patients/views.py`
2. Implement report generation logic:
   - Attendance Summary
   - Clinic Attendance
   - Services & Activities
   - Prescriptions
   - Lab Tests
   - Referrals
   - Disease Patterns
   - Comprehensive Reports

### Phase 2: Frontend Infrastructure
1. Update `emr/frontend/app/medical-records/reports/page.tsx` to match NPA-EMR structure
2. Create individual report pages in subdirectories
3. Integrate with backend APIs
4. Add loading states and error handling

### Phase 3: Core Reports (Priority Order)
1. **Attendance Summary** - Most commonly used
2. **Dispensed Prescriptions** - Critical for pharmacy operations
3. **Laboratory Attendance** - Important for lab management
4. **Services & Activities** - Operational insights
5. **Comprehensive Report** - Executive summary

### Phase 4: Advanced Reports
1. **Clinic Attendance** - Specialized clinics
2. **Disease Pattern** - Analytics and trends
3. **Referral Tracking** - Referral management
4. **G.O.P Attendance** - Outpatient statistics
5. **Weekend Call Duty** - After-hours reporting
6. **Radiological Services** - Imaging statistics

### Phase 5: Enhanced Features
1. Export functionality (CSV, Excel, PDF)
2. Date range filtering
3. Chart visualizations
4. Report scheduling
5. Email reports
6. Report templates
7. Custom report builder

---

## Code Structure Comparison

### EMR Structure:
```
emr/frontend/app/medical-records/reports/
  └── page.tsx (single page with dialogs)
```

### NPA-EMR Structure:
```
npa-emr/frontend/app/medical-records/reports/
  ├── page.tsx (hub with report cards)
  ├── attendance-summary/page.tsx
  ├── clinic-attendance/page.tsx
  ├── comprehensive/page.tsx
  ├── disease-pattern/page.tsx
  ├── dispensed-prescriptions/page.tsx
  ├── gop-attendance/page.tsx
  ├── laboratory-attendance/page.tsx
  ├── radiological-services/page.tsx
  ├── referral-tracking/page.tsx
  ├── services-activities/page.tsx
  └── weekend-duty/page.tsx
```

---

## API Endpoints Needed (from NPA-EMR)

Based on NPA-EMR implementation, these endpoints should be created:

1. `GET /api/reports/attendance-summary/?year=2024` or `?start_date=...&end_date=...`
2. `GET /api/reports/clinic-attendance/?clinic=...&year=...`
3. `GET /api/reports/services-activities/?year=...`
4. `GET /api/reports/dispensed-prescriptions/?year=...&month=...`
5. `GET /api/reports/laboratory-attendance/?year=...`
6. `GET /api/reports/radiological-services/?year=...`
7. `GET /api/reports/referral-tracking/?year=...`
8. `GET /api/reports/disease-pattern/?year=...`
9. `GET /api/reports/gop-attendance/?year=...`
10. `GET /api/reports/weekend-duty/?year=...`
11. `GET /api/reports/comprehensive/?year=2024`

---

## Migration Strategy

### Option 1: Gradual Migration
- Keep existing simple reports page
- Add new report pages incrementally
- Link from main reports page
- Migrate existing functionality later

### Option 2: Complete Replacement
- Replace current reports page with NPA-EMR structure
- Implement all reports at once
- Requires more development time but cleaner implementation

### Recommendation: **Option 1 (Gradual Migration)**
- Less disruptive
- Allows testing each report individually
- Can prioritize based on user needs
- Maintains existing functionality during transition

---

## Dependencies to Add

Based on NPA-EMR code:
- Ensure `apiService` or equivalent is available
- LoadingState component
- Toast notifications
- Router navigation
- Date handling utilities

---

## Next Steps

1. ✅ Review complete (this document)
2. ⏭️ Decide on migration strategy
3. ⏭️ Create backend API endpoints
4. ⏭️ Implement Attendance Summary report first
5. ⏭️ Test and iterate
6. ⏭️ Roll out additional reports incrementally

---

**Last Updated:** 2025-12-12
**Status:** Analysis Complete - Ready for Implementation Planning

