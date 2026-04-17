# Phase 2 Deployment Issues - Solutions

## Issue 1: Missing frontend/.env.prod File

The frontend environment file wasn't transferred. Create it on the server:

```bash
sudo tee frontend/.env.prod > /dev/null << 'EOF'
# ================================
# MEDICAL NPA LOCAL EMR FRONTEND - PRODUCTION
# ================================
NEXT_PUBLIC_API_URL=https://medical.npa.local/api
NEXT_PUBLIC_WS_URL=wss://medical.npa.local/ws/
NEXT_PUBLIC_ENVIRONMENT=production
NEXT_PUBLIC_APP_NAME=Medical NPA EMR
NEXT_PUBLIC_APP_VERSION=1.0.0

NEXTAUTH_URL=https://medical.npa.local
NEXTAUTH_SECRET=strong-production-nextauth-secret-change-this

NEXT_PUBLIC_ANALYTICS_ID=
NEXT_PUBLIC_SENTRY_DSN=
NEXT_PUBLIC_SENTRY_ENVIRONMENT=production
NEXT_PUBLIC_ENABLE_ANALYTICS=false
NEXT_PUBLIC_ENABLE_ERROR_REPORTING=false

NEXT_PUBLIC_DATADOG_APP_ID=
NEXT_PUBLIC_DATADOG_CLIENT_TOKEN=
EOF
```

## Issue 2: Docker Permission Denied

The user needs to be added to the docker group:

```bash
# Add user to docker group (from Phase 1, but may need to reapply)
sudo usermod -aG docker emrprod

# Restart session or run newgrp
newgrp docker

# Or run docker commands with sudo temporarily
# sudo docker compose ...
```

## Issue 3: Connection Refused (Expected)

Port 80 connection refused is normal - Nginx hasn't started yet. This will resolve once deployment completes.

## Complete Fix Sequence

```bash
# 1. Create missing env file
sudo tee frontend/.env.prod > /dev/null << 'EOF'
# ================================
# MEDICAL NPA LOCAL EMR FRONTEND - PRODUCTION
# ================================
NEXT_PUBLIC_API_URL=https://medical.npa.local/api
NEXT_PUBLIC_WS_URL=wss://medical.npa.local/ws/
NEXT_PUBLIC_ENVIRONMENT=production
NEXT_PUBLIC_APP_NAME=Medical NPA EMR
NEXT_PUBLIC_APP_VERSION=1.0.0

NEXTAUTH_URL=https://medical.npa.local
NEXTAUTH_SECRET=strong-production-nextauth-secret-change-this

NEXT_PUBLIC_ANALYTICS_ID=
NEXT_PUBLIC_SENTRY_DSN=
NEXT_PUBLIC_SENTRY_ENVIRONMENT=production
NEXT_PUBLIC_ENABLE_ANALYTICS=false
NEXT_PUBLIC_ENABLE_ERROR_REPORTING=false

NEXT_PUBLIC_DATADOG_APP_ID=
NEXT_PUBLIC_DATADOG_CLIENT_TOKEN=
EOF

# 2. Fix Docker permissions
sudo usermod -aG docker emrprod
newgrp docker

# 3. Re-run Phase 2
./phase2_application_deployment.sh

# 4. Monitor deployment
docker compose -f docker-compose.prod.yml logs -f
```

## Alternative: Transfer Complete Code Again

If the env file issue persists, re-transfer the complete EMR code:

```bash
# On your local machine
cd /path/to/emr
tar -czf emr-deploy-complete.tar.gz .

# Transfer to server
scp emr-deploy-complete.tar.gz emrprod@172.16.0.32:~/

# On server
tar -xzf emr-deploy-complete.tar.gz
cd emr
```

## Expected Phase 2 Output

Once fixed, Phase 2 should show:
- Docker images building/pulling
- PostgreSQL starting
- Django migrations running
- Static files collecting
- Services starting successfully
- Health checks passing

**The deployment will work once the env file and Docker permissions are fixed!** 

Try the fixes above and let me know the results. The EMR system is ready to deploy! 🚀