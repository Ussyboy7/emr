# EMR Backend Issues - Solutions Required

## Issues Identified:

1. **Health Endpoint Still 404** - Backend container running old code, URL changes not applied
2. **Authentication Failing** - Superuser not created or wrong credentials
3. **Backend Container Unhealthy** - Container needs rebuild with new configuration

## Fixes Needed:

### 1. Rebuild Backend Container
```bash
cd ~/emr

# Rebuild backend with new URL configuration
docker compose -f docker-compose.prod.yml build backend

# Restart all services
docker compose -f docker-compose.prod.yml down
docker compose -f docker-compose.prod.yml up -d

# Check services
docker compose -f docker-compose.prod.yml ps
```

### 2. Create Superuser Properly
```bash
# Create superuser in running container
docker compose -f docker-compose.prod.yml exec backend python manage.py shell -c "
from django.contrib.auth import get_user_model
User = get_user_model()
if not User.objects.filter(username='emrprod@emr').exists():
    User.objects.create_superuser(
        username='emrprod@emr',
        email='emrprod@medical.npa.local',
        password='ChangeThisPassword123!',
        is_staff=True,
        is_superuser=True
    )
    print('Superuser created successfully')
else:
    print('Superuser already exists')
"

# Verify user exists
docker compose -f docker-compose.prod.yml exec backend python manage.py shell -c "
from django.contrib.auth import get_user_model
User = get_user_model()
user = User.objects.filter(username='emrprod@emr').first()
if user:
    print(f'User exists: {user.username}, active: {user.is_active}, superuser: {user.is_superuser}')
else:
    print('User does not exist')
"
```

### 3. Test Health Endpoint
```bash
# Wait for services to start
sleep 30

# Test health endpoint
curl http://172.16.0.32/api/health/live/

# Should return: {"status": "ok"}
```

### 4. Test Authentication
```bash
# Test login
curl -X POST http://172.16.0.32/api/accounts/auth/token/ \
  -H "Content-Type: application/json" \
  -d '{"username":"emrprod@emr","password":"ChangeThisPassword123!"}'

# Should return access and refresh tokens
```

### 5. Access EMR System
```bash
# Once working, access at: http://172.16.0.32
# Login with: emrprod@emr / ChangeThisPassword123!
```

## Root Cause Analysis:

- **Backend container** was running old code when URL changes were made
- **Superuser creation** may have failed during initial deployment
- **Container rebuild** required to apply Django URL configuration changes

**The rebuild will fix the health endpoint and authentication issues!** 🚀

**Execute the rebuild commands above, then test the health endpoint and login.** 

Let me know when you've rebuilt the backend and we can verify it's working! 👨‍⚕️