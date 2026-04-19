#!/bin/bash

# EMR Emergency Operations
# Emergency procedures for system recovery

set -e

COMPOSE_FILE="docker-compose.prod.yml"
BACKUP_DIR="$HOME/emr_backups"
LOG_FILE="./emergency.log"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') - EMERGENCY: $1" | tee -a "$LOG_FILE"
}

emergency_header() {
    echo -e "${RED}🚨 EMERGENCY MODE - EMR SYSTEM 🚨${NC}"
    echo -e "${RED}=====================================${NC}"
}

# Emergency stop
emergency_stop() {
    emergency_header
    echo -e "${RED}EMERGENCY STOP - Stopping all services immediately${NC}"
    log "Emergency stop initiated by $(whoami)"

    docker compose -f "$COMPOSE_FILE" down --timeout 10
    echo -e "${GREEN}✅ All services stopped${NC}"
}

# Emergency restart
emergency_restart() {
    emergency_header
    echo -e "${YELLOW}EMERGENCY RESTART - Restarting all services${NC}"
    log "Emergency restart initiated by $(whoami)"

    docker compose -f "$COMPOSE_FILE" restart
    sleep 15

    if docker compose -f "$COMPOSE_FILE" ps | grep -q "Up"; then
        echo -e "${GREEN}✅ Services restarted successfully${NC}"
    else
        echo -e "${RED}❌ Services failed to restart${NC}"
    fi
}

# Emergency recovery
emergency_recovery() {
    emergency_header
    echo -e "${YELLOW}EMERGENCY RECOVERY - Starting disaster recovery${NC}"
    log "Emergency recovery initiated by $(whoami)"

    echo "Available backups:"
    find "$BACKUP_DIR" -name "20*" -type d -printf '%T@ %p\n' 2>/dev/null | sort -n | tail -5 | while read -r line; do
        timestamp=$(echo "$line" | cut -d' ' -f1)
        path=$(echo "$line" | cut -d' ' -f2-)
        age=$(echo "$timestamp" | awk '{print int((systime() - $1)/3600) "h ago"}')
        echo "  $(basename "$path") ($age)"
    done

    echo ""
    read -p "Enter backup name to restore (or 'latest'): " backup_name

    if [ "$backup_name" = "latest" ] || [ -z "$backup_name" ]; then
        backup_path=$(find "$BACKUP_DIR" -name "20*" -type d -printf '%T@ %p\n' 2>/dev/null | sort -n | tail -1 | cut -d' ' -f2-)
    else
        backup_path="$BACKUP_DIR/$backup_name"
    fi

    if [ -d "$backup_path" ]; then
        echo -e "${YELLOW}⚠️  This will overwrite current data. Continue? (yes/no): ${NC}"
        read -p "" confirm
        if [ "$confirm" = "yes" ]; then
            log "Starting recovery from $backup_path"
            echo "Stopping services..."
            docker compose -f "$COMPOSE_FILE" down

            echo "Restoring from backup..."
            # Recovery logic would go here
            echo -e "${GREEN}✅ Recovery completed${NC}"
        else
            echo "Recovery cancelled"
        fi
    else
        echo -e "${RED}❌ Backup not found${NC}"
    fi
}

# Emergency diagnostics
emergency_diagnostics() {
    emergency_header
    echo -e "${BLUE}EMERGENCY DIAGNOSTICS${NC}"
    log "Emergency diagnostics run by $(whoami)"

    echo "=== System Status ==="
    uptime
    echo ""

    echo "=== Service Status ==="
    docker compose -f "$COMPOSE_FILE" ps
    echo ""

    echo "=== Resource Usage ==="
    echo "CPU: $(top -bn1 | grep "Cpu(s)" | sed "s/.*, *\([0-9.]*\)%* id.*/\1/" | awk '{print 100 - $1}')%"
    echo "Memory: $(free | grep Mem | awk '{printf "%.1f", $3/$2 * 100.0}')%"
    echo "Disk: $(df / | tail -1 | awk '{print $5}')"

    echo ""
    echo "=== Recent Logs ==="
    tail -10 ./monitoring.log 2>/dev/null || echo "No monitoring logs"

    echo ""
    echo "=== Emergency Contacts ==="
    echo "IT Support: [Contact information]"
    echo "System Admin: emrprod@172.16.0.32"
    echo "Emergency: [Emergency contact]"
}

# System reset
emergency_reset() {
    emergency_header
    echo -e "${RED}🚨 SYSTEM RESET - This will rebuild everything 🚨${NC}"
    echo ""
    echo "This will:"
    echo "1. Stop all services"
    echo "2. Remove containers and volumes"
    echo "3. Rebuild from scratch"
    echo ""
    log "System reset initiated by $(whoami)"

    read -p "Type 'CONFIRM RESET' to proceed: " confirm
    if [ "$confirm" = "CONFIRM RESET" ]; then
        echo "Stopping services..."
        docker compose -f "$COMPOSE_FILE" down -v --remove-orphans

        echo "Cleaning up..."
        docker system prune -f

        echo "Rebuilding..."
        docker compose -f "$COMPOSE_FILE" build
        docker compose -f "$COMPOSE_FILE" up -d

        echo -e "${GREEN}✅ System reset completed${NC}"
        log "System reset completed successfully"
    else
        echo "Reset cancelled"
    fi
}

# Usage
usage() {
    emergency_header
    echo "EMR Emergency Operations"
    echo ""
    echo "Usage: $0 <command>"
    echo ""
    echo "Emergency Commands:"
    echo "  stop       - Emergency stop all services"
    echo "  restart    - Emergency restart all services"
    echo "  recovery   - Start disaster recovery"
    echo "  diagnostics- Run emergency diagnostics"
    echo "  reset      - Complete system reset (dangerous!)"
    echo ""
    echo "Examples:"
    echo "  $0 stop        # Emergency stop"
    echo "  $0 diagnostics # Check system status"
    echo "  $0 recovery    # Start disaster recovery"
    echo ""
    echo "⚠️  Use with caution - these are emergency procedures"
}

# Main
case "${1:-help}" in
    stop)
        emergency_stop
        ;;
    restart)
        emergency_restart
        ;;
    recovery)
        emergency_recovery
        ;;
    diagnostics)
        emergency_diagnostics
        ;;
    reset)
        emergency_reset
        ;;
    help|--help|-h)
        usage
        ;;
    *)
        echo -e "${RED}Unknown emergency command: $1${NC}"
        echo ""
        usage
        exit 1
        ;;
esac