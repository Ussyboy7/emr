# Fix EMR API Connection Issues

## Issue Analysis:
- ✅ Frontend rebuilt successfully
- ❌ API health endpoint returning 404
- ❌ Frontend script not executable

## Solutions:

### 1. Make Script Executable & Run Fix
```bash
# Make script executable
chmod +x fix_frontend_api.sh

# Run the frontend fix
./fix_frontend_api.sh
```

### 2. Check Backend API Routes
The health endpoint might not be configured. Let's check:

```bash
# Check backend logs
docker compose -f docker-compose.prod.yml logs backend --tail=20

# Test different API endpoints
curl http://172.16.0.32/api/
curl http://localhost/api/health/live/

# Check if backend is running
docker compose -f docker-compose.prod.yml ps backend
```

### 3. Check Nginx Configuration
The reverse proxy might not be routing API calls correctly:

```bash
# Check nginx config
docker compose -f docker-compose.prod.yml exec nginx nginx -T | grep -A 10 "location /api/"

# Test nginx directly
curl -H "Host: 172.16.0.32" http://localhost/api/health/live/
```

### 4. Check Backend Health Endpoint
The health endpoint might need to be configured:

```bash
# Check if the health URL is correct
docker compose -f docker-compose.prod.yml exec backend python manage.py shell -c "
from django.urls import reverse
try:
    url = reverse('health_live')
    print(f'Health URL found: {url}')
except:
    print('Health URL not found - checking available URLs...')
    from django.urls import get_resolver
    patterns = [str(p.pattern) for p in get_resolver().url_patterns]
    print('Available URL patterns:', patterns[:10])
"
```

### 5. Quick Test Access
```bash
# Try accessing EMR directly
curl http://172.16.0.32/

# Check if frontend is serving
curl http://localhost:3000/
```

## Most Likely Issues:

1. **Health endpoint URL incorrect** - Check if `/api/health/live/` exists
2. **Nginx proxy misconfiguration** - API routes not forwarding to backend
3. **Django URL configuration** - Health endpoint not registered

## Fix Priority:
1. Run the frontend fix script first
2. Check backend logs for API errors
3. Verify nginx configuration
4. Test EMR access at http://172.16.0.32

**Let's start with making the script executable and running it!** 🔧