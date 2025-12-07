# Mock Data Strategy - Frontend to Backend Migration

## Current State

### Frontend
- Uses hardcoded `demoData`, `mockData`, `demoOrders`, etc. throughout all pages
- All data is stored in component state (`useState`)
- No API calls for CRUD operations
- Demo mode enabled by default

### Backend
- All models, serializers, and endpoints are implemented
- Ready to serve real data via REST API
- No fixture/mock data created yet

## Strategy Options

### Option 1: Backend Fixtures (Recommended for Development)
**Create seed data in backend that matches frontend mock structure**

**Pros:**
- Same data structure frontend expects
- Easy development and testing
- Can be reset/recreated easily
- No frontend changes needed initially

**Cons:**
- Data only exists when backend runs
- Need to maintain seed script

**Implementation:**
```bash
# Create seed data
python manage.py seed_demo_data

# Reset and recreate
python manage.py seed_demo_data --reset
```

### Option 2: Keep Frontend Mock Data (For Demo/Prototype)
**Keep frontend mock data, add backend later**

**Pros:**
- Works without backend
- Good for demos/prototypes
- No database needed

**Cons:**
- Data doesn't persist
- Not realistic for production

### Option 3: Hybrid Approach (Recommended for Transition)
**Use backend when available, fallback to mock data**

**Pros:**
- Gradual migration
- Can test backend incrementally
- Frontend works with or without backend

**Cons:**
- Need to maintain both
- More complex logic

## Recommended Approach: Backend Fixtures

### 1. Create Management Command ✅
Created `seed_demo_data` command that creates:
- Demo users (admin, doctor, nurse, labtech, pharmacist, radiologist)
- Sample patients (employees, retirees, dependents)
- Lab templates and orders
- Medications and prescriptions
- Radiology orders
- Organization structure

### 2. Frontend Migration Strategy

**Phase 1: Add Backend API Calls (Keep Mock Data as Fallback)**
```typescript
// Example: laboratory/orders/page.tsx
const [orders, setOrders] = useState<LabOrder[]>([]);
const [loading, setLoading] = useState(true);
const [useBackend, setUseBackend] = useState(false); // Toggle

useEffect(() => {
  const loadData = async () => {
    try {
      if (useBackend) {
        const data = await apiFetch<LabOrder[]>('/laboratory/orders/');
        setOrders(data);
      } else {
        setOrders(demoOrders); // Fallback to mock
      }
    } catch (error) {
      console.error('Failed to load from backend, using mock data');
      setOrders(demoOrders); // Fallback on error
    } finally {
      setLoading(false);
    }
  };
  loadData();
}, [useBackend]);
```

**Phase 2: Replace Mock Data Module by Module**
- Start with one module (e.g., Laboratory)
- Test thoroughly
- Then migrate next module

**Phase 3: Remove Mock Data**
- Once all modules work with backend
- Remove all `demoData` constants
- Remove demo mode toggle

## Backend Seed Data Structure

The `seed_demo_data` command creates data that matches frontend expectations:

### Users
- **admin** - System Administrator
- **doctor** - Medical Doctor
- **nurse** - Nursing Officer
- **labtech** - Laboratory Scientist
- **pharmacist** - Pharmacist
- **radiologist** - Radiologist
- **records** - Medical Records Officer

**Password for all:** `ChangeMe123!`

### Patients
- Employee patients with work info
- Retiree patients (no work fields)
- Dependent patients
- Mix of genders, blood groups, etc.

### Lab Data
- Common lab templates (CBC, FBS, LIP, LFT, etc.)
- Sample lab orders with tests
- Various test statuses

### Pharmacy Data
- Common medications
- Inventory with batches
- Sample prescriptions

### Organization
- Headquarters Clinic
- General Practice Department
- Consultation Room 1

## Usage

### Development Setup
```bash
# 1. Run migrations
python manage.py makemigrations
python manage.py migrate

# 2. Create seed data
python manage.py seed_demo_data

# 3. Start server
python manage.py runserver 8001
```

### Reset Data
```bash
# Delete all and recreate
python manage.py seed_demo_data --reset
```

### Production
- Do NOT run seed command in production
- Use real data migration from existing systems
- Or manually create initial data

## Frontend Changes Needed

### 1. Add API Service Layer
Create service files that match frontend expectations:
- `lib/services/lab-service.ts`
- `lib/services/pharmacy-service.ts`
- `lib/services/radiology-service.ts`
- etc.

### 2. Update Pages
Replace `useState(demoData)` with:
```typescript
const [data, setData] = useState<DataType[]>([]);
const [loading, setLoading] = useState(true);

useEffect(() => {
  const load = async () => {
    try {
      const result = await service.getData();
      setData(result);
    } catch (error) {
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  };
  load();
}, []);
```

### 3. Update Forms
Replace local state updates with API calls:
```typescript
const handleSubmit = async () => {
  try {
    const result = await service.create(data);
    toast.success('Created successfully');
    // Refresh data
  } catch (error) {
    toast.error('Failed to create');
  }
};
```

## Migration Checklist

- [ ] Create backend seed data command ✅
- [ ] Test seed data creation
- [ ] Create API service layer in frontend
- [ ] Migrate Laboratory module
- [ ] Migrate Pharmacy module
- [ ] Migrate Radiology module
- [ ] Migrate Consultation module
- [ ] Migrate Nursing module
- [ ] Migrate Patients module
- [ ] Migrate Admin module
- [ ] Remove all mock data from frontend
- [ ] Remove demo mode toggle
- [ ] Update environment variables

## Next Steps

1. **Test Seed Command**: Run `python manage.py seed_demo_data` to create test data
2. **Verify Data**: Check that created data matches frontend expectations
3. **Create API Services**: Start with Laboratory service as proof of concept
4. **Gradual Migration**: Migrate one module at a time

The backend is ready - now we need to connect the frontend to it!

