# Mock Data Handling - Quick Guide

## Current Situation

### Frontend
- ✅ All pages use hardcoded `demoData`, `mockData`, `demoOrders`, etc.
- ✅ Data is in component state (`useState(demoOrders)`)
- ✅ No API calls currently
- ✅ Demo mode enabled by default

### Backend
- ✅ All models and endpoints implemented
- ✅ Ready to serve data via REST API
- ⚠️ **No data in database yet** - needs seed data

## Solution: Backend Seed Data

### Created Management Command ✅

A Django management command has been created to seed the database with demo data that matches your frontend mock structure:

```bash
# Create seed data
python manage.py seed_demo_data

# Reset and recreate
python manage.py seed_demo_data --reset
```

### What Gets Created

**Users:**
- admin / ChangeMe123!
- doctor / ChangeMe123!
- nurse / ChangeMe123!
- labtech / ChangeMe123!
- pharmacist / ChangeMe123!
- radiologist / ChangeMe123!

**Sample Data:**
- 5+ patients (employees, retirees, dependents)
- Lab templates (CBC, FBS, LIP, LFT, etc.)
- Medications with inventory
- Sample lab orders
- Sample prescriptions
- Sample radiology orders
- Organization structure (clinic, department, room)

## Migration Strategy

### Option 1: Keep Mock Data + Add Backend (Recommended for Now)
- Frontend continues using mock data
- Backend has seed data for when you're ready to integrate
- Can test backend independently
- Gradual migration when ready

### Option 2: Replace Mock Data with API Calls
- Create API service layer in frontend
- Replace `useState(demoData)` with API calls
- Remove mock data constants
- Full backend integration

## Next Steps

1. **For Development:**
   ```bash
   # Create seed data in backend
   python manage.py seed_demo_data
   
   # Frontend still uses mock data for now
   # Backend ready when you want to integrate
   ```

2. **For Integration (Later):**
   - Create API service files in frontend
   - Replace mock data with API calls module by module
   - Test thoroughly
   - Remove mock data

## Files Created

- `backend/common/management/commands/seed_demo_data.py` - Seed data command
- `backend/MOCK_DATA_STRATEGY.md` - Detailed migration strategy
- `backend/fixtures/create_fixtures.py` - Alternative fixture creation script

## Quick Start

```bash
cd backend

# Create virtual environment (if not exists)
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Run migrations
python manage.py makemigrations
python manage.py migrate

# Create seed data
python manage.py seed_demo_data

# Start server
python manage.py runserver 8001
```

**Result:** Backend will have demo data matching your frontend mock structure!

## Summary

- ✅ Backend has seed data command ready
- ✅ Frontend mock data can stay for now
- ✅ Can test backend independently
- ✅ Migrate to API calls when ready

The backend is ready with seed data that matches your frontend expectations! 🎉

