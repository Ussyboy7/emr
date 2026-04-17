# Force Backend Container Rebuild

**Issue:** Backend container not picking up new Redis password.

**Solution:** Rebuild backend container to ensure environment variables are loaded.

```bash
cd ~/emr

# Stop backend
docker compose -f docker-compose.prod.yml stop backend

# Remove backend container
docker rm emr-backend-prod

# Rebuild backend with new environment
docker compose -f docker-compose.prod.yml build backend

# Start backend
docker compose -f docker-compose.prod.yml start backend

# Start Celery services
docker compose -f docker-compose.prod.yml restart celery-worker celery-beat

# Check logs
docker compose -f docker-compose.prod.yml logs celery-worker --tail=10
```

## **Alternative: Check Environment in Container**

```bash
# Check what environment variables backend container sees
docker compose -f docker-compose.prod.yml exec backend env | grep REDIS

# Should show:
# REDIS_PASSWORD=change_redis_password
# CELERY_BROKER_URL=redis://:change_redis_password@redis:6379/0
```

## **If Still Failing: Reset Redis**

```bash
# Stop all services
docker compose -f docker-compose.prod.yml down

# Remove Redis volume to reset
docker volume rm emr_redis_data_prod

# Start Redis fresh (will use default password)
docker compose -f docker-compose.prod.yml up -d redis

# Update config to use default password
cat > backend/env/prod.env << 'EOF'
# Redis / Celery - DEFAULT PASSWORD
REDIS_PASSWORD=change_redis_password
CELERY_BROKER_URL=redis://:change_redis_password@redis:6379/0
CELERY_RESULT_BACKEND=redis://:change_redis_password@redis:6379/1
EOF

# Start other services
docker compose -f docker-compose.prod.yml up -d backend celery-worker celery-beat
```

**Rebuild the backend container to pick up the Redis password!** 🔄

**This should finally fix the Celery Redis connection!** 🚀

Let me know when Celery connects successfully! 🎯