# EMR Production Deployment - Phase 2: Application Deployment
# Commands to run on Server B (172.16.0.32)

## Clone EMR repository and checkout latest stable version
# (Assuming the code is already on the server or transferred)

# If cloning from git (replace with your repo URL)
# git clone https://github.com/your-org/emr.git /opt/emr
# cd /opt/emr
# git checkout main  # or your stable branch

# For this deployment, assume code is in /home/emrprod/emr
cd /home/emrprod/emr

## Create production environment file (backend/env/prod.env)
# (Already created and configured above)

## Build and deploy all Docker services
# Ensure Docker is running
sudo systemctl start docker

# Set environment variables for production
export DB_PASSWORD="secure-production-db-password-change-this"
export REDIS_PASSWORD="secure-redis-password-change-this"

# Create logs directory
mkdir -p logs/production

# Create backups directory
mkdir -p backups

# Deploy the stack
docker compose -f docker-compose.prod.yml up -d

# Check services are running
docker compose -f docker-compose.prod.yml ps

# Check logs
docker compose -f docker-compose.prod.yml logs -f --tail=50

## Configure SSL certificates for medical.npa.local
# (Self-signed certificates already generated in ssl/ directory)

## Set up application environment variables
# (Already configured in backend/env/prod.env and frontend/.env.prod)

## Initialize PostgreSQL database and run migrations
# Migrations run automatically in the backend container startup

# Check database is ready
docker compose -f docker-compose.prod.yml exec postgres pg_isready -U emradmin -d emrprod

# Check migrations
docker compose -f docker-compose.prod.yml exec backend python manage.py showmigrations

## Configure nginx reverse proxy with domain routing
# Nginx configuration already updated in nginx/prod.conf

# Test nginx configuration
docker compose -f docker-compose.prod.yml exec nginx nginx -t

# Reload nginx if needed
docker compose -f docker-compose.prod.yml exec nginx nginx -s reload

## Create initial superuser account
# Run Django management command
docker compose -f docker-compose.prod.yml exec backend python manage.py createsuperuser --username emrprod --email emrprod@medical.npa.local --noinput

# Set password (change this!)
docker compose -f docker-compose.prod.yml exec backend python manage.py shell -c "
from django.contrib.auth import get_user_model
User = get_user_model()
user = User.objects.get(username='emrprod')
user.set_password('ChangeThisPassword123!')
user.save()
"

## Test the deployment
# Test backend API
curl -f http://localhost/api/health/live/

# Test frontend
curl -f http://localhost/

# Test through nginx
curl -f http://medical.npa.local/health

# Test SSL (after enabling)
# curl -f -k https://medical.npa.local/health

## Performance Optimization
# Tune PostgreSQL for available RAM (32-64GB)
# Create PostgreSQL configuration override
sudo tee docker-compose.prod.yml.postgres-override > /dev/null << 'EOF'
# Add this to docker-compose.prod.yml under postgres service
command: >
  postgres
  -c shared_preload_libraries=pg_stat_statements
  -c pg_stat_statements.max=10000
  -c pg_stat_statements.track=all
  -c max_connections=200
  -c shared_buffers=8GB
  -c effective_cache_size=24GB
  -c maintenance_work_mem=2GB
  -c checkpoint_completion_target=0.9
  -c wal_buffers=16MB
  -c default_statistics_target=100
  -c random_page_cost=1.1
  -c effective_io_concurrency=200
  -c work_mem=4MB
  -c min_wal_size=1GB
  -c max_wal_size=4GB
  -c max_worker_processes=8
  -c max_parallel_workers_per_gather=4
  -c max_parallel_workers=8
  -c max_parallel_maintenance_workers=4
EOF

# Apply PostgreSQL tuning (optional - requires docker-compose restart)
# docker compose -f docker-compose.prod.yml up -d postgres

# Configure Redis memory limits
# Redis configuration is already set in docker-compose.prod.yml

# Optimize Nginx for concurrent users
# Nginx config already optimized in nginx/prod.conf

# Set up application monitoring and health checks
# Health checks configured in docker-compose.prod.yml

## Verification Commands
# Check all services
docker compose -f docker-compose.prod.yml ps

# Check resource usage
docker stats

# Check application logs
docker compose -f docker-compose.prod.yml logs backend --tail=20
docker compose -f docker-compose.prod.yml logs frontend --tail=20
docker compose -f docker-compose.prod.yml logs nginx --tail=20

# Test API endpoints
curl -s http://localhost/api/accounts/auth/me/ | head -20

# Test database connection
docker compose -f docker-compose.prod.yml exec postgres psql -U emradmin -d emrprod -c "SELECT version();"

# Test Redis connection
docker compose -f docker-compose.prod.yml exec redis redis-cli ping

# Check disk space
df -h

# Check memory usage
free -h

## Backup initial setup
# Create initial backup
docker compose -f docker-compose.prod.yml exec postgres pg_dump -U emradmin -d emrprod > backups/initial_backup_$(date +%Y%m%d_%H%M%S).sql

# Compress backup
gzip backups/initial_backup_*.sql