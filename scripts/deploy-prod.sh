#!/bin/bash

# EMR Production Deployment Script
# Run this on the server (172.16.0.46)

set -e

echo "🚀 EMR Production Deployment"
echo "============================"

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Configuration
DEPLOY_PATH="/srv/emr"
DEPLOY_USER="devsecops"
SERVER_IP="172.16.0.46"

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

# Check if running on server
check_server() {
    if [ "$(hostname -I | grep -o 172.16.0.46)" != "172.16.0.46" ] && [ "$HOSTNAME" != "devsecops" ]; then
        print_warning "This script should be run on the server (172.16.0.46)"
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
    
    sudo mkdir -p "$DEPLOY_PATH"/{logs/production,backups}
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

# Stop existing containers
stop_containers() {
    print_step "Stopping existing containers..."
    
    docker-compose -f docker-compose.prod.yml down || true
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
    print_step "Building and starting containers..."
    
    docker-compose -f docker-compose.prod.yml up -d --build
    
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
        if curl -sf http://localhost:8002/api/ > /dev/null 2>&1; then
            print_status "Backend is healthy!"
            break
        fi
        echo "Attempt $attempt/$max_attempts: Waiting for backend..."
        sleep 5
        attempt=$((attempt + 1))
    done
    
    if [ $attempt -gt $max_attempts ]; then
        print_warning "Backend did not become healthy in time"
    fi
}

# Show status
show_status() {
    print_step "Container status:"
    docker-compose -f docker-compose.prod.yml ps
    
    echo ""
    print_step "Service URLs:"
    echo "  - Frontend: http://172.16.0.46:8082"
    echo "  - Backend API: http://172.16.0.46:8002/api/"
    echo "  - Health Check: http://172.16.0.46:8082/health"
    echo ""
    
    print_step "Useful commands:"
    echo "  docker-compose -f docker-compose.prod.yml logs -f    # View logs"
    echo "  docker-compose -f docker-compose.prod.yml ps        # Check status"
    echo "  docker-compose -f docker-compose.prod.yml restart  # Restart services"
    echo "  docker-compose -f docker-compose.prod.yml down      # Stop services"
}

# Main deployment
main() {
    check_server
    setup_directories
    navigate_to_deploy
    pull_latest
    stop_containers
    cleanup_images
    deploy_containers
    wait_for_services
    show_status
    
    echo ""
    echo -e "${GREEN}✅ EMR Production Deployment Complete!${NC}"
}

main "$@"

