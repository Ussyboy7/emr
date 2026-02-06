# Generic-to-Brand Medication Workflow Test Plan

## Overview
This document outlines the testing procedure for the newly implemented generic-first medication prescribing workflow.

## Test Scenarios

### 1. Doctor Prescribing Workflow
**Objective**: Verify doctors can prescribe using generic medications only

**Test Steps**:
1. Login as doctor user
2. Navigate to consultation room
3. Search for medications - should show generic medications (not brands)
4. Select a generic medication (e.g., "Paracetamol")
5. Add prescription with dosage, frequency, duration
6. Save prescription
7. Verify prescription is created with generic_id populated and medication_id null

**Expected Results**:
- Medication search shows generic names only
- Prescription saves successfully
- Backend stores generic ID in prescription_items.generic field
- medication field remains null until pharmacist selects brand

### 2. Pharmacy Dispensing Workflow
**Objective**: Verify pharmacists can select brands for generic prescriptions

**Test Steps**:
1. Login as pharmacist user
2. Navigate to Pharmacy > Prescriptions
3. Find prescription with generic-only medications
4. Click "Dispense" for that prescription
5. In dispense modal, verify:
   - Generic medication is displayed
   - "Select Brand" button is available (not "Substitute")
   - Clicking "Select Brand" opens brand selection modal
6. Select available brand from list
7. Complete dispensing process
8. Verify prescription item now has both generic_id and medication_id populated

**Expected Results**:
- Generic medications clearly identified in dispense interface
- Brand selection modal shows available brands with stock information
- Selected brand is properly linked to prescription item
- Dispensing completes successfully

### 3. Brand Selection Modal Functionality
**Objective**: Verify brand selection modal works correctly

**Test Steps**:
1. From pharmacy dispense interface, click "Select Brand" on generic medication
2. Verify modal shows:
   - Generic medication name
   - List of available brands with stock levels
   - Expiry dates for each brand
   - "Near expiry" warnings
3. Select a brand with sufficient stock
4. Confirm selection
5. Verify brand is now associated with the prescription item

**Expected Results**:
- Modal displays correct generic information
- Available brands are filtered by stock availability
- Brand selection updates prescription item correctly
- Stock levels are accurately displayed

### 4. Inventory Integration
**Objective**: Verify proper inventory handling for generic-to-brand workflow

**Test Steps**:
1. Check that generic medications don't show stock levels directly
2. Verify that brand selection shows actual stock availability
3. Test dispensing reduces stock from correct brand inventory
4. Verify low stock warnings work for selected brands

**Expected Results**:
- Generics show as available/pending status
- Brands show actual stock quantities
- Dispensing reduces correct inventory items
- Stock alerts trigger appropriately

### 5. Edge Cases and Error Handling

#### 5.1 No Available Brands
**Test Steps**:
1. Create prescription for generic with no available brands in inventory
2. Try to dispense in pharmacy
3. Verify appropriate error message

**Expected Results**:
- Clear indication that no brands are available
- Option to substitute or mark as unavailable

#### 5.2 Insufficient Stock
**Test Steps**:
1. Select brand with insufficient stock for prescribed quantity
2. Verify system prevents dispensing or shows warning

**Expected Results**:
- Stock validation prevents over-dispensing
- Clear error messages about insufficient stock

#### 5.3 Mixed Prescriptions
**Test Steps**:
1. Create prescription with both generic and brand medications
2. Verify dispense interface handles both correctly
3. Test dispensing workflow for mixed prescription

**Expected Results**:
- Generic medications show "Select Brand" option
- Brand medications show normal dispense options
- Both can be dispensed in same workflow

## Backend API Tests

### Prescription Creation API
- POST /api/v1/pharmacy/prescriptions/ with generic_id only
- Verify medication_id is null in response
- Verify generic_id is properly stored

### Brand Selection API
- PATCH /api/v1/pharmacy/prescription-items/{id}/ with medication_id
- Verify both generic_id and medication_id are populated
- Verify inventory updates correctly

### Available Brands API
- GET /api/v1/pharmacy/generics/{id}/available-brands/
- Verify returns only brands with stock in dispensary
- Verify stock levels are accurate

## Frontend Component Tests

### Consultation Room
- Medication search returns generics only
- Prescription creation stores generic IDs
- UI clearly indicates generic medications

### Pharmacy Dispense Interface
- Generic medications properly identified
- "Select Brand" vs "Substitute" logic works
- Brand selection modal functions correctly
- Stock information displays accurately

### Admin Generics Modal
- Modal opens from admin dashboard
- CRUD operations work correctly
- Filtering and search function properly

## Data Integrity Tests

### Database Relationships
- PrescriptionItem.generic foreign key constraint works
- PrescriptionItem.medication can be null
- GenericMedication to Medication relationships maintained
- Cascade deletes handled appropriately

### Migration Verification
- Existing prescriptions still accessible
- Data migration successful
- No data loss in transition

## Performance Tests

### Search Performance
- Generic medication search response time < 500ms
- Brand availability lookup < 1s
- Large inventory datasets handled efficiently

### Concurrent Access
- Multiple pharmacists can dispense simultaneously
- No race conditions in stock updates
- Database locks handled properly

## Security Tests

### Authorization
- Only doctors can create prescriptions
- Only pharmacists can dispense medications
- Proper role-based access control

### Data Validation
- Generic ID required for prescription items
- Brand selection properly validated
- Stock quantity validation enforced

## Rollback Plan

If issues are found:
1. Revert frontend changes to consultation room
2. Restore original PrescriptionItem model
3. Revert pharmacy dispensing interface changes
4. Restore original generics management page

## Success Criteria

Implementation is successful if:
- [ ] All test scenarios pass
- [ ] No data integrity issues
- [ ] Performance meets requirements
- [ ] User experience is intuitive
- [ ] Error handling is robust
- [ ] Documentation is complete