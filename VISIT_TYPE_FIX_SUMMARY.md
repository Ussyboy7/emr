# Visit Type Fix Summary

## Problem
Backend rejected visit_type value: `{"visit_type":["\"Consultation\" is not a valid choice."]}`

## Root Cause
- Backend expects lowercase values: `'consultation'`, `'follow_up'`, `'emergency'`, `'routine'`
- Frontend was using capitalized values like `"Consultation"` or hyphenated `'follow-up'` instead of `'follow_up'`

## Fixes Applied

### 1. Visit Service (`/lib/services/visit-service.ts`)
- ✅ Added `getVisitById` method (alias for `getVisit`)

### 2. New Visit Page (`/visits/new/page.tsx`)
- ✅ Changed `'follow-up'` to `'follow_up'` to match backend
- ✅ Added `'routine'` option

### 3. Visits List Page (`/visits/page.tsx`)
- ✅ Fixed transformVisit fallback from `'Consultation'` to `'consultation'`
- ✅ Updated filter dropdown to use `'follow_up'` instead of `'follow-up'`
- ✅ Fixed edit form dropdown values (lowercase, underscore)
- ✅ Updated `getTypeBadge` and `getTypeColor` to use backend values
- ✅ Added `getVisitTypeLabel` helper for display
- ✅ Updated all type comparisons to use backend values

### 4. Visit Detail Page (`/visits/[id]/page.tsx`)
- ✅ Fixed fallback from `'Consultation'` to `'consultation'`
- ✅ Added logic to handle both numeric and string visit IDs

## Backend Visit Type Choices
```python
VISIT_TYPE_CHOICES = [
    ('consultation', 'Consultation'),
    ('follow_up', 'Follow-up'),      # Note: underscore, not hyphen
    ('emergency', 'Emergency'),
    ('routine', 'Routine Checkup'),
]
```

## Status
✅ All visit type values now match backend expectations
✅ Display labels are shown correctly (Consultation, Follow-up, etc.)
✅ Backend values are used for API calls (consultation, follow_up, etc.)

---

*Fixed: 2024-12-06*


