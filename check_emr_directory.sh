# EMR Directory Exists - Check Contents

**The EMR directory exists but wasn't showing in `ls`. Let's check what's in it:**

```bash
cd ~/emr

# Check what's in the directory
ls -la

# Check if it's a git repository
git status

# Check if docker-compose exists
ls -la docker-compose.prod.yml

# Check frontend environment
cat frontend/.env.prod | grep NEXT_PUBLIC_API_URL
```

## If Directory is Corrupted:

```bash
# If the directory has issues, clean it up
cd ~
rm -rf emr

# Then re-clone
git clone https://github.com/Ussyboy7/emr.git
cd emr
```

## If Directory is Working:

```bash
cd ~/emr

# Update frontend environment if needed
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

# Launch EMR
docker compose -f docker-compose.prod.yml up -d

# Check services
docker compose -f docker-compose.prod.yml ps
```

## Test EMR Access:

**URL:** http://172.16.0.32  
**Login:** emrprod / Changeme

**Check what's in your EMR directory first!** 📁

**If it's working, just update the frontend config and launch!** 🚀

**If corrupted, clean it up and re-clone!** 🔄

Let me know what you find in the EMR directory! 🔍