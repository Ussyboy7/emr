# Frontend-Backend Integration Guide

This document outlines how the frontend connects to the backend API.

## API Service Layer

All API services are located in `/frontend/lib/services/`:

- `lab-service.ts` - Laboratory orders, tests, results
- `patient-service.ts` - Patient management
- `pharmacy-service.ts` - Prescriptions, medications, inventory
- `radiology-service.ts` - Radiology orders, studies, reports

## API Client

The API client (`/frontend/lib/api-client.ts`) handles:
- JWT token authentication
- Automatic token refresh
- Request/response interceptors
- Error handling

## Data Transformation

Backend uses `snake_case`, frontend uses `camelCase`. Transformation utilities are in `/frontend/lib/services/transformers.ts`.

### Status Mapping

**Lab Test Status:**
- Backend: `pending`, `sample_collected`, `processing`, `results_ready`, `verified`
- Frontend: `Pending`, `Sample Collected`, `Processing`, `Results Ready`, `Verified`

**Priority:**
- Backend: `routine`, `urgent`, `stat`
- Frontend: `Routine`, `Urgent`, `STAT`

**Processing Method:**
- Backend: `in_house`, `outsourced`
- Frontend: `In-house`, `Outsourced`

## Backend API Endpoints

### Laboratory
- `GET /api/v1/laboratory/orders/` - List all lab orders
- `GET /api/v1/laboratory/orders/{id}/` - Get single order
- `POST /api/v1/laboratory/orders/{id}/collect_sample/` - Collect sample
- `POST /api/v1/laboratory/orders/{id}/process/` - Start processing
- `POST /api/v1/laboratory/orders/{id}/submit_results/` - Submit results
- `GET /api/v1/laboratory/verification/` - Get pending verifications
- `POST /api/v1/laboratory/verification/{id}/verify/` - Verify result

### Patients
- `GET /api/v1/patients/` - List all patients
- `POST /api/v1/patients/` - Create patient
- `GET /api/v1/patients/{id}/` - Get single patient
- `PATCH /api/v1/patients/{id}/` - Update patient

### Pharmacy
- `GET /api/v1/pharmacy/prescriptions/` - List prescriptions
- `POST /api/v1/pharmacy/prescriptions/{id}/dispense/` - Dispense medication

### Radiology
- `GET /api/v1/radiology/orders/` - List radiology orders
- `POST /api/v1/radiology/orders/{id}/schedule/` - Schedule study
- `POST /api/v1/radiology/orders/{id}/acquire/` - Complete acquisition

## Integration Steps

1. **Remove mock data** - Delete `demoOrders`, `demoData`, etc.
2. **Import API service** - `import { labService } from '@/lib/services'`
3. **Use React hooks** - `useState` for data, `useEffect` for fetching
4. **Handle loading/error states** - Show loading spinner, error messages
5. **Transform data** - Use transformers for status/priority mapping
6. **Update on actions** - Refetch data or update local state after mutations

## Example: Laboratory Orders Page

```typescript
import { useState, useEffect } from 'react';
import { labService } from '@/lib/services';
import { toast } from 'sonner';

export default function LabOrdersPage() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadOrders();
  }, []);

  const loadOrders = async () => {
    try {
      setLoading(true);
      const response = await labService.getOrders();
      setOrders(response.results);
      setError(null);
    } catch (err) {
      setError(err.message);
      toast.error('Failed to load orders');
    } finally {
      setLoading(false);
    }
  };

  const handleCollectSample = async (orderId: number, testId: number) => {
    try {
      await labService.collectSample(orderId, testId);
      toast.success('Sample collected');
      await loadOrders(); // Refresh data
    } catch (err) {
      toast.error('Failed to collect sample');
    }
  };

  // ... rest of component
}
```

## Environment Variables

Set `NEXT_PUBLIC_API_URL` in `.env.local`:
```
NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1
```

## Authentication

The API client automatically:
1. Attaches JWT token from localStorage
2. Refreshes token if expired
3. Redirects to login if authentication fails

## Error Handling

All API errors are caught and displayed via toast notifications. Use try-catch blocks for all API calls.


