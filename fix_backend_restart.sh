# Backend Database Connection Issue - Analysis & Fix

**Problem:** Backend container restarting due to PostgreSQL authentication failure for user "emradmin"

**Root Cause:** Database password mismatch between Django configuration and PostgreSQL

## **Immediate Diagnosis:**

```bash
# Check what PostgreSQL expects (this worked before)
docker compose -f docker-compose.prod.yml exec postgres psql -U emradmin -d emrprod -c "SELECT current_user;"

# Check Django environment in container
docker compose -f docker-compose.prod.yml exec backend env | grep DB_

# Compare passwords - they should match
```

## **Why Backend is Restarting:**

- Django fails to connect to database
- Container exits with code 1
- Docker restart policy restarts the container
- Infinite loop of failure → restart → failure

## **Fix Database Authentication:**

### **Option 1: Update PostgreSQL Password to Match Django**

```bash
# Connect to PostgreSQL and update password
docker compose -f docker-compose.prod.yml exec postgres psql -U emradmin -d emrprod -c "ALTER USER emradmin PASSWORD 'emradmin';"

# Restart backend to test connection
docker compose -f docker-compose.prod.yml restart backend
```

### **Option 2: Reset Database (if password issue persists)**

```bash
# Stop all services
docker compose -f docker-compose.prod.yml down

# Remove database volume (resets database)
docker volume rm emr_postgres_data_prod

# Start fresh database
docker compose -f docker-compose.prod.yml up -d postgres

# Wait for initialization
sleep 30

# Create user and database
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
"
```

## **Monitor Backend Startup:**

```bash
# Watch backend logs
docker compose -f docker-compose.prod.yml logs -f backend

# Should see successful database connection:
# Operations to perform:
#   Apply all migrations: accounts, admin, appointments...
```

## **Why This Happens:**

- Database was initialized with different password
- Container environment variables may not match database state
- PostgreSQL persists user credentials in volume

**The backend restarting is normal Docker behavior when the main process (Django) fails to start!**

**Choose Option 1 first (update password), or Option 2 if needed (reset database)!** 🔑

**This will stop the restart loop and allow EMR to start properly!** 🚀

Let me know if you see successful database connection in the logs! 🎯