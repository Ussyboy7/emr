# Fix Frontend Environment Variables

**Issue:** Frontend still using old localhost URLs despite rebuild.

**Root Cause:** Next.js builds environment variables into the production bundle. Need complete clean rebuild.

## Force Complete Frontend Rebuild

```bash
cd ~/emr

# Remove old frontend container and image
docker compose -f docker-compose.prod.yml down frontend
docker rmi emr-frontend:latest

# Clean build cache and rebuild from scratch
docker builder prune -f
docker compose -f docker-compose.prod.yml build --no-cache frontend

# Start frontend
docker compose -f docker-compose.prod.yml up -d frontend

# Verify environment variables
docker compose -f docker-compose.prod.yml exec frontend env | grep NEXT_PUBLIC
```

## Expected Output After Fix

```bash
NEXT_PUBLIC_API_URL=http://172.16.0.32/api
NEXT_PUBLIC_WS_URL=ws://172.16.0.32/ws/
NEXT_PUBLIC_ENVIRONMENT=production
NEXT_PUBLIC_APP_NAME=Medical NPA EMR
```

## Test EMR Access

**URL:** http://172.16.0.32
**Login:** emrprod / Changeme

The clean rebuild should fix the environment variable issue! 🔧

**Don't run the .sh files - they're documentation. Run the docker commands above instead!** 🚀