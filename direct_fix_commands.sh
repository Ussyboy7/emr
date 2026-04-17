# Fix EMR Frontend API Configuration

## Direct Commands to Run:

```bash
# Update frontend environment file
sudo tee ~/emr/frontend/.env.prod > /dev/null << 'EOF'
# ================================
# MEDICAL NPA LOCAL EMR FRONTEND - PRODUCTION
# ================================
NEXT_PUBLIC_API_URL=http://172.16.0.32/api
NEXT_PUBLIC_WS_URL=ws://172.16.0.32/ws/
NEXT_PUBLIC_ENVIRONMENT=production
NEXT_PUBLIC_APP_NAME=Medical NPA EMR
NEXT_PUBLIC_APP_VERSION=1.0.0

NEXTAUTH_URL=http://172.16.0.32
NEXTAUTH_SECRET=strong-production-nextauth-secret-change-this

NEXT_PUBLIC_ANALYTICS_ID=
NEXT_PUBLIC_SENTRY_DSN=
NEXT_PUBLIC_SENTRY_ENVIRONMENT=production
NEXT_PUBLIC_ENABLE_ANALYTICS=false
NEXT_PUBLIC_ENABLE_ERROR_REPORTING=false

NEXT_PUBLIC_DATADOG_APP_ID=
NEXT_PUBLIC_DATADOG_CLIENT_TOKEN=
EOF

# Rebuild frontend with new configuration
cd ~/emr
docker compose -f docker-compose.prod.yml build frontend

# Restart frontend service
docker compose -f docker-compose.prod.yml up -d frontend

# Verify frontend rebuilt
docker compose -f docker-compose.prod.yml logs frontend --tail=5
```

## Check API Health Endpoint Issue:

```bash
# Test if health endpoint exists
curl http://172.16.0.32/api/health/live/

# Check backend API routes
docker compose -f docker-compose.prod.yml exec backend python manage.py shell -c "
from django.urls import get_resolver
patterns = [str(p.pattern) for p in get_resolver().url_patterns]
api_patterns = [p for p in patterns if 'api' in p.lower() or 'health' in p.lower()]
print('API/Health patterns:', api_patterns[:20])
"

# Check nginx error logs
docker compose -f docker-compose.prod.yml logs nginx --tail=10
```

## Alternative: Create Health Endpoint

If the health endpoint doesn't exist, we can add it:

```bash
# Check backend urls.py
docker compose -f docker-compose.prod.yml exec backend find . -name "urls.py" -exec grep -l "api" {} \;

# Add health endpoint to backend
docker compose -f docker-compose.prod.yml exec backend bash -c "
cat >> backend/emr_backend/urls.py << 'EOF'

# Health check endpoint
from django.http import JsonResponse
from django.urls import path

def health_live(request):
    return JsonResponse({'status': 'ok', 'timestamp': '2026-04-17T18:26:38+01:00'})

urlpatterns += [
    path('api/health/live/', health_live, name='health_live'),
]
EOF
"

# Restart backend
docker compose -f docker-compose.prod.yml restart backend
```

**Run the frontend fix commands first, then we can address the API health endpoint issue.**