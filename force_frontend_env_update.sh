# Force Update Frontend Environment on Server

**Issue:** Server still using old frontend environment file despite git pull.

## Check and Update Frontend Config on Server

```bash
cd ~/emr

# Verify the file has correct content
cat frontend/.env.prod

# It should show:
# NEXT_PUBLIC_API_URL=http://172.16.0.32/api
# NEXT_PUBLIC_WS_URL=ws://172.16.0.32/ws/

# If not correct, update it manually
cat > frontend/.env.prod << 'EOF'
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

# Force complete rebuild
docker compose -f docker-compose.prod.yml down
docker rmi emr-frontend:latest
docker builder prune -f
docker compose -f docker-compose.prod.yml build --no-cache frontend
docker compose -f docker-compose.prod.yml up -d

# Verify environment variables
docker compose -f docker-compose.prod.yml exec frontend env | grep NEXT_PUBLIC_API_URL
```

## Expected Result

```bash
NEXT_PUBLIC_API_URL=http://172.16.0.32/api
```

## Test EMR Access

**URL:** http://172.16.0.32
**Login:** emrprod / Changeme

**The manual file update and complete rebuild should fix the environment variable issue!** 🔧