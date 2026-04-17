# Resolve Git Conflict and Pull Latest EMR Fixes

## Option 1: Stash Local Changes (Recommended)
```bash
cd ~/emr

# Stash your local changes
git stash

# Pull the latest fixes from GitHub
git pull origin main

# The stashed changes are saved and can be restored later if needed
git stash list
```

## Option 2: Discard Local Changes
```bash
cd ~/emr

# Discard local changes to fix_frontend_api.sh
git checkout -- fix_frontend_api.sh

# Pull the latest fixes
git pull origin main
```

## Option 3: Force Pull (Overwrites Local Changes)
```bash
cd ~/emr

# Force pull (overwrites any local changes)
git fetch origin
git reset --hard origin/main
```

## After Pulling, Apply the Fixes

```bash
# Rebuild frontend with new configuration
docker compose -f docker-compose.prod.yml build frontend

# Restart frontend service
docker compose -f docker-compose.prod.yml up -d frontend

# Test health endpoint
curl http://172.16.0.32/api/health/live/

# Should return: {"status": "ok"}

# Access EMR at: http://172.16.0.32
```

## What Was Fixed in Latest Commit

The latest GitHub commit includes:
- ✅ Frontend API configuration for IP access
- ✅ Missing health endpoint added to Django
- ✅ All scripts for debugging and fixing

**Use Option 1 (stash) to safely pull the latest fixes!** 

**After pulling, the EMR login should work perfectly at http://172.16.0.32** 🎯

Let me know when you've pulled the changes and can access EMR! 🏥