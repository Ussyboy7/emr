# Find and Fix EMR Directory

**You seem to have navigated away from the EMR directory. Let's find it and fix the issue.**

## Find Your EMR Directory

```bash
# Check if EMR is in your home directory
ls -la ~/ | grep emr

# If it's there, go back
cd ~/emr

# If not found, check other locations
find /home -name "emr" -type d 2>/dev/null

# Or check if it was cloned elsewhere
find / -name "emr" -type d 2>/dev/null | head -5
```

## Once You Find the EMR Directory:

```bash
cd /path/to/emr  # Replace with actual path

# Manually update the frontend environment file
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

# Verify the update
cat frontend/.env.prod | grep NEXT_PUBLIC_API_URL

# Should show: NEXT_PUBLIC_API_URL=http://172.16.0.32/api

# Clean rebuild
docker compose -f docker-compose.prod.yml build --no-cache --pull frontend
docker compose -f docker-compose.prod.yml up -d frontend

# Check environment variables
sleep 5
docker compose -f docker-compose.prod.yml exec frontend env | grep NEXT_PUBLIC_API_URL
```

## Expected Result:

```bash
NEXT_PUBLIC_API_URL=http://172.16.0.32/api
```

## Test EMR:

**URL:** http://172.16.0.32  
**Login:** emrprod / Changeme

**Find your EMR directory first, then run the manual file update!** 🔍

**The manual file update will fix the environment variable issue!** 🎯

Let me know when you find the EMR directory and update the file! 🚀