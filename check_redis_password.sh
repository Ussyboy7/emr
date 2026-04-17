# Check Redis Password Configuration

**Issue:** Redis rejecting authentication - password mismatch.

## **Check Redis Container Environment:**

```bash
# Check what password Redis container is using
docker compose -f docker-compose.prod.yml exec redis env | grep REDIS

# Check Redis logs
docker compose -f docker-compose.prod.yml logs redis --tail=10

# Try default password
docker compose -f docker-compose.prod.yml exec redis redis-cli -a change_redis_password ping

# If that works, update backend env
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
REDIS_PASSWORD=change_redis_password
CELERY_BROKER_URL=redis://:change_redis_password@redis:6379/0
CELERY_RESULT_BACKEND=redis://:change_redis_password@redis:6379/1

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

# Restart services
docker compose -f docker-compose.prod.yml restart backend celery-worker celery-beat

# Test connection
docker compose -f docker-compose.prod.yml exec redis redis-cli -a change_redis_password ping
```

## **Expected Result:**

```bash
PONG
```

**And Celery logs should show:**

```bash
[INFO] Connected to redis://:**@redis:6379/0
[INFO] celery@... ready.
```

## **Alternative: Reset Redis**

If the password issue persists:

```bash
# Stop services
docker compose -f docker-compose.prod.yml down

# Remove Redis data volume
docker volume rm emr_redis_data_prod

# Restart services (Redis will use new password)
docker compose -f docker-compose.prod.yml up -d
```

**The Redis password needs to match what the container was started with!** 🔑

**Check which password Redis accepts, then update the configuration!** 🔍

Let me know what password works for Redis! 🎯