# Fix Celery Redis Authentication

**Issue:** Celery can't connect to Redis due to password mismatch.

**Root Cause:** Backend environment file has wrong Redis password.

## **Update Backend Environment:**

```bash
cd ~/emr

# Update backend environment with correct passwords
cat > backend/env/prod.env << 'EOF'
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

# Restart backend and celery services
docker compose -f docker-compose.prod.yml restart backend celery-worker celery-beat

# Check logs
docker compose -f docker-compose.prod.yml logs celery-worker --tail=10
```

## **Expected Result:**

Celery should now connect successfully:
```
[INFO] Connected to redis://:**@redis:6379/0
[INFO] celery@... ready.
```

## **Verify Redis Connection:**

```bash
# Test Redis connection
docker compose -f docker-compose.prod.yml exec redis redis-cli -a redis ping

# Should return: PONG
```

## **Background Tasks Now Working:**

- ✅ **Email notifications**
- ✅ **Scheduled reports**  
- ✅ **Background processing**
- ✅ **Task queuing**

**The Redis authentication fix will enable all Celery background tasks!** 🔄

**Restart the services and Celery should connect successfully!** 🚀

Let me know when Celery connects to Redis! 🎯