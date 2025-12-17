# Patient Overview Modal Refactoring Plan

## Recommended Approach: Component Extraction

### Strategy
Extract large tab content sections into separate component files, then update the main modal to use them.

---

## Component Structure

```
components/
  PatientOverviewModal.tsx (main file - ~500 lines after extraction)
  patient-overview/
    MedicalHistoryTab.tsx (History tab with all sub-tabs)
    TimelineTab.tsx (New timeline view)
    CurrentCareTab.tsx (New current care view)
```

---

## Step-by-Step Implementation

### Phase 1: Extract Medical History Tab (Priority 1)

**Create**: `components/patient-overview/MedicalHistoryTab.tsx`

**Contains**:
- All 6 sub-tabs (Background, Visits & Consultations, Labs, Imaging, Prescriptions, Vitals)
- All filters, pagination logic
- All state management for history tab

**Props**:
```typescript
interface MedicalHistoryTabProps {
  patientDetail: PatientDetail | null;
  visits: Visit[];
  consultationSessions: any[];
  labResults: any[];
  imagingResults: any[];
  prescriptions: any[];
  vitalSigns: any[];
  // All filter/pagination states as props
  historySubTab: string;
  onHistorySubTabChange: (tab: string) => void;
  // ... other handlers
}
```

**Benefits**:
- Reduces main file by ~400 lines
- Makes history tab self-contained
- Easier to test independently

---

### Phase 2: Extract Timeline Tab (Priority 2)

**Create**: `components/patient-overview/TimelineTab.tsx`

**Contains**:
- Timeline view logic
- Event merging/sorting
- Timeline filters

**Props**:
```typescript
interface TimelineTabProps {
  visits: Visit[];
  consultationSessions: any[];
  labResults: any[];
  imagingResults: any[];
  prescriptions: any[];
  vitalSigns: any[];
}
```

**Features**:
- Chronological view of all events
- Grouped by date
- Filterable by type
- Click to view details

---

### Phase 3: Extract Current Care Tab (Priority 2)

**Create**: `components/patient-overview/CurrentCareTab.tsx`

**Contains**:
- Active medications
- Recent prescriptions
- Pending orders
- Active conditions

**Props**:
```typescript
interface CurrentCareTabProps {
  patientDetail: PatientDetail | null;
  prescriptions: any[];
  labResults: any[];
  imagingResults: any[];
  currentCareSubTab: string;
  onCurrentCareSubTabChange: (tab: string) => void;
}
```

---

### Phase 4: Update Main Modal

**In `PatientOverviewModal.tsx`**:

1. Import new components
2. Replace History tab content with `<MedicalHistoryTab />`
3. Add Timeline tab: `<TimelineTab />`
4. Add Current Care tab: `<CurrentCareTab />`
5. Remove redundant main tabs (Lab Results, Prescriptions, Vitals History)
6. Rename "History" to "Medical History"

---

## Final Tab Structure

### Main Tabs (4):
1. **Overview** - Summary, stats, recent items
2. **Timeline** - Chronological view of all activity
3. **Medical History** - Complete organized records (6 sub-tabs)
4. **Current Care** - Active/current items (4 sub-tabs)

---

## Implementation Order

1. ✅ Extract MedicalHistoryTab (includes adding missing sub-tabs)
2. ✅ Update main modal to use MedicalHistoryTab
3. ✅ Create TimelineTab component
4. ✅ Create CurrentCareTab component
5. ✅ Remove redundant tabs from main modal
6. ✅ Rename "History" to "Medical History"

---

## Benefits of This Approach

✅ **Solves timeout issues** - Smaller files process faster
✅ **Better code organization** - Clear separation of concerns
✅ **Easier maintenance** - Each tab is self-contained
✅ **Easier testing** - Components can be tested independently
✅ **Better performance** - React can optimize smaller components
✅ **Reusability** - Components could be reused elsewhere

---

## Alternative: If You Prefer Simpler

If component extraction seems too complex, we could:

1. Make smaller, targeted edits
2. Focus on one section at a time
3. Test after each change

But this will be slower and the file will remain large.

---

*Recommendation: Proceed with component extraction approach*

