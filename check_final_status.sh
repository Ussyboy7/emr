# Check EMR Service Status

**Backend service not running after rebuild. Let's get everything running:**

```bash
cd ~/emr

# Check all services
docker compose -f docker-compose.prod.yml ps

# Start backend if not running
docker compose -f docker-compose.prod.yml up -d backend

# Start all services
docker compose -f docker-compose.prod.yml up -d

# Check environment variables in backend
docker compose -f docker-compose.prod.yml exec backend env | grep REDIS

# Check Celery logs
docker compose -f docker-compose.prod.yml logs celery-worker --tail=5
```

## **Expected Results:**

### **Backend Environment:**
```bash
REDIS_PASSWORD=change_redis_password
CELERY_BROKER_URL=redis://:change_redis_password@redis:6379/0
```

### **Celery Success:**
```bash
[INFO] Connected to redis://:**@redis:6379/0
[INFO] celery@... ready.
```

## **Test EMR Access:**

```bash
# Test health endpoint
curl http://172.16.0.32/api/health/live/

# Test authentication
curl -X POST http://172.16.0.32/api/accounts/auth/token/ \
  -H "Content-Type: application/json" \
  -d '{"username":"emrprod","password":"Changeme"}'
```

**Start the backend service and check if Celery connects successfully!** 🚀

**EMR should be fully operational now!** 🏥✨

Let me know the status of all services! 📊