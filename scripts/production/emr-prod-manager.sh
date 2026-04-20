#!/bin/bash

# EMR Production Environment Manager
# Comprehensive production operations script

set -e

# Configuration
COMPOSE_FILE="deployment/docker-compose.prod.yml"
BACKUP_DIR="$HOME/emr_backups"
LOG_DIR="./logs"
MONITOR_LOG="./monitoring.log"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m'

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
        echo "Current user: $USER"
    fi
}

# Show usage
usage() {
    header "EMR Production Manager"
    echo "Usage: $0 <command>"
    echo ""
    echo "Production Commands:"
    echo "  start           Start all production services"
    echo "  stop            Stop all production services"
    echo "  restart         Restart all production services"
    echo "  status          Show services status"
    echo "  health          Run comprehensive health check"
    echo "  logs            Show recent application logs"
    echo ""
    echo "Backup Commands:"
    echo "  backup          Run manual database backup"
    echo "  backup-status   Check backup status"
    echo "  verify-backup   Verify latest backup integrity"
    echo ""
    echo "Monitoring Commands:"
    echo "  monitor         Run system monitoring"
    echo "  performance     Run performance testing"
    echo "  alerts          Check for active alerts"
    echo ""
    echo "Maintenance Commands:"
    echo "  update          Update application (with backup)"
    echo "  cleanup         Clean up old logs and temp files"
    echo "  diagnostics     Run full system diagnostics"
    echo ""
    echo "Emergency Commands:"
    echo "  emergency-stop  Emergency stop all services"
    echo "  recovery        Start disaster recovery"
    echo "  panic           Complete system reset"
    echo ""
    echo "Examples:"
    echo "  $0 start        # Start EMR production"
    echo "  $0 health       # Check system health"
    echo "  $0 backup       # Create backup"
    echo ""
}

# Start production services
cmd_start() {
    header "Starting EMR Production Services"
    log "Starting EMR production services"

    # Change to project root directory
    cd "$(dirname "$0")/../.." || exit 1

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
    info "Access EMR at: http://172.16.0.32"
}

# Stop production services
cmd_stop() {
    header "Stopping EMR Production Services"
    log "Stopping EMR production services"

    # Change to project root directory
    cd "$(dirname "$0")/../.." || exit 1

    info "Stopping Docker services..."
    docker compose -f "$COMPOSE_FILE" down

    success "EMR production services stopped"
}

# Restart production services
cmd_restart() {
    header "Restarting EMR Production Services"
    log "Restarting EMR production services"

    # Change to project root directory
    cd "$(dirname "$0")/../.." || exit 1

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
    info "Access EMR at: http://172.16.0.32"
}

# Cleanup maintenance
cmd_cleanup() {
    header "EMR System Cleanup"
    log "Running system cleanup"

    info "Cleaning up old Docker images..."
    docker image prune -f

    info "Cleaning up old logs..."
    find "$LOG_DIR" -name "*.log" -mtime +30 -delete 2>/dev/null || true

    info "Cleaning up backup temp files..."
    find "$BACKUP_DIR" -name "*.tmp" -delete 2>/dev/null || true

    success "System cleanup completed"
}

# Full diagnostics
cmd_diagnostics() {
    header "EMR System Diagnostics"
    log "Running full system diagnostics"

    echo "=== System Information ==="
    uname -a
    echo "User: $(whoami)"
    echo "Uptime: $(uptime)"
    echo ""

    echo "=== Docker Information ==="
    docker --version
    docker compose version
    echo ""

    echo "=== Disk Usage ==="
    df -h
    echo ""

    echo "=== Memory Usage ==="
    free -h
    echo ""

    echo "=== Network Status ==="
    ip addr show | grep "inet " | grep -v "127.0.0.1"
    echo ""

    echo "=== Service Status ==="
    cmd_status
    echo ""

    echo "=== Recent Logs ==="
    cmd_logs
}

# Emergency stop
cmd_emergency_stop() {
    header "EMERGENCY STOP - EMR Services"
    warning "This will immediately stop all EMR services"
    read -p "Are you sure? (yes/N): " response

    if [ "$response" = "yes" ]; then
        log "EMERGENCY STOP initiated by $(whoami)"
        docker compose -f "$COMPOSE_FILE" down --timeout 10
        error "EMR services emergency stopped"
    else
        info "Emergency stop cancelled"
    fi
}

# Recovery mode
cmd_recovery() {
    header "EMR Disaster Recovery"
    warning "This will start disaster recovery procedures"
    read -p "Do you have a backup to restore from? (y/N): " -n 1 -r
    echo ""

    if [[ $REPLY =~ ^[Yy]$ ]]; then
        if [ -f "./scripts/backup/restore_backup.sh" ]; then
            ./scripts/backup/restore_backup.sh
        else
            error "Recovery script not found"
        fi
    else
        info "Starting services without data recovery..."
        cmd_start
    fi
}

# Complete system reset
cmd_panic() {
    header "PANIC BUTTON - Complete System Reset"
    error "⚠️  WARNING: This will reset the entire EMR system!"
    echo ""
    echo "This will:"
    echo "1. Stop all services"
    echo "2. Remove all containers and volumes"
    echo "3. Rebuild from scratch"
    echo ""
    read -p "Type 'PANIC RESET' to confirm: " response

    if [ "$response" = "PANIC RESET" ]; then
        log "PANIC RESET initiated by $(whoami)"

        info "Stopping services..."
        docker compose -f "$COMPOSE_FILE" down -v --remove-orphans

        info "Cleaning up..."
        docker system prune -f

        info "Rebuilding system..."
        cmd_start

        success "System reset completed"
    else
        info "Panic reset cancelled"
    fi
}

# Main command dispatcher
main() {
    check_user

    case "${1:-help}" in
        start)
            cmd_start
            ;;
        stop)
            cmd_stop
            ;;
        restart)
            cmd_restart
            ;;
        status)
            cmd_status
            ;;
        health)
            cmd_health
            ;;
        logs)
            cmd_logs
            ;;
        backup)
            cmd_backup
            ;;
        backup-status)
            cmd_backup_status
            ;;
        verify-backup)
            cmd_verify_backup
            ;;
        monitor)
            cmd_monitor
            ;;
        performance)
            cmd_performance
            ;;
        alerts)
            cmd_alerts
            ;;
        update)
            cmd_update
            ;;
        cleanup)
            cmd_cleanup
            ;;
        diagnostics)
            cmd_diagnostics
            ;;
        emergency-stop)
            cmd_emergency_stop
            ;;
        recovery)
            cmd_recovery
            ;;
        panic)
            cmd_panic
            ;;
        help|--help|-h)
            usage
            ;;
        *)
            error "Unknown command: $1"
            echo ""
            usage
            exit 1
            ;;
    esac
}

# Run main function
main "$@"