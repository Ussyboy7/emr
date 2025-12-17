# Modal Review and Standardization

## Issues Found

### 1. Inconsistent Sizing
- **20+ different max-width values** found across modals:
  - `sm:max-w-[400px]` (18 instances)
  - `sm:max-w-[500px]` (18 instances)
  - `sm:max-w-[600px]` (11 instances)
  - `sm:max-w-[700px]` (6 instances)
  - `sm:max-w-[750px]` (2 instances)
  - `sm:max-w-[800px]` (1 instance)
  - `max-w-2xl`, `max-w-3xl`, `max-w-4xl`, `max-w-5xl` (various)
  - `max-w-md`, `max-w-lg` (various)

### 2. Inconsistent Max-Height
- `max-h-[80vh]` - Some modals
- `max-h-[85vh]` - Some modals
- `max-h-[90vh]` - Most modals
- Missing - Some modals have no max-height constraint

### 3. Inconsistent Overflow Handling
- `overflow-y-auto` - Most scrollable modals
- `overflow-hidden` - Some modals (usually with flex layouts)
- Missing - Some modals have no overflow handling

### 4. Responsiveness Issues
- Some modals use `sm:` prefix (responsive)
- Some modals use fixed `max-w-*` (not responsive on mobile)
- PatientOverviewModal uses `max-w-[95vw]` (good for mobile)
- Most modals don't have `w-[95vw]` for mobile-first approach

### 5. Missing Mobile Optimization
- Many modals don't account for small screens
- No consistent padding/margin adjustments for mobile
- Some modals may overflow on mobile devices

## Standardization System

Created: `components/ui/modal-sizes.ts`

### Standard Sizes

1. **SM (Small)** - `sm:max-w-[400px]`
   - Use for: Simple confirmations, alerts, small forms
   - Mobile: Full width with padding

2. **MD (Medium)** - `sm:max-w-[600px]`
   - Use for: Standard forms, detail views, single-item displays
   - Mobile: Full width with padding

3. **LG (Large)** - `sm:max-w-[800px]`
   - Use for: Complex forms, multi-section views, tables with data
   - Mobile: Full width with padding

4. **XL (Extra Large)** - `sm:max-w-[1000px]`
   - Use for: Very complex forms, large data tables, multi-column layouts
   - Mobile: Full width with padding

5. **FULL (Full Width)** - `max-w-[95vw]`
   - Use for: Patient overview, visit details, comprehensive dashboards
   - Mobile: Full width

### Standard Pattern

All modals should follow this pattern:
```tsx
<DialogContent className={MODAL_SIZES.md}>
  <DialogHeader>
    <DialogTitle>Title</DialogTitle>
    <DialogDescription>Description</DialogDescription>
  </DialogHeader>
  
  <div className="overflow-y-auto max-h-[calc(90vh-8rem)]">
    {/* Content */}
  </div>
  
  <DialogFooter>
    {/* Actions */}
  </DialogFooter>
</DialogContent>
```

### Key Principles

1. **Mobile-First**: Always use `w-[95vw]` for mobile, then `sm:max-w-[...]` for larger screens
2. **Consistent Height**: Use `max-h-[90vh]` for all modals
3. **Proper Overflow**: Use `overflow-y-auto` for scrollable content
4. **Flex Layouts**: Use `overflow-hidden flex flex-col` when modal uses flex layout
5. **Content Area**: For long content, wrap in scrollable div with `max-h-[calc(90vh-8rem)]` to account for header/footer

## Files to Update

### High Priority (Most Used)
1. `app/medical-records/patients/page.tsx` - Edit modal, Filter modal
2. `app/pharmacy/prescriptions/page.tsx` - View modal, Dispense modal
3. `app/laboratory/orders/page.tsx` - Multiple modals
4. `app/laboratory/verification/page.tsx` - View, Verify, Reject modals
5. `app/laboratory/completed/page.tsx` - View modal
6. `app/radiology/studies/page.tsx` - Multiple modals
7. `app/radiology/verification/page.tsx` - View, Verify, Reject modals
8. `app/radiology/reports/page.tsx` - View modal
9. `app/nursing/patient-vitals/page.tsx` - History modal
10. `app/nursing/pool-queue/page.tsx` - View modals

### Medium Priority
11. `app/medical-records/visits/new/page.tsx`
12. `app/medical-records/visits/page.tsx`
13. `app/consultation/room/[roomId]/page.tsx`
14. `app/pharmacy/history/page.tsx`
15. `app/admin/*` - All admin modals

### Low Priority (Already Good)
- `components/PatientOverviewModal.tsx` - Already uses good pattern
- `components/VisitDetailModal.tsx` - Check and standardize if needed

## Implementation Steps

1. ✅ Created `modal-sizes.ts` with standardized sizes
2. ⏳ Update high-priority modals first
3. ⏳ Update medium-priority modals
4. ⏳ Review and update low-priority modals
5. ⏳ Test on mobile devices
6. ⏳ Document any exceptions

## Testing Checklist

- [ ] All modals work on mobile (< 640px)
- [ ] All modals work on tablet (640px - 1024px)
- [ ] All modals work on desktop (> 1024px)
- [ ] Scrollable content scrolls properly
- [ ] Headers and footers remain visible
- [ ] Close button is accessible
- [ ] No horizontal overflow
- [ ] Consistent spacing and padding

