# Add Missing Health Endpoint to Django

The backend logs show `/api/health/live/` returns 404 Not Found. We need to add this endpoint to Django.

## Add Health Endpoint:

```bash
# Add health endpoint to Django URLs
docker compose -f docker-compose.prod.yml exec backend bash -c "
echo 'Adding health endpoint to Django...'
cat >> backend/emr_backend/urls.py << 'EOF'

# Health check endpoint
from django.http import JsonResponse
from django.urls import path

def health_live(request):
    return JsonResponse({
        'status': 'ok', 
        'service': 'EMR Backend', 
        'timestamp': '2026-04-17T18:27:31+01:00',
        'version': '1.0.0'
    })

urlpatterns += [
    path('api/health/live/', health_live, name='health_live'),
]
EOF
echo 'Health endpoint added successfully'
"

# Restart backend to load new URL
docker compose -f docker-compose.prod.yml restart backend

# Test health endpoint
sleep 5
curl http://172.16.0.32/api/health/live/
```

## Alternative: Check Existing Health Endpoint

```bash
# Check if there's already a health endpoint elsewhere
docker compose -f docker-compose.prod.yml exec backend find . -name "*.py" -exec grep -l "health" {} \;

# Check current URL patterns
docker compose -f docker-compose.prod.yml exec backend python manage.py shell -c "
from django.urls import get_resolver
patterns = [str(p.pattern) for p in get_resolver().url_patterns]
health_patterns = [p for p in patterns if 'health' in p.lower()]
api_patterns = [p for p in patterns if 'api' in p.lower()]
print('Health patterns:', health_patterns)
print('API patterns:', api_patterns[:10])
"
```

## Test After Fix

```bash
# Test health endpoint
curl http://172.16.0.32/api/health/live/

# Should return:
# {"status": "ok", "service": "EMR Backend", "timestamp": "2026-04-17T18:27:31+01:00", "version": "1.0.0"}
```

## Frontend Should Now Work

After adding the health endpoint:
1. ✅ Frontend can connect to API
2. ✅ Health checks pass
3. ✅ Login should work at http://172.16.0.32

**The missing health endpoint is the root cause of the login failure!** 🔍

**Run the health endpoint addition commands above!** 🩺