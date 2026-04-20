#!/bin/bash

# EMR Production Environment Manager
# Comprehensive production operations script

set -e

# Configuration
COMPOSE_FILE="../../docker-compose.prod.yml"
BACKUP_DIR="$HOME/emr_backups"
LOG_DIR="./logs"
MONITOR_LOG="./monitoring.log"

# Colors
RED='[0;31m'
GREEN='[0;32m'
YELLOW='[1;33m'
BLUE='[0;34m'
PURPLE='[0;35m'
CYAN='[0;36m'
NC='[0m'

# Functions
log() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') - $1" | tee -a "$MONITOR_LOG"
}

header() {
    echo -e "${BLUE}================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}================================${NC}"
}

success() {
    echo -e "${GREEN}✅ $1${NC}"
}

error() {
    echo -e "${RED}❌ $1${NC}"
}

warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

info() {
    echo -e "${CYAN}ℹ️  $1${NC}"
}

# Check if running as emrprod user
check_user() {
    if [ "$USER" != "emrprod" ]; then
        warning "Recommended to run as emrprod user"
    fi
}

show_usage() {
    echo "EMR Production Environment Manager"
    echo ""
    echo "Usage: $0 {start|stop|restart|status|health|monitor|alerts|logs|diagnostics|backup|backup-status|verify-backup|update|cleanup}"
    echo ""
    echo "Service Management:"
    echo "  start          Start all production services"
    echo "  stop           Stop all production services"
    echo "  restart        Restart all production services"
    echo "  status         Show service status"
    echo ""
    echo "Monitoring & Diagnostics:"
    echo "  health         Run health checks"
    echo "  monitor        System monitoring"
    echo "  alerts         Check for alerts"
    echo "  logs           View recent logs"
    echo "  diagnostics    Full system diagnostics"
    echo ""
    echo "Backup Management:"
    echo "  backup         Create backup"
    echo "  backup-status  Backup status"
    echo "  verify-backup  Verify backups"
    echo ""
    echo "Maintenance:"
    echo "  update         Update application (with backup)"
    echo "  cleanup        Clean up old logs and temp files"
    echo ""
    echo "Emergency:"
    echo "  emergency-stop Emergency stop all services"
    echo "  recovery       Start disaster recovery"
    echo "  panic          Complete system reset"
    echo ""
    echo "Examples:"
    echo "  $0 start       # Start EMR production"
    echo "  $0 health      # Check system health"
    echo "  $0 backup      # Create backup"
    echo ""
}

# Start production services
cmd_start() {
    header "Starting EMR Production Services"
    log "Starting EMR production services"

    # Create necessary directories
    mkdir -p "$LOG_DIR"

    # Start services
    info "Starting Docker services..."
    docker compose -f "$COMPOSE_FILE" up -d

    # Wait for services to be healthy
    info "Waiting for services to be healthy..."
    sleep 30

    # Check status
    cmd_status

    success "EMR production services started successfully"
    info "Access EMR at: http://172.16.0.32 or https://emr.npa.local"
}

# Stop production services
cmd_stop() {
    header "Stopping EMR Production Services"
    log "Stopping EMR production services"

    info "Stopping Docker services..."
    docker compose -f "$COMPOSE_FILE" down

    success "EMR production services stopped"
}

# Restart production services
cmd_restart() {
    header "Restarting EMR Production Services"
    log "Restarting EMR production services"

    info "Restarting Docker services..."
    docker compose -f "$COMPOSE_FILE" down
    sleep 5
    docker compose -f "$COMPOSE_FILE" up -d

    # Wait for services to be healthy
    info "Waiting for services to be healthy..."
    sleep 30

    # Check status
    cmd_status

    success "EMR production services restarted successfully"
    info "Access EMR at: http://172.16.0.32 or https://emr.npa.local"
}

# Show service status
cmd_status() {
    header "EMR Production Status"
    echo "Time: $(date)"
    echo ""

    # Docker services status
    echo "Docker Services:"
    docker compose -f "$COMPOSE_FILE" ps
    echo ""

    # Container health
    echo "Container Health:"
    containers=$(docker compose -f "$COMPOSE_FILE" ps --format "table {{.Name}}	{{.Status}}" | tail -n +2)
    while read -r line; do
        container=$(echo "$line" | awk '{print $1}')
        status=$(echo "$line" | awk '{print $2}')
        if echo "$status" | grep -q "healthy\|running"; then
            success "$container: $status"
        elif echo "$status" | grep -q "unhealthy\|exited"; then
            error "$container: $status"
        else
            warning "$container: $status"
        fi
    done <<< "$containers"
}

# Health checks
cmd_health() {
    header "EMR Production Health Check"
    log "Running health checks"

    # Backend health
    echo "Backend Health:"
    backend_health=$(docker compose -f "$COMPOSE_FILE" exec -T backend curl -s -o /dev/null -w "%{http_code}" http://localhost:8000/api/health/ 2>/dev/null || echo "unhealthy")
    if [ "$backend_health" = "200" ]; then
        success "Backend health check: PASSED"
    else
        error "Backend health check: FAILED"
    fi

    # Frontend health
    echo "Frontend Health:"
    frontend_health=$(docker compose -f "$COMPOSE_FILE" exec -T frontend wget --no-verbose --tries=1 --spider http://localhost:3000 2>/dev/null && echo "200" || echo "unhealthy")
    if [ "$frontend_health" = "200" ]; then
        success "Frontend health check: PASSED"
    else
        warning "Frontend health check: Not available"
    fi

    # Database connectivity
    echo "Database Health:"
    db_health=$(docker compose -f "$COMPOSE_FILE" ps postgres --format "table {{.Status}}" | grep -q "healthy" && echo "healthy" || echo "unhealthy")
    if [ "$db_health" = "healthy" ]; then
        success "Database connectivity: PASSED"
    else
        error "Database connectivity: FAILED"
    fi

    # Redis connectivity
    echo "Redis Health:"
    redis_health=$(docker compose -f "$COMPOSE_FILE" ps redis --format "table {{.Status}}" | grep -q "healthy" && echo "healthy" || echo "unhealthy")
    if [ "$redis_health" = "healthy" ]; then
        success "Redis connectivity: PASSED"
    else
        error "Redis connectivity: FAILED"
    fi
}

# Main execution
main() {
    check_user

    case "${1:-help}" in
        start) cmd_start ;;
        stop) cmd_stop ;;
        restart) cmd_restart ;;
        status) cmd_status ;;
        health) cmd_health ;;
        *) show_usage ;;
    esac
}

main "$@"
