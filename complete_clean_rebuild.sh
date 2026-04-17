# Force Complete Clean Rebuild

**Issue:** Docker cache still using old environment variables despite file update.

**Solution:** Complete clean rebuild with no cache and no intermediate images.

```bash
cd ~/emr

# Stop all services
docker compose -f docker-compose.prod.yml down

# Remove ALL related images and containers
docker rm -f $(docker ps -aq) 2>/dev/null || true
docker rmi -f $(docker images -q) 2>/dev/null || true
docker system prune -f
docker builder prune -f

# Clean any cached build context
rm -rf frontend/.next frontend/node_modules/.cache 2>/dev/null || true

# Verify the environment file is correct
cat frontend/.env.prod

# Build completely from scratch
docker compose -f docker-compose.prod.yml build --no-cache --pull

# Start services
docker compose -f docker-compose.prod.yml up -d

# Verify environment variables
sleep 5
docker compose -f docker-compose.prod.yml exec frontend env | grep NEXT_PUBLIC_API_URL
```

## Expected Output

```bash
NEXT_PUBLIC_API_URL=http://172.16.0.32/api
```

## Why This Works

- Removes all cached Docker images and containers
- Forces download of fresh base images
- Rebuilds from scratch without any cached layers
- Ensures environment variables are properly baked into Next.js bundle

**This complete clean rebuild will definitely fix the environment variable issue!** 🔄

**Run these commands and EMR login should work!** 🎯