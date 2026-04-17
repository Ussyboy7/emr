# Frontend Still Using Wrong API URL

**Issue:** Frontend container still using old configuration (localhost:8001) instead of http://172.16.0.32/api

**Solution:** Rebuild frontend container with updated environment variables

```bash
cd ~/emr

# Rebuild frontend with correct API configuration
docker compose -f docker-compose.prod.yml build frontend

# Restart frontend service
docker compose -f docker-compose.prod.yml up -d frontend

# Check frontend logs
docker compose -f docker-compose.prod.yml logs frontend --tail=5
```

## Test After Rebuild

```bash
# Test health endpoint (should work)
curl http://172.16.0.32/api/health/live/

# Test authentication with new password
curl -X POST http://172.16.0.32/api/accounts/auth/token/ \
  -H "Content-Type: application/json" \
  -d '{"username":"emrprod","password":"Changeme"}'

# Should return JWT tokens
```

## Access EMR

**URL:** http://172.16.0.32
**Login:**
- Username: `emrprod`
- Password: `Changeme`

## Why This Happened

The frontend container was running with the old environment variables. Next.js builds environment variables into the application, so a rebuild is required when they change.

**Rebuild the frontend and the login issue will be resolved!** 🚀

Let me know when you've rebuilt the frontend and can access EMR! 👨‍⚕️