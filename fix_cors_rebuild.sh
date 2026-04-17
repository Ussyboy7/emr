# CORS Error - Frontend Still Using Old API URL

**Issue:** Frontend container still using `localhost:8001` instead of `http://172.16.0.32/api`

**Root Cause:** Next.js built the old environment variables into the production bundle.

**Solution:** Complete frontend rebuild with correct environment variables.

## **Fix Steps:**

```bash
cd ~/emr

# Stop frontend
docker compose -f docker-compose.prod.yml stop frontend

# Remove old frontend container and image
docker rm emr-frontend-prod
docker rmi emr-frontend:latest

# Clear any cached build artifacts
rm -rf frontend/.next frontend/node_modules/.cache

# Rebuild frontend with correct environment
docker compose -f docker-compose.prod.yml build --no-cache frontend

# Start frontend
docker compose -f docker-compose.prod.yml start frontend

# Verify environment variables
docker compose -f docker-compose.prod.yml exec frontend env | grep NEXT_PUBLIC_API_URL
```

## **Expected Result:**

```bash
NEXT_PUBLIC_API_URL=http://172.16.0.32/api
```

## **Verify Frontend Config:**

```bash
# Check the environment file
cat frontend/.env.prod | grep NEXT_PUBLIC_API_URL

# Should show: NEXT_PUBLIC_API_URL=http://172.16.0.32/api
```

## **Test After Rebuild:**

```bash
# Test health endpoint
curl http://172.16.0.32/api/health/live/

# Test authentication
curl -X POST http://172.16.0.32/api/accounts/auth/token/ \
  -H "Content-Type: application/json" \
  -d '{"username":"emrprod","password":"Changeme"}'
```

## **Access EMR:**

**URL:** http://172.16.0.32  
**Login:** emrprod / Changeme

## **Why This Happened:**

Next.js compiles `NEXT_PUBLIC_*` environment variables into the JavaScript bundle at build time. When these change, the container must be rebuilt completely.

**The complete rebuild will fix the CORS and connection issues!** 🔄

**Run the rebuild commands and EMR login will work!** 🚀

Let me know when the environment variable shows the correct URL! 🎯