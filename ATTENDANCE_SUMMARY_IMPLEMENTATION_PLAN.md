# Attendance Summary Report - Implementation Plan

## Overview
This document outlines the detailed implementation plan for the Attendance Summary report, the first report to be migrated from NPA-EMR to EMR.

---

## 1. Backend Implementation

### 1.1 Data Model Analysis

**Available Data:**
- `Patient` model with categories:
  - `employee` - Employee (Officers/Staff via `employee_type`)
  - `retiree` - Retiree
  - `dependent` - Dependent (with `dependent_type`: Employee Dependent, Retiree Dependent)
  - `nonnpa` - Non-NPA
- `Visit` model with:
  - `patient` (ForeignKey)
  - `date` (DateField)
  - `status` (scheduled, in_progress, completed, cancelled)

**Data Mapping for Report:**
Based on NPA-EMR, we need:
- **Employee**: `category='employee'` 
  - Officers: `employee_type='Officer'` 
  - Staff: `employee_type='Staff'`
- **Non-Employee**: 
  - Dependents: `category='dependent'`
  - Retirees: `category='retiree'`
  - Non-NPA: `category='nonnpa'`

**Category Breakdown Expected:**
```
Officers (Employee with employee_type='Officer')
Staff (Employee with employee_type='Staff')
Employee Dependents (Dependent with dependent_type='Employee Dependent')
Retiree Dependents (Dependent with dependent_type='Retiree Dependent')
Non-NPA (category='nonnpa')
Retirees (category='retiree')
```

### 1.2 API Endpoint Specification

**Endpoint:** `GET /api/reports/attendance-summary/`

**Query Parameters:**
- `year` (optional): Filter by year (e.g., `year=2024`)
- `start_date` (optional): Start date for date range (format: YYYY-MM-DD)
- `end_date` (optional): End date for date range (format: YYYY-MM-DD)
- If both `start_date` and `end_date` are provided, use date range
- If `year` is provided, filter by year
- If neither, default to current year

**Response Format:**
```json
{
  "data": [
    {
      "sn": 1,
      "category": "Officers",
      "employee": 1250,
      "non_employee": 0,
      "total": 1250,
      "percentage": 35.5
    },
    {
      "sn": 2,
      "category": "Staff",
      "employee": 980,
      "non_employee": 0,
      "total": 980,
      "percentage": 27.8
    },
    {
      "sn": 3,
      "category": "Employee Dependents",
      "employee": 0,
      "non_employee": 650,
      "total": 650,
      "percentage": 18.4
    },
    {
      "sn": 4,
      "category": "Retiree Dependents",
      "employee": 0,
      "non_employee": 320,
      "total": 320,
      "percentage": 9.1
    },
    {
      "sn": 5,
      "category": "Non-NPA",
      "employee": 0,
      "non_employee": 180,
      "total": 180,
      "percentage": 5.1
    },
    {
      "sn": 6,
      "category": "Retirees",
      "employee": 0,
      "non_employee": 150,
      "total": 150,
      "percentage": 4.3
    }
  ],
  "summary": {
    "total_employee": 2230,
    "total_non_employee": 1300,
    "grand_total": 3530
  }
}
```

### 1.3 Implementation Steps

#### Step 1: Add View to `emr/backend/reports/views.py`

```python
class AttendanceSummaryReportView(views.APIView):
    """Generate attendance summary report by patient category."""
    
    permission_classes = [IsAuthenticated]
    
    def get(self, request):
        # Parse query parameters
        year = request.query_params.get('year')
        start_date = request.query_params.get('start_date')
        end_date = request.query_params.get('end_date')
        
        # Build date filter
        visits_queryset = Visit.objects.filter(status__in=['completed', 'in_progress'])
        
        if start_date and end_date:
            from django.utils.dateparse import parse_date
            start = parse_date(start_date)
            end = parse_date(end_date)
            visits_queryset = visits_queryset.filter(date__gte=start, date__lte=end)
        elif year:
            visits_queryset = visits_queryset.filter(date__year=year)
        else:
            # Default to current year
            current_year = timezone.now().year
            visits_queryset = visits_queryset.filter(date__year=current_year)
        
        # Get unique patients per category
        # Officers
        officers_visits = visits_queryset.filter(
            patient__category='employee',
            patient__employee_type='Officer'
        )
        officers_count = officers_visits.values('patient').distinct().count()
        
        # Staff
        staff_visits = visits_queryset.filter(
            patient__category='employee',
            patient__employee_type='Staff'
        )
        staff_count = staff_visits.values('patient').distinct().count()
        
        # Employee Dependents
        emp_dep_visits = visits_queryset.filter(
            patient__category='dependent',
            patient__dependent_type='Employee Dependent'
        )
        emp_dep_count = emp_dep_visits.values('patient').distinct().count()
        
        # Retiree Dependents
        ret_dep_visits = visits_queryset.filter(
            patient__category='dependent',
            patient__dependent_type='Retiree Dependent'
        )
        ret_dep_count = ret_dep_visits.values('patient').distinct().count()
        
        # Non-NPA
        nonnpa_visits = visits_queryset.filter(patient__category='nonnpa')
        nonnpa_count = nonnpa_visits.values('patient').distinct().count()
        
        # Retirees
        retiree_visits = visits_queryset.filter(patient__category='retiree')
        retiree_count = retiree_visits.values('patient').distinct().count()
        
        # Calculate totals
        total_employee = officers_count + staff_count
        total_non_employee = emp_dep_count + ret_dep_count + nonnpa_count + retiree_count
        grand_total = total_employee + total_non_employee
        
        # Build response data
        categories = [
            {
                'sn': 1,
                'category': 'Officers',
                'employee': officers_count,
                'non_employee': 0,
                'total': officers_count,
                'percentage': round((officers_count / grand_total * 100) if grand_total > 0 else 0, 1)
            },
            {
                'sn': 2,
                'category': 'Staff',
                'employee': staff_count,
                'non_employee': 0,
                'total': staff_count,
                'percentage': round((staff_count / grand_total * 100) if grand_total > 0 else 0, 1)
            },
            {
                'sn': 3,
                'category': 'Employee Dependents',
                'employee': 0,
                'non_employee': emp_dep_count,
                'total': emp_dep_count,
                'percentage': round((emp_dep_count / grand_total * 100) if grand_total > 0 else 0, 1)
            },
            {
                'sn': 4,
                'category': 'Retiree Dependents',
                'employee': 0,
                'non_employee': ret_dep_count,
                'total': ret_dep_count,
                'percentage': round((ret_dep_count / grand_total * 100) if grand_total > 0 else 0, 1)
            },
            {
                'sn': 5,
                'category': 'Non-NPA',
                'employee': 0,
                'non_employee': nonnpa_count,
                'total': nonnpa_count,
                'percentage': round((nonnpa_count / grand_total * 100) if grand_total > 0 else 0, 1)
            },
            {
                'sn': 6,
                'category': 'Retirees',
                'employee': 0,
                'non_employee': retiree_count,
                'total': retiree_count,
                'percentage': round((retiree_count / grand_total * 100) if grand_total > 0 else 0, 1)
            }
        ]
        
        # Filter out categories with 0 counts (optional - can keep all)
        categories = [c for c in categories if c['total'] > 0]
        
        return Response({
            'data': categories,
            'summary': {
                'total_employee': total_employee,
                'total_non_employee': total_non_employee,
                'grand_total': grand_total
            }
        })
```

#### Step 2: Add URL Route to `emr/backend/reports/urls.py`

```python
from .views import AttendanceSummaryReportView

urlpatterns = [
    # ... existing patterns ...
    path('reports/attendance-summary/', AttendanceSummaryReportView.as_view(), name='attendance-summary-report'),
]
```

---

## 2. Frontend Implementation

### 2.1 File Structure

Create new file: `emr/frontend/app/medical-records/reports/attendance-summary/page.tsx`

### 2.2 Features to Implement

1. **Date Filtering**
   - Year selector dropdown
   - Date range picker (start date, end date)
   - Quick filters: "This Month", "This Year"
   - View mode toggle: year vs. range

2. **Data Display**
   - Table with columns: S/N, Category, Employee, Non-Employee, Total, %
   - Summary row showing totals
   - Loading state
   - Error handling
   - Empty state

3. **Export Functionality**
   - CSV export button
   - Excel export button (optional)
   - Print functionality

4. **Navigation**
   - Back button to reports hub
   - Breadcrumb navigation
   - Refresh button

### 2.3 Component Structure

```typescript
// Key imports
- React, useState, useEffect
- DashboardLayout
- Card, CardContent, CardHeader, CardTitle
- Button, Input, Label, Select
- Table components
- Icons (Download, FileSpreadsheet, RefreshCw, ArrowLeft, etc.)
- API service (apiFetch or similar)
- Toast notifications
```

### 2.4 Key Functions

1. `fetchReport()` - Calls API endpoint with filters
2. `exportToCSV()` - Generates and downloads CSV
3. `setThisMonth()` - Quick filter helper
4. `setThisYear()` - Quick filter helper

---

## 3. Integration Steps

### Step 1: Backend
1. ✅ Add `AttendanceSummaryReportView` to `reports/views.py`
2. ✅ Add URL route to `reports/urls.py`
3. ✅ Test endpoint with Postman/curl
4. ✅ Verify data accuracy with test data

### Step 2: Frontend
1. ✅ Create `attendance-summary/page.tsx`
2. ✅ Implement data fetching
3. ✅ Implement UI components
4. ✅ Add export functionality
5. ✅ Add error handling

### Step 3: Integration
1. ✅ Update main reports page to link to attendance-summary
2. ✅ Test end-to-end flow
3. ✅ Verify date filtering works
4. ✅ Verify export functionality
5. ✅ Test with real data

### Step 4: Documentation
1. ✅ Update API documentation
2. ✅ Add inline code comments
3. ✅ Document any assumptions

---

## 4. Testing Checklist

### Backend Tests
- [ ] Test with year parameter
- [ ] Test with date range
- [ ] Test with no parameters (defaults to current year)
- [ ] Test with invalid dates
- [ ] Test with empty results
- [ ] Test percentage calculations
- [ ] Test with different patient categories
- [ ] Test with cancelled visits (should be excluded)

### Frontend Tests
- [ ] Test page loads correctly
- [ ] Test data fetching
- [ ] Test year filter
- [ ] Test date range filter
- [ ] Test quick filters
- [ ] Test CSV export
- [ ] Test error handling
- [ ] Test loading states
- [ ] Test empty states
- [ ] Test navigation

### Integration Tests
- [ ] Test full user flow
- [ ] Test with real database data
- [ ] Test performance with large datasets
- [ ] Test mobile responsiveness

---

## 5. Potential Issues & Solutions

### Issue 1: Employee Type Values
**Problem:** `employee_type` field might have different values than expected
**Solution:** Check actual values in database, use case-insensitive filtering

### Issue 2: Dependent Type Values
**Problem:** `dependent_type` might be null or have different format
**Solution:** Add null checks, handle variations

### Issue 3: Visit Status
**Problem:** Should we count all visits or only completed?
**Solution:** Based on NPA-EMR, we count completed and in_progress (exclude cancelled)

### Issue 4: Performance
**Problem:** Large datasets might be slow
**Solution:** Add database indexes on `patient__category`, `patient__employee_type`, `date`

### Issue 5: Date Handling
**Problem:** Timezone issues
**Solution:** Use Django's timezone utilities, ensure consistent date filtering

---

## 6. Future Enhancements

1. Add charts/visualizations
2. Add comparison (year-over-year)
3. Add monthly breakdown
4. Add clinic filtering
5. Add caching for frequently accessed reports
6. Add scheduled report generation

---

## 7. Dependencies

### Backend
- Django REST Framework (already installed)
- Django timezone utilities
- Existing models: Patient, Visit

### Frontend
- Next.js 14+ (already in use)
- React hooks (useState, useEffect)
- API client (apiFetch or similar)
- UI components (already available)

---

## 8. Timeline Estimate

- Backend implementation: 1-2 hours
- Frontend implementation: 2-3 hours
- Testing & debugging: 1-2 hours
- **Total: 4-7 hours**

---

## 9. Success Criteria

✅ Backend endpoint returns correct data structure
✅ Frontend displays data correctly
✅ Date filtering works as expected
✅ CSV export generates correct file
✅ Page is responsive and user-friendly
✅ Error handling works properly
✅ Performance is acceptable (< 2s load time)

---

**Status:** Ready for Implementation
**Next Steps:** Start with backend implementation
**Assigned To:** [To be assigned]
**Priority:** High (First report to migrate)

