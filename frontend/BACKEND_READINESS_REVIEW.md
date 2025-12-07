# EMR Frontend - Backend Readiness Review

## Executive Summary

The EMR frontend is **functionally complete** with all UI components and workflows implemented, but requires **significant refactoring** to integrate with the backend API. Currently, the application uses extensive mock/demo data throughout all modules.

## Current State

### ✅ What's Ready

1. **API Client Infrastructure**
   - `lib/api-client.ts` provides a robust `apiFetch` function
   - Token management (access/refresh) is implemented
   - Auto-refresh on 401 errors
   - Error handling is comprehensive
   - Base URL configuration via `NEXT_PUBLIC_API_URL`

2. **Authentication Flow**
   - Login/logout functionality
   - Demo mode for development (can be disabled)
   - User context hook (`useCurrentUser`)
   - Token storage and management

3. **UI Components & Layouts**
   - All pages are built and functional
   - Consistent design system
   - Responsive layouts
   - All modals and dialogs implemented

4. **Module Structure**
   - All major modules are implemented:
     - Consultation
     - Laboratory
     - Pharmacy
     - Radiology
     - Nursing
     - Medical Records
     - Admin

### ⚠️ What Needs Work

## Critical Issues

### 1. **Extensive Mock Data Usage**

**Problem**: Almost every page uses hardcoded demo data instead of API calls.

**Affected Pages**:
- ✅ `app/admin/users/page.tsx` - Uses `demoStaff`
- ✅ `app/admin/roles/page.tsx` - Uses `demoRoles`
- ✅ `app/admin/clinics/page.tsx` - Uses `demoClinics` and `demoDepartments`
- ✅ `app/laboratory/orders/page.tsx` - Uses `demoOrders`
- ✅ `app/laboratory/templates/page.tsx` - Uses `demoTemplates`
- ✅ `app/laboratory/completed/page.tsx` - Uses `demoCompletedTests`
- ✅ `app/laboratory/verification/page.tsx` - Uses `demoResults`
- ✅ `app/pharmacy/prescriptions/page.tsx` - Uses `demoPrescriptions`
- ✅ `app/pharmacy/inventory/page.tsx` - Uses `demoInventory`
- ✅ `app/pharmacy/history/page.tsx` - Uses `demoHistory`
- ✅ `app/radiology/studies/page.tsx` - Uses `demoOrders`
- ✅ `app/radiology/verification/page.tsx` - Uses `demoReports`
- ✅ `app/radiology/reports/page.tsx` - Uses demo data
- ✅ `app/consultation/room/[roomId]/page.tsx` - Uses `demoRooms`, `demoPatients`, `demoMedications`
- ✅ `app/nursing/procedures/page.tsx` - Uses `demoProcedures`
- ✅ `app/nursing/patient-vitals/page.tsx` - Uses demo data
- ✅ `app/nursing/pool-queue/page.tsx` - Uses demo data
- ✅ `app/nursing/room-queue/page.tsx` - Uses demo data
- ✅ `app/medical-records/visits/page.tsx` - Uses demo data
- ✅ `app/dashboard/page.tsx` - Uses demo data
- ✅ `app/notifications/page.tsx` - Uses `demoNotifications`

**Solution**: Replace all `useState` with demo data with `useEffect` hooks that call `apiFetch` to load real data.

### 2. **Missing API Service Layer**

**Problem**: No centralized service layer for different modules. Each page would need to know exact API endpoints.

**Recommended Structure**:
```typescript
// lib/services/lab-service.ts
export const labService = {
  getOrders: () => apiFetch<LabOrder[]>('/laboratory/orders/'),
  getOrder: (id: string) => apiFetch<LabOrder>(`/laboratory/orders/${id}/`),
  collectSample: (orderId: string, data: CollectSampleData) => 
    apiFetch(`/laboratory/orders/${orderId}/collect/`, { method: 'POST', body: JSON.stringify(data) }),
  // ... etc
};
```

**Solution**: Create service files for each module:
- `lib/services/lab-service.ts`
- `lib/services/pharmacy-service.ts`
- `lib/services/radiology-service.ts`
- `lib/services/consultation-service.ts`
- `lib/services/nursing-service.ts`
- `lib/services/patient-service.ts`
- `lib/services/admin-service.ts`

### 3. **API Endpoint Path Inconsistency**

**Problem**: The base URL is set to `http://localhost:8000/api/v1`, but login endpoint uses `/accounts/auth/token/`. This suggests:
- Either the base URL should be `http://localhost:8000/api/v1` and endpoints are `/accounts/auth/token/`
- Or the base URL should be `http://localhost:8000` and endpoints are `/api/v1/accounts/auth/token/`

**Current State**:
- Base URL: `http://localhost:8000/api/v1` (from `getBaseUrl()`)
- Login: `/accounts/auth/token/` (becomes `http://localhost:8000/api/v1/accounts/auth/token/`)
- User Profile: `/accounts/auth/me/` (becomes `http://localhost:8000/api/v1/accounts/auth/me/`)

**Action Required**: Verify with backend team what the actual API structure is:
- Option A: `/api/v1/accounts/auth/token/` (base URL = `http://localhost:8000`)
- Option B: `/accounts/auth/token/` (base URL = `http://localhost:8000/api/v1`)

### 4. **Demo Mode Configuration**

**Current**: Demo mode is enabled by default (`DEMO_MODE = true` in `lib/demo-mode.ts`)

**Recommendation**: 
- Set `DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === 'true'` (default to false)
- Or keep it for development but ensure backend integration works when disabled

### 5. **Missing Error Boundaries**

**Problem**: No error boundaries to catch API errors gracefully.

**Solution**: Add error boundaries for each major module.

### 6. **Loading States**

**Status**: Most pages have loading states, but they're not connected to real API calls yet.

**Action**: Ensure loading states are properly managed when API calls are added.

### 7. **Form Validation**

**Status**: Client-side validation is implemented, but backend validation errors need to be handled.

**Action**: Ensure error messages from backend are properly displayed in forms.

## Required Modifications Before Backend Integration

### Phase 1: API Service Layer (Priority: HIGH)

1. **Create Service Files**
   - Create `lib/services/` directory
   - Implement service files for each module
   - Define TypeScript interfaces for all API responses

2. **Define API Endpoints**
   - Document expected endpoints for each module
   - Create endpoint constants file
   - Ensure consistency with backend team

### Phase 2: Replace Mock Data (Priority: HIGH)

1. **Replace useState with API Calls**
   - For each page, replace `useState(demoData)` with:
     ```typescript
     const [data, setData] = useState<DataType[]>([]);
     const [loading, setLoading] = useState(true);
     
     useEffect(() => {
       const loadData = async () => {
         try {
           setLoading(true);
           const result = await service.getData();
           setData(result);
         } catch (error) {
           toast.error('Failed to load data');
         } finally {
           setLoading(false);
         }
       };
       loadData();
     }, []);
     ```

2. **Update All CRUD Operations**
   - Replace local state updates with API calls
   - Add proper error handling
   - Add success notifications

### Phase 3: Form Submissions (Priority: HIGH)

1. **Update All Forms**
   - Replace mock submissions with API calls
   - Handle validation errors from backend
   - Show appropriate success/error messages

2. **File Uploads**
   - Ensure file upload endpoints are properly configured
   - Handle FormData correctly

### Phase 4: Real-time Updates (Priority: MEDIUM)

1. **WebSocket/Polling**
   - Consider if real-time updates are needed
   - Implement polling or WebSocket connections for:
     - New orders
     - Status updates
     - Notifications

### Phase 5: Testing & Error Handling (Priority: MEDIUM)

1. **Error Boundaries**
   - Add error boundaries for each module
   - Graceful error handling

2. **Loading States**
   - Ensure all loading states work correctly
   - Add skeleton loaders where appropriate

3. **Empty States**
   - Ensure empty states are shown when no data
   - Provide helpful messages

## API Endpoint Expectations

Based on the codebase, here are the expected endpoints:

### Authentication
- `POST /accounts/auth/token/` - Login
- `POST /accounts/auth/token/refresh/` - Refresh token
- `POST /accounts/auth/token/blacklist/` - Logout
- `GET /accounts/auth/me/` - Current user
- `PATCH /accounts/auth/me/` - Update profile
- `POST /accounts/auth/change-password/` - Change password

### Laboratory
- `GET /laboratory/orders/` - List orders
- `GET /laboratory/orders/{id}/` - Get order
- `POST /laboratory/orders/{id}/collect/` - Collect sample
- `POST /laboratory/orders/{id}/process/` - Process sample
- `POST /laboratory/orders/{id}/results/` - Submit results
- `GET /laboratory/templates/` - List templates
- `GET /laboratory/verification/` - Pending verifications
- `POST /laboratory/verification/{id}/verify/` - Verify result

### Pharmacy
- `GET /pharmacy/prescriptions/` - List prescriptions
- `GET /pharmacy/prescriptions/{id}/` - Get prescription
- `POST /pharmacy/prescriptions/{id}/dispense/` - Dispense
- `GET /pharmacy/inventory/` - List medications
- `POST /pharmacy/inventory/{id}/stock/` - Add stock
- `POST /pharmacy/inventory/{id}/adjust/` - Adjust stock
- `GET /pharmacy/history/` - Dispense history

### Radiology
- `GET /radiology/orders/` - List orders
- `GET /radiology/orders/{id}/` - Get order
- `POST /radiology/orders/{id}/schedule/` - Schedule study
- `POST /radiology/orders/{id}/acquire/` - Acquire images
- `POST /radiology/orders/{id}/report/` - Create report
- `GET /radiology/verification/` - Pending verifications
- `POST /radiology/verification/{id}/verify/` - Verify report

### Consultation
- `GET /consultation/rooms/` - List rooms
- `GET /consultation/rooms/{id}/` - Get room
- `GET /consultation/rooms/{id}/queue/` - Get queue
- `POST /consultation/sessions/` - Create session
- `POST /consultation/sessions/{id}/end/` - End session
- `POST /consultation/sessions/{id}/orders/` - Create orders

### Patients
- `GET /patients/` - List patients
- `GET /patients/{id}/` - Get patient
- `POST /patients/` - Create patient
- `PATCH /patients/{id}/` - Update patient
- `GET /patients/{id}/visits/` - Get visits
- `GET /patients/{id}/history/` - Get history

### Admin
- `GET /admin/users/` - List users
- `POST /admin/users/` - Create user
- `PATCH /admin/users/{id}/` - Update user
- `DELETE /admin/users/{id}/` - Delete user
- `GET /admin/roles/` - List roles
- `GET /admin/clinics/` - List clinics

**Note**: These are inferred from the frontend code. **Verify with backend team** before implementation.

## Environment Variables

Required environment variables:
- `NEXT_PUBLIC_API_URL` - Backend API base URL (default: `http://localhost:8000/api/v1`)
- `NEXT_PUBLIC_DEMO_MODE` - Enable demo mode (default: `false`)

## Recommendations

1. **Start with One Module**: Begin with Laboratory module as a proof of concept
2. **Coordinate with Backend**: Ensure API endpoints match expectations
3. **Incremental Migration**: Replace mock data module by module
4. **Testing**: Test each module thoroughly after API integration
5. **Documentation**: Document all API endpoints and expected request/response formats

## Checklist Before Backend Integration

- [ ] Verify API base URL structure with backend team
- [ ] Create API service layer for all modules
- [ ] Define TypeScript interfaces for all API responses
- [ ] Replace mock data in Laboratory module
- [ ] Replace mock data in Pharmacy module
- [ ] Replace mock data in Radiology module
- [ ] Replace mock data in Consultation module
- [ ] Replace mock data in Nursing module
- [ ] Replace mock data in Medical Records module
- [ ] Replace mock data in Admin module
- [ ] Update all form submissions to use API
- [ ] Add error boundaries
- [ ] Test error handling
- [ ] Test loading states
- [ ] Test empty states
- [ ] Configure demo mode to be optional
- [ ] Document all API endpoints
- [ ] Create API integration guide

## Estimated Effort

- **API Service Layer**: 2-3 days
- **Replace Mock Data**: 5-7 days (all modules)
- **Form Submissions**: 2-3 days
- **Error Handling & Testing**: 2-3 days
- **Total**: ~12-16 days of development work

## Conclusion

The EMR frontend is **well-structured and ready for backend integration**, but requires **systematic replacement of mock data with API calls**. The foundation (API client, authentication, UI components) is solid. The main work is connecting the existing UI to real backend endpoints.

**Recommendation**: Start with one module (Laboratory) as a proof of concept, then systematically migrate the rest.




