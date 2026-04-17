# Critical Analysis: Database Authentication Issue

**Root Cause Analysis:**

1. **Direct PSQL works:** `psql -U emradmin -d emrprod` succeeds ✅
2. **Django fails:** Backend container can't authenticate ❌
3. **Environment file exists:** `DB_PASSWORD=emradmin` ✅
4. **Container rebuilt:** Should have new environment ✅

**The issue:** Backend container environment variables not loading correctly, or database not ready when Django starts.

## **Immediate Fix:**

```bash
# Check backend environment variables
docker compose -f docker-compose.prod.yml exec backend env | grep DB_

# Should show:
# DB_PASSWORD=emradmin
# DB_USER=emradmin
# DB_NAME=emrprod

# If not, force environment reload
docker compose -f docker-compose.prod.yml stop backend
docker rm emr-backend-prod

# Update environment file to ensure it's correct
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

# Start backend with clean environment
docker compose -f docker-compose.prod.yml up -d backend

# Wait for startup
sleep 10

# Check backend logs
docker compose -f docker-compose.prod.yml logs backend --tail=15
```

## **Alternative: Force Database Reset**

If environment issue persists:

```bash
# Stop all services
docker compose -f docker-compose.prod.yml down

# Remove database volume
docker volume rm emr_postgres_data_prod

# Remove all containers
docker rm -f $(docker ps -aq) 2>/dev/null || true

# Start only database first
docker compose -f docker-compose.prod.yml up -d postgres

# Wait for database
sleep 30

# Create user manually
docker compose -f docker-compose.prod.yml exec postgres psql -U postgres -c "
CREATE USER emradmin WITH PASSWORD 'emradmin';
CREATE DATABASE emrprod OWNER emradmin;
GRANT ALL PRIVILEGES ON DATABASE emrprod TO emradmin;
"

# Start backend
docker compose -f docker-compose.prod.yml up -d backend

# Run migrations
docker compose -f docker-compose.prod.yml exec backend python manage.py migrate

# Create superuser
docker compose -f docker-compose.prod.yml exec backend python manage.py shell -c "
from django.contrib.auth import get_user_model
User = get_user_model()
if not User.objects.filter(username='emrprod').exists():
    User.objects.create_superuser('emrprod', 'emrprod@medical.npa.local', 'Changeme')
    print('Superuser created')
"

# Start all services
docker compose -f docker-compose.prod.yml up -d
```

**This will completely reset and properly configure the database!** 🔄

**Choose the environment check first, or the complete reset if needed!** 🚀

**The EMR system will work once database authentication is resolved!** 🏥

Let me know which approach you want to try! 🎯