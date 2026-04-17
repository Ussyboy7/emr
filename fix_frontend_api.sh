# Fix EMR Frontend API Connection

**Problem:** Frontend trying to connect to localhost:8001 instead of the correct API URL.

## Solution: Update Frontend Config and Rebuild

Run these commands on **Server A** (172.16.0.32):

```bash
# Update frontend configuration
sudo tee frontend/.env.prod > /dev/null << 'EOF'
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

# Rebuild frontend container (takes ~2 minutes)
cd ~/emr
docker compose -f docker-compose.prod.yml build frontend

# Restart frontend service
docker compose -f docker-compose.prod.yml up -d frontend

# Check that frontend rebuilt
docker compose -f docker-compose.prod.yml logs frontend --tail=10
```

## Test Connection

After rebuild, access EMR at: **http://172.16.0.32**

The frontend should now connect to the correct API at `http://172.16.0.32/api`.

## If Still Having Issues

Check the frontend logs:
```bash
docker compose -f docker-compose.prod.yml logs frontend
```

Verify backend API:
```bash
curl http://localhost/api/accounts/auth/me/
```

The issue was that the frontend environment variables weren't updated for IP-based access. This rebuild should fix the connection problem.