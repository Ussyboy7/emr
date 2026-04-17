# EMR Directory is Empty/Corrupted

**The EMR directory exists but appears to be empty. The `ls -la` command shows nothing, and git commands don't work. This means the directory is corrupted.**

## Clean Up and Re-clone

```bash
# Remove the corrupted directory
cd ~
rm -rf emr

# Re-clone the complete EMR system from GitHub
git clone https://github.com/Ussyboy7/emr.git
cd emr

# Verify the clone worked
ls -la
git status

# Check that all files are there
ls -la docker-compose.prod.yml
ls -la frontend/.env.prod
```

## Update Frontend Configuration

```bash
# Update frontend environment file
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

# Verify the configuration
cat frontend/.env.prod | grep NEXT_PUBLIC_API_URL
```

## Launch EMR Production System

```bash
# Make scripts executable
chmod +x phase*.sh

# Start all EMR services
docker compose -f docker-compose.prod.yml up -d

# Monitor startup
docker compose -f docker-compose.prod.yml logs -f
```

## Verify Everything Works

```bash
# Check services are running
docker compose -f docker-compose.prod.yml ps

# Test health endpoint
curl http://172.16.0.32/api/health/live/

# Test authentication
curl -X POST http://172.16.0.32/api/accounts/auth/token/ \
  -H "Content-Type: application/json" \
  -d '{"username":"emrprod","password":"Changeme"}'
```

## Access EMR System

**URL:** http://172.16.0.32  
**Login:** emrprod / Changeme

**The corrupted directory is cleaned up and EMR is being re-cloned fresh!** 🔄

**After re-clone, EMR will be running in minutes!** 🚀

**Repository:** https://github.com/Ussyboy7/emr  
**Status:** All configurations preserved ✅

Let me know when the re-clone completes and EMR starts! 🏥✨