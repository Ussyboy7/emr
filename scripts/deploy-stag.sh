#!/usr/bin/env bash

# EMR Staging Deployment Script
# Run this on the server (172.16.0.46)

set -euo pipefail

echo "🚀 EMR Staging Deployment"
echo "=========================="

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Configuration (can be overridden by environment variables)
DEPLOY_PATH="${DEPLOY_PATH:-/srv/emr}"
DEPLOY_USER="${DEPLOY_USER:-devsecops}"
SERVER_IP="${SERVER_IP:-172.16.0.46}"
STAGING_FRONTEND_URL="${STAGING_FRONTEND_URL:-http://172.16.0.46:4647}"
STAGING_API_URL="${STAGING_API_URL:-http://172.16.0.46:8047}"
BACKUP_DIR="${BACKUP_DIR:-${DEPLOY_PATH}/backups}"

print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_step() {
    echo -e "${BLUE}[STEP]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Validate inputs
validate_inputs() {
    if [[ -z "$DEPLOY_PATH" ]]; then
        print_error "DEPLOY_PATH is required"
        exit 1
    fi
    
    if [[ -z "$DEPLOY_USER" ]]; then
        print_error "DEPLOY_USER is required"
        exit 1
    fi
    
    if [[ ! "$DEPLOY_PATH" =~ ^/ ]]; then
        print_error "DEPLOY_PATH must be an absolute path"
        exit 1
    fi
}

# Check if running on server
check_server() {
    local current_ip
    current_ip=$(hostname -I 2>/dev/null | grep -o "$SERVER_IP" || echo "")
    
    if [[ -z "$current_ip" ]] && [[ "$HOSTNAME" != "$DEPLOY_USER" ]]; then
        print_warning "This script should be run on the server ($SERVER_IP)"
        read -p "Continue anyway? (y/n) " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            exit 1
        fi
    fi
}

# Setup directories
setup_directories() {
    print_step "Setting up directories..."
    
    sudo mkdir -p "$DEPLOY_PATH"/{logs/staging,backups}
    sudo chown -R "$DEPLOY_USER:$DEPLOY_USER" "$DEPLOY_PATH"
    
    print_status "Directories created"
}

# Navigate to deployment directory
navigate_to_deploy() {
    print_step "Navigating to deployment directory..."
    
    if [ ! -d "$DEPLOY_PATH" ]; then
        print_error "Deployment directory $DEPLOY_PATH does not exist!"
        exit 1
    fi
    
    cd "$DEPLOY_PATH"
    print_status "Current directory: $(pwd)"
}

# Pull latest code
pull_latest() {
    print_step "Pulling latest code..."
    
    if [ -d ".git" ]; then
        git fetch --all --prune
        git reset --hard origin/main || git reset --hard origin/master
        git clean -fd
        print_status "Code updated"
    else
        print_warning "Not a git repository, skipping pull"
    fi
}

# Backup database
backup_database() {
    print_step "Creating database backup..."
    
    local backup_file="${BACKUP_DIR}/db_backup_$(date +%Y%m%d_%H%M%S).sql"
    mkdir -p "$BACKUP_DIR"
    
    # Check if postgres container exists
    if docker ps -a --format "{{.Names}}" | grep -q "emr-postgres-stag"; then
        if docker exec emr-postgres-stag pg_dump -U postgres emr_stag > "$backup_file" 2>/dev/null; then
            print_status "Database backed up to: $backup_file"
            echo "$backup_file" > "${BACKUP_DIR}/.latest_backup"
        else
            print_warning "Database backup failed, continuing anyway"
        fi
    else
        print_warning "PostgreSQL container not found, skipping backup"
    fi
}

# Stop existing containers
stop_containers() {
    print_step "Stopping existing staging containers..."
    
    docker-compose -f docker-compose.stag.yml down --timeout 30 || true
    print_status "Containers stopped"
}

# Clean up old images
cleanup_images() {
    print_step "Cleaning up old Docker images..."
    
    docker image prune -f
    print_status "Cleanup complete"
}

# Build and start containers
deploy_containers() {
    print_step "Building and starting staging containers..."
    
    docker-compose -f docker-compose.stag.yml up -d --build
    
    print_status "Containers started"
}

# Wait for services
wait_for_services() {
    print_step "Waiting for services to be healthy..."
    
    sleep 30
    
    # Check backend health
    max_attempts=30
    attempt=1
    
    while [ $attempt -le $max_attempts ]; do
        if curl -sf "${STAGING_API_URL}/api/health/" > /dev/null 2>&1; then
            print_status "Backend is healthy!"
            return 0
        fi
        echo "Attempt $attempt/$max_attempts: Waiting for backend..."
        sleep 5
        attempt=$((attempt + 1))
    done
    
    print_error "Backend did not become healthy in time"
    return 1
}

# Show status
show_status() {
    print_step "Container status:"
    docker-compose -f docker-compose.stag.yml ps
    
    echo ""
    print_step "Service URLs:"
    echo "  - Frontend: ${STAGING_FRONTEND_URL}"
    echo "  - Backend API: ${STAGING_API_URL}/api/"
    echo "  - Health Check: ${STAGING_API_URL}/api/health/"
    echo "  - Admin Panel: ${STAGING_API_URL}/admin/"
    echo ""
    
    print_step "Useful commands:"
    echo "  docker-compose -f docker-compose.stag.yml logs -f    # View logs"
    echo "  docker-compose -f docker-compose.stag.yml ps        # Check status"
    echo "  docker-compose -f docker-compose.stag.yml restart  # Restart services"
    echo "  docker-compose -f docker-compose.stag.yml down      # Stop services"
}

# Rollback function
rollback() {
    print_error "Deployment failed! Starting rollback..."
    
    stop_containers
    
    # Find latest backup
    local latest_backup
    latest_backup=$(cat "${BACKUP_DIR}/.latest_backup" 2>/dev/null || echo "")
    
    if [[ -n "$latest_backup" && -f "$latest_backup" ]]; then
        print_step "Rolling back to backup: $latest_backup"
        
        # Restore database if container exists
        if docker ps -a --format "{{.Names}}" | grep -q "emr-postgres-stag"; then
            print_step "Restoring database from backup..."
            docker exec -i emr-postgres-stag psql -U postgres emr_stag < "$latest_backup" 2>/dev/null || print_warning "Database restore failed"
        fi
        
        # Restart services from previous state
        cd "$DEPLOY_PATH"
        docker-compose -f docker-compose.stag.yml up -d
        cd - > /dev/null
        
        print_status "Rollback completed"
    else
        print_error "No backup found for rollback"
    fi
}

# Main deployment
main() {
    # Trap errors for rollback
    trap rollback ERR
    
    validate_inputs
    check_server
    setup_directories
    navigate_to_deploy
    backup_database
    pull_latest
    stop_containers
    cleanup_images
    deploy_containers
    
    if wait_for_services; then
        show_status
    echo ""
    echo -e "${GREEN}✅ EMR Staging Deployment Complete!${NC}"
    else
        print_error "Deployment failed - services did not become healthy"
        exit 1
    fi
}

main "$@"

