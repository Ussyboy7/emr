# EMR Server Deployment Guide

This guide explains how to deploy the EMR application on the server (172.16.0.46) similar to npa-emr and npa-ecm.

## 🏗️ Architecture Overview

```
Server: 172.16.0.46
├── /srv/npa-emr/     (npa-emr application)
├── /srv/npa-ecm/     (npa-ecm application)
└── /srv/emr/         (emr application) ← NEW
```

### Port Allocation

#### Production Environment

| Application | Frontend | Backend | PostgreSQL | Redis | Nginx |
|-------------|----------|---------|------------|-------|-------|
| npa-emr     | 8081     | 8001    | 5433       | 6380  | 80    |
| npa-ecm     | 4646     | -       | -          | -     | 80    |
| **emr**     | **8082** | **8002**| **5434**   | **6381**| **8082** |

#### Staging Environment

| Application | Frontend | Backend | PostgreSQL | Redis |
|-------------|----------|---------|------------|-------|
| npa-emr     | 7070     | 8000    | -          | -     |
| npa-ecm     | 4646     | -       | -          | -     |
| **emr**     | **4647** | **8047**| **5435**   | **6382** |

**Note:** Staging uses direct frontend access (no nginx) for simplicity and easier debugging.

## 📋 Prerequisites

- Server access: `ssh devsecops@172.16.0.46`
- Docker and Docker Compose installed
- Git access to the repository
- Sufficient disk space

## 🚀 Deployment Steps

### Choose Environment

This guide covers both **Production** and **Staging** deployments. Choose the appropriate section:

- [Production Deployment](#production-deployment) - For live/production environment
- [Staging Deployment](#staging-deployment) - For testing and QA environment

---

## 📦 Production Deployment

### Step 1: SSH to Server

```bash
ssh devsecops@172.16.0.46
```

### Step 2: Create Deployment Directory

```bash
# Create deployment directory
sudo mkdir -p /srv/emr
sudo chown devsecops:devsecops /srv/emr
cd /srv/emr

# Create necessary subdirectories
mkdir -p logs/production backups
```

### Step 3: Clone Repository

```bash
cd /srv/emr

# If repository is in the main workspace, copy it
# Or clone from Git if available
git clone <your-repo-url> . || echo "Repository already exists or copying from workspace"

# If copying from workspace (if you have access)
# You can use scp or rsync from your local machine
```

### Step 4: Configure Environment Files

Create the production environment file:

```bash
cd /srv/emr/backend/env

# Create prod.env file
cat > prod.env << 'EOF'
# Django Configuration
DJANGO_SECRET_KEY=your-super-secret-production-key-here
DJANGO_DEBUG=False
DJANGO_ENV=prod

# Database Configuration
DB_NAME=emr_db_prod
DB_USER=emradmin
DB_PASSWORD=your-secure-db-password-here
DB_HOST=postgres
DB_PORT=5432

# Redis Configuration
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=your-redis-password-here

# Application URLs
FRONTEND_URL=http://172.16.0.46:8082
API_URL=http://172.16.0.46:8002

# Security Settings
ALLOWED_HOSTS=172.16.0.46,localhost,emr.nigerianports.gov.ng
CORS_ALLOWED_ORIGINS=http://172.16.0.46:8082,http://localhost:8082

# Logging
LOG_LEVEL=WARNING
EOF
```

Create frontend environment file:

```bash
cd /srv/emr/frontend

cat > .env.prod << 'EOF'
NEXT_PUBLIC_API_URL=http://172.16.0.46:8002/api
NEXT_PUBLIC_WS_URL=ws://172.16.0.46:8002/ws
NODE_ENV=production
NEXT_PUBLIC_ENVIRONMENT=production
EOF
```

### Step 5: Make Deployment Script Executable

```bash
chmod +x /srv/emr/scripts/deploy-prod.sh
```

### Step 6: Run Deployment

```bash
cd /srv/emr
./scripts/deploy-prod.sh
```

Or manually:

```bash
cd /srv/emr

# Stop any existing containers
docker-compose -f docker-compose.prod.yml down || true

# Build and start
docker-compose -f docker-compose.prod.yml up -d --build

# Check status
docker-compose -f docker-compose.prod.yml ps

# View logs
docker-compose -f docker-compose.prod.yml logs -f
```

### Step 7: Verify Deployment

```bash
# Check if services are running
docker-compose -f docker-compose.prod.yml ps

# Test backend API
curl http://172.16.0.46:8002/api/

# Test frontend
curl http://172.16.0.46:8082/health

# Check logs
docker-compose -f docker-compose.prod.yml logs backend
docker-compose -f docker-compose.prod.yml logs frontend
```

## 🔧 Configuration Details

### Docker Compose Services

The `docker-compose.prod.yml` includes:

1. **PostgreSQL** (port 5434)
   - Database: `emr_db_prod`
   - User: `emradmin`
   - Persistent volume for data

2. **Redis** (port 6381)
   - Cache and session storage
   - Password protected

3. **Backend** (port 8002)
   - Django application
   - Gunicorn with 8 workers
   - Health checks enabled

4. **Celery Worker**
   - Background task processing

5. **Celery Beat**
   - Scheduled task management

6. **Frontend** (port 8082)
   - Next.js application
   - Production build

7. **Nginx** (port 8082)
   - Reverse proxy
   - Static file serving
   - Health check endpoint

### Nginx Configuration

The nginx configuration (`nginx/prod.conf`) includes:
- Reverse proxy to backend and frontend
- Static file serving
- Media file serving
- Health check endpoint
- Security headers
- Rate limiting

## 📊 Monitoring

### Check Container Status

```bash
cd /srv/emr
docker-compose -f docker-compose.prod.yml ps
```

### View Logs

```bash
# All services
docker-compose -f docker-compose.prod.yml logs -f

# Specific service
docker-compose -f docker-compose.prod.yml logs -f backend
docker-compose -f docker-compose.prod.yml logs -f frontend
docker-compose -f docker-compose.prod.yml logs -f nginx
```

### Health Checks

```bash
# Backend health
curl http://172.16.0.46:8002/api/

# Frontend health
curl http://172.16.0.46:8082/health

# Nginx health
curl http://172.16.0.46:8082/health
```

## 🔄 Updates and Maintenance

### Update Application

```bash
cd /srv/emr

# Pull latest code
git pull origin main  # or master

# Rebuild and restart
docker-compose -f docker-compose.prod.yml up -d --build

# Or use deployment script
./scripts/deploy-prod.sh
```

### Database Migrations

```bash
cd /srv/emr

# Run migrations
docker-compose -f docker-compose.prod.yml exec backend python manage.py migrate

# Create superuser (if needed)
docker-compose -f docker-compose.prod.yml exec backend python manage.py createsuperuser
```

### Backup Database

```bash
cd /srv/emr

# Manual backup
docker-compose -f docker-compose.prod.yml exec postgres pg_dump -U emradmin emr_db_prod > backups/backup_$(date +%Y%m%d_%H%M%S).sql

# Automated backups run daily via backup service
```

### Restart Services

```bash
cd /srv/emr

# Restart all services
docker-compose -f docker-compose.prod.yml restart

# Restart specific service
docker-compose -f docker-compose.prod.yml restart backend
docker-compose -f docker-compose.prod.yml restart frontend
```

## 🐛 Troubleshooting

### Containers Not Starting

```bash
# Check logs
docker-compose -f docker-compose.prod.yml logs

# Check container status
docker-compose -f docker-compose.prod.yml ps -a

# Remove and recreate
docker-compose -f docker-compose.prod.yml down
docker-compose -f docker-compose.prod.yml up -d --build
```

### Database Connection Issues

```bash
# Check PostgreSQL is running
docker-compose -f docker-compose.prod.yml ps postgres

# Check database logs
docker-compose -f docker-compose.prod.yml logs postgres

# Test connection
docker-compose -f docker-compose.prod.yml exec backend python manage.py dbshell
```

### Port Conflicts

If ports are already in use:

```bash
# Check what's using the ports
sudo netstat -tulpn | grep -E ':(8082|8002|5434|6381)'

# Or use ss
sudo ss -tulpn | grep -E ':(8082|8002|5434|6381)'

# Update docker-compose.prod.yml with different ports if needed
```

### Permission Issues

```bash
# Fix permissions
sudo chown -R devsecops:devsecops /srv/emr
sudo chmod -R 755 /srv/emr
```

## 🔐 Security Considerations

1. **Change Default Passwords**
   - Database password
   - Redis password
   - Django secret key

2. **Environment Variables**
   - Never commit `.env` files
   - Use strong passwords
   - Rotate secrets regularly

3. **SSL/TLS**
   - Configure SSL certificates for production
   - Update nginx configuration
   - Enable HTTPS redirect

4. **Firewall**
   - Only expose necessary ports
   - Restrict access to admin interfaces

## 📝 Quick Reference

### Common Commands

#### Production Commands

```bash
# Navigate to deployment
cd /srv/emr

# Start services
docker-compose -f docker-compose.prod.yml up -d

# Stop services
docker-compose -f docker-compose.prod.yml down

# View logs
docker-compose -f docker-compose.prod.yml logs -f

# Restart services
docker-compose -f docker-compose.prod.yml restart

# Rebuild and restart
docker-compose -f docker-compose.prod.yml up -d --build

# Run migrations
docker-compose -f docker-compose.prod.yml exec backend python manage.py migrate

# Create superuser
docker-compose -f docker-compose.prod.yml exec backend python manage.py createsuperuser

# Access database shell
docker-compose -f docker-compose.prod.yml exec backend python manage.py dbshell

# Access container shell
docker-compose -f docker-compose.prod.yml exec backend bash
```

#### Staging Commands

```bash
# Navigate to deployment
cd /srv/emr

# Start staging services
docker-compose -f docker-compose.stag.yml up -d

# Stop staging services
docker-compose -f docker-compose.stag.yml down

# View staging logs
docker-compose -f docker-compose.stag.yml logs -f

# Restart staging services
docker-compose -f docker-compose.stag.yml restart

# Rebuild and restart staging
docker-compose -f docker-compose.stag.yml up -d --build

# Run migrations in staging
docker-compose -f docker-compose.stag.yml exec backend python manage.py migrate

# Create superuser in staging
docker-compose -f docker-compose.stag.yml exec backend python manage.py createsuperuser
```

### Service URLs

- **Frontend**: http://172.16.0.46:8082
- **Backend API**: http://172.16.0.46:8002/api/
- **Health Check**: http://172.16.0.46:8082/health
- **Admin Panel**: http://172.16.0.46:8002/admin/

---

## 🧪 Staging Deployment

Staging environment is used for testing, QA, and pre-production validation. It uses different ports and more lenient security settings.

### Step 1: SSH to Server

```bash
ssh devsecops@172.16.0.46
```

### Step 2: Create Deployment Directory

```bash
# Create deployment directory (if not exists)
sudo mkdir -p /srv/emr
sudo chown devsecops:devsecops /srv/emr
cd /srv/emr

# Create necessary subdirectories
mkdir -p logs/staging backups
```

### Step 3: Clone Repository

Same as production - ensure you're in the `/srv/emr` directory.

### Step 4: Configure Environment Files

Create the staging environment file:

```bash
cd /srv/emr/backend/env

# Create stag.env file
cat > stag.env << 'EOF'
# Django Configuration
DJANGO_SECRET_KEY=staging-secret-key-change-this
DJANGO_DEBUG=True
DJANGO_ENV=stag

# Database Configuration
DB_NAME=emr_db_stag
DB_USER=emradmin
DB_PASSWORD=emradmin
DB_HOST=postgres
DB_PORT=5432

# Redis Configuration
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=emr_redis_stag_pass

# Application URLs
FRONTEND_URL=http://172.16.0.46:4647
API_URL=http://172.16.0.46:8047
# Note: Staging uses direct frontend access (no nginx)

# Security Settings (more lenient for staging)
ALLOWED_HOSTS=172.16.0.46,localhost,staging.emr.nigerianports.gov.ng,*
CORS_ALLOWED_ORIGINS=http://172.16.0.46:4647,http://localhost:4647,*

# Logging
LOG_LEVEL=INFO
EOF
```

Create frontend staging environment file:

```bash
cd /srv/emr/frontend

cat > .env.stag << 'EOF'
NEXT_PUBLIC_API_URL=http://172.16.0.46:8047/api
NEXT_PUBLIC_WS_URL=ws://172.16.0.46:8047/ws
NODE_ENV=production
NEXT_PUBLIC_ENVIRONMENT=staging
EOF
```

### Step 5: Make Deployment Script Executable

```bash
chmod +x /srv/emr/scripts/deploy-stag.sh
```

### Step 6: Run Staging Deployment

```bash
cd /srv/emr
./scripts/deploy-stag.sh
```

Or manually:

```bash
cd /srv/emr

# Stop any existing staging containers
docker-compose -f docker-compose.stag.yml down || true

# Build and start
docker-compose -f docker-compose.stag.yml up -d --build

# Check status
docker-compose -f docker-compose.stag.yml ps

# View logs
docker-compose -f docker-compose.stag.yml logs -f
```

### Step 7: Verify Staging Deployment

```bash
# Check if services are running
docker-compose -f docker-compose.stag.yml ps

# Test backend API
curl http://172.16.0.46:8047/api/

# Test frontend
curl http://172.16.0.46:4647

# Check logs
docker-compose -f docker-compose.stag.yml logs backend
docker-compose -f docker-compose.stag.yml logs frontend
```

### Staging Service URLs

- **Frontend**: http://172.16.0.46:4647 (direct access - no nginx)
- **Backend API**: http://172.16.0.46:8047/api/
- **Admin Panel**: http://172.16.0.46:8047/admin/

### Staging vs Production Architecture

#### Staging (Simplified - Direct Access)
```
User Request
    │
    └─→ Port 4647 ──→ Frontend Container (Next.js) [Direct Access]
    
User API Request
    │
    └─→ Port 8047 ──→ Backend Container (Django)
```

**Why no Nginx in staging?**
- ✅ **Simpler setup**: Easier to deploy and maintain
- ✅ **Easier debugging**: No proxy layer to troubleshoot
- ✅ **Faster iteration**: Direct access for development/testing
- ✅ **Sufficient for staging**: Staging doesn't need production-grade features

#### Production (With Nginx)
```
User Request
    │
    └─→ Port 8082 (Nginx) ──→ Nginx Container ──→ Frontend Container (Next.js)
                              │
                              ├─→ Serves static files directly
                              └─→ Proxies dynamic requests to Next.js
```

**Why Nginx in production?**
- ✅ **Performance**: Static file serving, caching, compression
- ✅ **Security**: SSL/TLS, security headers, rate limiting
- ✅ **Scalability**: Load balancing, reverse proxy features
- ✅ **Production-ready**: Industry standard setup

### Backend Access

The backend (port 8047) is accessed directly:
- **Direct API access**: http://172.16.0.46:8047/api/
- **Admin panel**: http://172.16.0.46:8047/admin/
- **WebSocket**: ws://172.16.0.46:8047/ws/

The frontend (via Nginx on 4647) proxies API requests to the backend internally, so users accessing the frontend through Nginx will have their API calls automatically routed to the backend.

### Staging vs Production Differences

| Feature | Staging | Production |
|---------|---------|------------|
| Frontend Access | Direct (4647) | Via Nginx (8082) |
| Nginx | Disabled | Enabled |
| Debug Mode | Enabled | Disabled |
| Log Level | INFO | WARNING |
| CORS | Permissive | Restricted |
| Cache Headers | N/A (no nginx) | 30 days / 1 year |
| Rate Limiting | N/A (no nginx) | Stricter |
| Workers | 4 workers | 8 workers |
| Database | Separate DB | Separate DB |

### Staging Updates

```bash
cd /srv/emr

# Pull latest code
git pull origin main  # or master

# Rebuild and restart staging
docker-compose -f docker-compose.stag.yml up -d --build

# Or use deployment script
./scripts/deploy-stag.sh
```

## 🎉 Success Indicators

Deployment is successful when:

1. ✅ All containers are running (`docker-compose ps`)
2. ✅ Backend API responds (`curl http://172.16.0.46:8002/api/`)
3. ✅ Frontend loads (`curl http://172.16.0.46:8082/health`)
4. ✅ No errors in logs (`docker-compose logs`)
5. ✅ Database migrations completed
6. ✅ Static files collected

---

**Last Updated**: 2025-01-27  
**Server**: 172.16.0.46  
**Deploy Path**: /srv/emr

