# Database Authentication Error

**Backend can't connect to PostgreSQL: password authentication failed for user "emradmin"**

**The database password doesn't match. Let's check and fix:**

```bash
# Check current backend environment
cat backend/env/prod.env | grep DB_PASSWORD

# Should show: DB_PASSWORD=emradmin

# Check PostgreSQL logs to see what password it expects
docker compose -f docker-compose.prod.yml logs postgres --tail=10

# Test database connection directly
docker compose -f docker-compose.prod.yml exec postgres psql -U emradmin -d emrprod -c "SELECT version();"

# If that fails, reset the database password
docker compose -f docker-compose.prod.yml exec postgres psql -U postgres -c "ALTER USER emradmin PASSWORD 'emradmin';"

# Or recreate the database with correct password
```

## **Alternative: Reset Database**

If password issues persist:

```bash
# Stop all services
docker compose -f docker-compose.prod.yml down

# Remove database volume to reset
docker volume rm emr_postgres_data_prod

# Start fresh with correct password
docker compose -f docker-compose.prod.yml up -d postgres

# Wait for database to initialize
sleep 30

# Start backend
docker compose -f docker-compose.prod.yml up -d backend

# Check backend logs
docker compose -f docker-compose.prod.yml logs backend --tail=10
```

## **Expected Success:**

```bash
# Backend should connect successfully
Operations to perform:
  Apply all migrations: accounts, admin, appointments...
```

**Fix the database password mismatch and backend will connect!** 🔑

**Once database connection works, EMR will be fully operational!** 🚀

Let me know if you need to reset the database or if the password fix works! 🏥