# New Visit Page - Integration Plan

## Current Status
- Uses mock patients array
- Form submission likely doesn't use API
- Needs integration with:
  - Patient Service (to load patients)
  - Visit Service (to create visits)

## Required Changes

1. **Replace mock patients** with API call to load patients
2. **Integrate form submission** with visitService.createVisit()
3. **Add loading states** for patient search/selection
4. **Add error handling** for API calls
5. **Handle authentication** errors

## Implementation Steps

1. Import patientService and visitService
2. Replace mock patients array with API call
3. Update handleSubmit to use visitService.createVisit()
4. Add loading/error states
5. Redirect to visit detail page after creation

---

*This document will guide the implementation*


