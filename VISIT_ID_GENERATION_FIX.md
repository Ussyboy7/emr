# Visit ID Auto-Generation Fix

## Problem
When creating a new visit via the API, the system was failing with:
```
IntegrityError: duplicate key value violates unique constraint "visits_visit_id_key"
DETAIL:  Key (visit_id)=() already exists.
```

The `visit_id` field was being set to an empty string `''`, causing a unique constraint violation because there was already a visit with an empty `visit_id`.

## Root Cause
The `visit_id` field in the `Visit` model had a unique constraint but no automatic generation logic. When the frontend created a visit without providing `visit_id`, it would default to an empty string, violating the unique constraint.

## Solution
Added automatic `visit_id` generation in the `Visit` model's `save()` method, similar to how `Patient` generates `patient_id`.

### Changes Made

1. **Updated Visit Model** (`backend/patients/models.py`):
   - Added `blank=True` to `visit_id` field to allow it to be empty initially
   - Added `generate_visit_id()` method to create unique visit IDs
   - Added `save()` method override to auto-generate `visit_id` for new visits

2. **Visit ID Format**:
   - Format: `VIS-YYYYMMDD-NNNN`
   - Example: `VIS-20241207-0001`
   - Includes collision handling for concurrent creation

### Implementation Details

```python
def generate_visit_id(self):
    """Generate a unique visit_id in the format: VIS-YYYYMMDD-NNNN"""
    if not self.pk and (not self.visit_id or self.visit_id == ''):
        date_str = self.date.strftime('%Y%m%d')
        count = Visit.objects.filter(date=self.date).count()
        sequence = str(count + 1).zfill(4)
        self.visit_id = f"VIS-{date_str}-{sequence}"

def save(self, *args, **kwargs):
    """Override save to auto-generate visit_id for new visits."""
    if not self.pk:
        self.generate_visit_id()
        # Collision handling logic...
        super().save(*args, **kwargs)
```

## Result
✅ New visits automatically get a unique `visit_id` when created
✅ No need to provide `visit_id` when creating visits via API
✅ Format is consistent and human-readable
✅ Handles concurrent creation with collision detection

## Note
If there are existing visits in the database with empty `visit_id`, they may need to be migrated separately using a data migration script.

---

*Fixed: 2024-12-07*

