# EMR Directory Missing - Recovery Options

**The EMR directory seems to be missing. This could be due to:**
- Accidental deletion
- Moved to different location
- Permission issues

## Comprehensive Search

```bash
# Search all locations for EMR files
find / -name "docker-compose.prod.yml" -type f 2>/dev/null
find / -name "frontend" -type d 2>/dev/null | grep emr
find / -name "backend" -type d 2>/dev/null | grep emr

# Check disk usage to see if files still exist
df -h

# Check if files were moved to root or other user directories
ls -la /home/
ls -la /root/
```

## If EMR Directory is Gone - Re-setup

**If the directory was accidentally deleted, here's how to restore:**

### Option 1: Re-clone from GitHub
```bash
cd ~
git clone https://github.com/Ussyboy7/emr.git
cd emr

# The repository has all your configurations
ls -la frontend/.env.prod
```

### Option 2: Check if it was moved
```bash
# Search for any EMR-related files
find / -name "*.yml" -exec grep -l "emr" {} \; 2>/dev/null
find / -name "*emr*" -type f 2>/dev/null
```

## After Restoring EMR Directory

```bash
cd ~/emr

# Update frontend environment file
cat > frontend/.env.prod << 'EOF'
# ================================
# MEDICAL NPA LOCAL EMR FRONTEND - PRODUCTION
# ================================
NEXT_PUBLIC_API_URL=http://172.16.0.32/api
NEXT_PUBLIC_WS_URL=ws://172.16.0.32/ws/
NEXT_PUBLIC_ENVIRONMENT=production
NEXT_PUBLIC_APP_NAME=Medical NPA EMR
NEXT_PUBLIC_APP_VERSION=1.0.0

NEXTAUTH_URL=http://172.16.0.32
NEXTAUTH_SECRET=strong-production-nextauth-secret-change-this

NEXT_PUBLIC_ANALYTICS_ID=
NEXT_PUBLIC_SENTRY_DSN=
NEXT_PUBLIC_SENTRY_ENVIRONMENT=production
NEXT_PUBLIC_ENABLE_ANALYTICS=false
NEXT_PUBLIC_ENABLE_ERROR_REPORTING=false

NEXT_PUBLIC_DATADOG_APP_ID=
NEXT_PUBLIC_DATADOG_CLIENT_TOKEN=
EOF

# Start EMR services
docker compose -f docker-compose.prod.yml up -d

# Check services
docker compose -f docker-compose.prod.yml ps
```

## Prevention for Future

```bash
# Create backup of EMR directory
cd ~
tar -czf emr-backup-$(date +%Y%m%d).tar.gz emr/

# Or use git to preserve work
cd ~/emr
git add .
git commit -m "Backup of current EMR configuration"
git push origin main
```

**What happened to the EMR directory?** Did you accidentally delete it or move it?

**If it's gone, re-clone from GitHub - all your configurations are safely stored there!** 🔄

**Repository:** https://github.com/Ussyboy7/emr

Let me know if you find the directory or need to re-clone! 📁

**Your EMR system can be quickly restored!** 🚀