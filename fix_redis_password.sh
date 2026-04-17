# Update with Correct Redis Password

**Redis accepts:** `change_redis_password` ✅

**But the backend config still has:** `PASSWORD` (placeholder)

## **Fix Backend Configuration:**

```bash
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

# Redis / Celery - CORRECT PASSWORD
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

# Restart services with correct password
docker compose -f docker-compose.prod.yml restart backend celery-worker celery-beat

# Check Celery logs
docker compose -f docker-compose.prod.yml logs celery-worker --tail=10
```

## **Expected Success:**

```bash
[INFO] Connected to redis://:**@redis:6379/0
[INFO] celery@... ready.
```

## **Verify Redis Connection:**

```bash
# Test Redis auth
docker compose -f docker-compose.prod.yml exec redis redis-cli -a change_redis_password ping

# Should return: PONG
```

**The correct password is `change_redis_password` - update the config and restart!** 🔑

**This will finally fix the Celery Redis authentication!** 🚀

Let me know when Celery connects successfully! 🎯