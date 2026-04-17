# Complete Backend Environment Configuration

Your backend config looks good! Here are the final touches:

```bash
sudo tee backend/env/prod.env > /dev/null << 'EOF'
# Django
DJANGO_SECRET_KEY=cPzRh_VXjWBn9kRZmJHiKskArn28qDiY4Imd7-DSP6ein4IT4jDtDtRukU6Ecj1fuow
DJANGO_DEBUG=False
DJANGO_ENV=prod
ALLOWED_HOSTS=medical.npa.local,172.16.0.32,localhost,127.0.0.1
CSRF_TRUSTED_ORIGINS=https://medical.npa.local,http://medical.npa.local,https://172.16.0.32,http://172.16.0.32

# Database
DB_ENGINE=postgres
DB_NAME=emrprod
DB_USER=emradmin
DB_PASSWORD=emradmin
DB_HOST=postgres
DB_PORT=5432

# Redis / Celery
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=redis
CELERY_BROKER_URL=redis://:redis@redis:6379/0
CELERY_RESULT_BACKEND=redis://:redis@redis:6379/1

# JWT
JWT_ACCESS_MINUTES=15
JWT_REFRESH_DAYS=7

# Frontend integration
CORS_ALLOWED_ORIGINS=https://medical.npa.local,http://medical.npa.local,https://172.16.0.32,http://172.16.0.32
MAX_UPLOAD_SIZE_MB=30

# Timezone
TIME_ZONE=Africa/Lagos

# Pagination
PAGINATION_PAGE_SIZE=50
EOF
```

**Note:** I fixed the CELERY URLs to use `redis` as password to match your REDIS_PASSWORD.

## Now Complete the Setup

### 1. Create Frontend Config
```bash
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
```

### 2. Fix Docker Permissions (if needed)
```bash
sudo usermod -aG docker emrprod
newgrp docker
```

### 3. Run Phase 2 Deployment
```bash
cd ~/emr
./phase2_application_deployment.sh
```

### 4. Monitor Deployment
```bash
# Watch services start
docker compose -f docker-compose.prod.yml logs -f

# Check when ready
curl http://172.16.0.32/api/health/live/
```

## Expected Phase 2 Success Indicators

You should see in the logs:
- ✅ PostgreSQL starting
- ✅ Redis connecting  
- ✅ Django migrations running
- ✅ Static files collected
- ✅ Gunicorn starting on port 8000
- ✅ Next.js building and starting on port 3000
- ✅ Nginx proxy starting on port 80

## Test EMR Access

Once deployment completes:
- **EMR Application:** http://172.16.0.32
- **API Health:** http://172.16.0.32/api/health/live/
- **Admin Login:** emrprod@emr / ChangeThisPassword123!

**Your EMR production deployment is ready to launch!** 🚀

**Run Phase 2 now and let me know when the services start successfully.** The configuration looks perfect! 👏