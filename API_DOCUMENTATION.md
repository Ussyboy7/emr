# API Documentation Guide

## Overview
The NPA EMR backend provides comprehensive API documentation through **drf-spectacular** (OpenAPI 3.0 standard).

## Access Documentation

### 1. **Swagger UI** (Interactive)
**URL**: `http://localhost:8001/api/docs/`

- ✅ Try out API requests directly from the browser
- ✅ See request/response examples
- ✅ Authorize with JWT tokens
- ✅ View request history

### 2. **ReDoc** (Alternative View)
**URL**: `http://localhost:8001/api/redoc/`

- ✅ Clean, searchable documentation
- ✅ Better for reading/reference
- ✅ Mobile-friendly layout
- ✅ Export-ready structure

### 3. **OpenAPI Schema** (Raw Schema)
**URL**: `http://localhost:8001/api/schema/`

- ✅ JSON/YAML format
- ✅ Machine-readable specification
- ✅ Use with code generators or parsers
- ✅ Standard OpenAPI 3.0 format

---

## Configuration

### Backend Settings
Located in [backend/emr_backend/settings.py](../backend/emr_backend/settings.py)

```python
SPECTACULAR_SETTINGS = {
    "TITLE": "NPA EMR API",
    "DESCRIPTION": "API documentation for the NPA EMR platform",
    "VERSION": "1.0.0",
    "SERVE_INCLUDE_SCHEMA": True,  # Enable schema endpoint
    # ... additional settings
}
```

### Key Features
- ✅ Automatic schema generation from Django models & serializers
- ✅ JWT authentication support in Swagger UI
- ✅ Query parameter documentation
- ✅ Request/response examples
- ✅ Enum choice descriptions

---

## Using the Documentation

### Step 1: Start the Server
```bash
cd backend
python manage.py runserver 0.0.0.0:8001
```

### Step 2: Open Swagger UI
Visit: `http://localhost:8001/api/docs/`

### Step 3: Authenticate
1. Click **"Authorize"** button (top right)
2. Paste your JWT access token
3. All requests will include this token

### Step 4: Explore Endpoints
- Browse available endpoints in the left sidebar
- Click an endpoint to expand request/response details
- Click **"Try it out"** to test the endpoint
- See response status codes and examples

---

## API Endpoint Structure

All endpoints follow the pattern:

```
http://localhost:8001/api/v1/{module}/{resource}/
```

### Available Modules
| Module | Endpoints |
|--------|-----------|
| `accounts/` | User management, authentication |
| `patients/` | Patient records, visits, vitals |
| `pharmacy/` | Prescriptions, medications |
| `laboratory/` | Lab tests, results |
| `nursing/` | Nursing orders, vitals monitoring |
| `consultation/` | Consultation notes, reports |
| `radiology/` | Radiology requests, reports |
| `physiotherapy/` | Therapy records |
| `organization/` | Clinic, department, ward info |
| `audit/` | Audit logs |

---

## Example Requests

### Get Current User Info
```bash
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:8001/api/v1/accounts/me/
```

### List Patients
```bash
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:8001/api/v1/patients/?page=1&page_size=25
```

### Create a Visit
```bash
curl -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"patient": 1, "notes": "Follow-up visit"}' \
  http://localhost:8001/api/v1/visits/
```

---

## Authentication

### Getting a Token
```bash
curl -X POST http://localhost:8001/api/v1/accounts/token/ \
  -d "username=user&password=pass"
```

Response:
```json
{
  "access": "eyJ0eXAiOiJKV1QiLCJhbGc...",
  "refresh": "eyJ0eXAiOiJKV1QiLCJhbGc..."
}
```

### Using the Token
```bash
curl -H "Authorization: Bearer $ACCESS_TOKEN" \
  http://localhost:8001/api/v1/accounts/me/
```

---

## Pagination

Most list endpoints support pagination:

```bash
curl "http://localhost:8001/api/v1/patients/?page=2&page_size=50"
```

Query Parameters:
- `page` - Page number (default: 1)
- `page_size` - Items per page (default: 100, max configurable)

---

## Filtering & Search

Many endpoints support filtering and search:

```bash
# Filter by status
curl "http://localhost:8001/api/v1/patients/?status=active"

# Search by name
curl "http://localhost:8001/api/v1/patients/?search=john"

# Ordering
curl "http://localhost:8001/api/v1/patients/?ordering=-created_at"
```

---

## Common HTTP Status Codes

| Code | Meaning |
|------|---------|
| 200 | Success |
| 201 | Created |
| 204 | No Content |
| 400 | Bad Request (validation error) |
| 401 | Unauthorized (missing/invalid token) |
| 403 | Forbidden (insufficient permissions) |
| 404 | Not Found |
| 500 | Server Error |

---

## Troubleshooting

### "401 Unauthorized"
- Check token is valid and not expired
- Ensure token is passed in `Authorization: Bearer <token>` header

### "403 Forbidden"
- Check user has required permissions
- Verify user's role and department settings

### "404 Not Found"
- Verify endpoint path is correct
- Check resource ID exists

### Schema Not Loading
- Ensure `DEBUG=True` in development, or `SERVE_INCLUDE_SCHEMA=True` in production
- Check Django migrations are applied
- Verify `drf-spectacular` is in installed apps

---

## Next Steps

- 📖 Read endpoint documentation in Swagger UI
- 🔐 Configure JWT token expiry in `.env` file
- 🧪 Use Postman/Thunder Client for request collections
- 🤖 Use API schema for code generation tools

