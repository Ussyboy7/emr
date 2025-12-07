# EMR Deployment Steps

## Step 1: Push to GitHub

### 1.1 Initialize Git Repository (if not already done)

```bash
cd /Users/umyaro/Documents/Cursur\ apps/emr
git init
```

### 1.2 Add All Files

```bash
git add .
```

### 1.3 Create Initial Commit

```bash
git commit -m "Initial commit: EMR application with staging and production configs"
```

### 1.4 Create GitHub Repository

1. Go to GitHub: https://github.com/new
2. Repository name: `emr` (or `npa-emr` if you prefer)
3. Description: "NPA EMR Application"
4. Choose: Private or Public
5. **DO NOT** initialize with README, .gitignore, or license (we already have these)
6. Click "Create repository"

### 1.5 Add Remote and Push

```bash
# Replace YOUR_USERNAME with your GitHub username
git remote add origin https://github.com/YOUR_USERNAME/emr.git

# Or if using SSH:
# git remote add origin git@github.com:YOUR_USERNAME/emr.git

# Push to GitHub
git branch -M main
git push -u origin main
```

---

## Step 2: Deploy to Server

### 2.1 SSH to Server

```bash
ssh devsecops@172.16.0.46
```

### 2.2 Create Deployment Directory

```bash
sudo mkdir -p /srv/emr
sudo chown devsecops:devsecops /srv/emr
cd /srv/emr
```

### 2.3 Clone Repository

```bash
# Replace YOUR_USERNAME with your GitHub username
git clone https://github.com/YOUR_USERNAME/emr.git .

# Or if using SSH:
# git clone git@github.com:YOUR_USERNAME/emr.git .
```

### 2.4 Create Environment Files

#### Backend Staging Environment

```bash
cd /srv/emr/backend/env
cat > stag.env << 'EOF'
# Django Configuration
DJANGO_SECRET_KEY=staging-secret-key-change-this-in-production
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

# Security Settings (more lenient for staging)
ALLOWED_HOSTS=172.16.0.46,localhost,staging.emr.nigerianports.gov.ng,*
CORS_ALLOWED_ORIGINS=http://172.16.0.46:4647,http://localhost:4647,*

# Logging
LOG_LEVEL=INFO
EOF
```

#### Frontend Staging Environment

```bash
cd /srv/emr/frontend
cat > .env.stag << 'EOF'
NEXT_PUBLIC_API_URL=http://172.16.0.46:8047/api
NEXT_PUBLIC_WS_URL=ws://172.16.0.46:8047/ws
NODE_ENV=production
NEXT_PUBLIC_ENVIRONMENT=staging
EOF
```

### 2.5 Create Logs and Backups Directories

```bash
cd /srv/emr
mkdir -p logs/staging backups
```

### 2.6 Deploy Staging

```bash
cd /srv/emr
chmod +x scripts/deploy-stag.sh
./scripts/deploy-stag.sh
```

Or manually:

```bash
cd /srv/emr
docker-compose -f docker-compose.stag.yml up -d --build
```

### 2.7 Verify Deployment

```bash
# Check container status
docker-compose -f docker-compose.stag.yml ps

# Check logs
docker-compose -f docker-compose.stag.yml logs -f

# Test endpoints
curl http://172.16.0.46:4647
curl http://172.16.0.46:8047/api/
```

---

## Step 3: Access Your Application

### Staging URLs

- **Frontend**: http://172.16.0.46:4647
- **Backend API**: http://172.16.0.46:8047/api/
- **Admin Panel**: http://172.16.0.46:8047/admin/

---

## Troubleshooting

### If Git Push Fails

```bash
# Check if you're authenticated
git config --global user.name "Your Name"
git config --global user.email "your.email@example.com"

# For HTTPS, you may need a Personal Access Token
# Generate one at: https://github.com/settings/tokens
```

### If Docker Build Fails

```bash
# Check Docker is running
sudo systemctl status docker

# Check logs
docker-compose -f docker-compose.stag.yml logs

# Rebuild without cache
docker-compose -f docker-compose.stag.yml build --no-cache
```

### If Services Don't Start

```bash
# Check port conflicts
sudo netstat -tulpn | grep -E ':(4647|8047|5435|6382)'

# Check container logs
docker-compose -f docker-compose.stag.yml logs backend
docker-compose -f docker-compose.stag.yml logs frontend
```

---

## Next Steps After Deployment

1. **Run Database Migrations**:
   ```bash
   docker-compose -f docker-compose.stag.yml exec backend python manage.py migrate
   ```

2. **Create Superuser**:
   ```bash
   docker-compose -f docker-compose.stag.yml exec backend python manage.py createsuperuser
   ```

3. **Collect Static Files** (if needed):
   ```bash
   docker-compose -f docker-compose.stag.yml exec backend python manage.py collectstatic --noinput
   ```

4. **Test the Application**:
   - Visit http://172.16.0.46:4647
   - Test API endpoints
   - Verify database connections

