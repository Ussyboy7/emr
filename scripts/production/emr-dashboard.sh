#!/bin/bash

# EMR Production Health Dashboard
# Real-time system health monitoring dashboard

set -e

# Configuration
COMPOSE_FILE="deployment/docker-compose.prod.yml"
REFRESH_INTERVAL=30  # seconds

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
WHITE='\033[1;37m'
NC='\033[0m'

# Clear screen
clear_screen() {
    clear
}

# Print header
header() {
    echo -e "${BLUE}================================================================================${NC}"
    echo -e "${BLUE}                    EMR PRODUCTION HEALTH DASHBOARD${NC}"
    echo -e "${BLUE}================================================================================${NC}"
    echo -e "${WHITE}Server: $(hostname) | Time: $(date) | User: $(whoami)${NC}"
    echo -e "${BLUE}--------------------------------------------------------------------------------${NC}"
}

# System status
system_status() {
    echo -e "${CYAN}SYSTEM STATUS${NC}"

    # Uptime
    local uptime=$(uptime | awk '{print $3,$4}' | sed 's/,//')
    echo -e "⏱️  Uptime: $uptime"

    # Load average
    local load=$(uptime | awk -F'load average:' '{print $2}' | awk '{print $1}')
    echo -e "📊 Load Average: $load"

    # System resources
    local cpu=$(top -bn1 | grep "Cpu(s)" | sed "s/.*, *\([0-9.]*\)%* id.*/\1/" | awk '{print 100 - $1}')
    local mem=$(free | grep Mem | awk '{printf "%.1f", $3/$2 * 100.0}')
    local disk=$(df / | tail -1 | awk '{print $5}' | sed 's/%//')

    echo -e "💻 CPU Usage: ${cpu}%"
    echo -e "🧠 Memory Usage: ${mem}%"
    echo -e "💾 Disk Usage (/): ${disk}%"

    # Status indicators
    if (( $(echo "$cpu > 80" | bc -l) )); then
        echo -e "${RED}   ⚠️  HIGH CPU USAGE${NC}"
    fi
    if (( $(echo "$mem > 85" | bc -l) )); then
        echo -e "${RED}   ⚠️  HIGH MEMORY USAGE${NC}"
    fi
    if [ "$disk" -gt 90 ]; then
        echo -e "${RED}   ⚠️  HIGH DISK USAGE${NC}"
    fi

    echo ""
}

# Docker services status
docker_status() {
    echo -e "${CYAN}DOCKER SERVICES${NC}"

    local services=("emr-nginx-prod" "emr-backend-prod" "emr-frontend-prod" "emr-postgres-prod" "emr-redis-prod")
    local all_healthy=true

    for service in "${services[@]}"; do
        if docker ps --filter "name=$service" --filter "status=running" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" | grep -q "$service"; then
            echo -e "${GREEN}✅ $service: RUNNING${NC}"
        else
            echo -e "${RED}❌ $service: STOPPED${NC}"
            all_healthy=false
        fi
    done

    if $all_healthy; then
        echo -e "${GREEN}🎉 All services healthy${NC}"
    else
        echo -e "${RED}⚠️  Services need attention${NC}"
    fi

    echo ""
}

# Application health
app_health() {
    echo -e "${CYAN}APPLICATION HEALTH${NC}"

    # EMR application
    if curl -s -f --max-time 5 http://localhost > /dev/null 2>&1; then
        echo -e "${GREEN}✅ EMR Frontend: ACCESSIBLE${NC}"
    else
        echo -e "${RED}❌ EMR Frontend: DOWN${NC}"
    fi

    # API health
    if curl -s -f --max-time 5 http://localhost/health > /dev/null 2>&1; then
        echo -e "${GREEN}✅ API Health Check: PASS${NC}"
    else
        echo -e "${RED}❌ API Health Check: FAIL${NC}"
    fi

    # Backend health
    if curl -s -f --max-time 5 http://localhost/api/health/live/ > /dev/null 2>&1; then
        echo -e "${GREEN}✅ Backend Health: PASS${NC}"
    else
        echo -e "${YELLOW}⚠️  Backend Health: Not implemented${NC}"
    fi

    # Response time
    local start_time=$(date +%s%3N 2>/dev/null || date +%s)
    curl -s -f http://localhost > /dev/null 2>&1
    local end_time=$(date +%s%3N 2>/dev/null || date +%s)
    local response_time=$((end_time - start_time))

    if [ "$response_time" -lt 2000 ]; then
        echo -e "${GREEN}⚡ Response Time: ${response_time}ms${NC}"
    else
        echo -e "${YELLOW}🐌 Response Time: ${response_time}ms${NC}"
    fi

    echo ""
}

# Backup status
backup_status() {
    echo -e "${CYAN}BACKUP STATUS${NC}"

    local backup_dir="$HOME/emr_backups"

    if [ -d "$backup_dir" ]; then
        local backup_count=$(find "$backup_dir" -name "20*" -type d 2>/dev/null | wc -l)
        echo -e "📦 Total Backups: $backup_count"

        local latest_backup=$(find "$backup_dir" -name "20*" -type d -printf '%T@ %p\n' 2>/dev/null | sort -n | tail -1 | cut -d' ' -f2-)
        if [ -n "$latest_backup" ]; then
            local backup_name=$(basename "$latest_backup")
            local backup_age=$(find "$latest_backup" -printf '%T@\n' | awk '{print int((systime() - $1)/3600) " hours ago"}')
            echo -e "🕒 Latest Backup: $backup_name ($backup_age)"

            # Check backup size
            local backup_size=$(du -sh "$latest_backup" 2>/dev/null | cut -f1)
            echo -e "📏 Backup Size: $backup_size"
        fi

        # Check cron status
        if crontab -l | grep -q "backup_database.sh"; then
            echo -e "${GREEN}✅ Automated Backups: ACTIVE${NC}"
        else
            echo -e "${RED}❌ Automated Backups: INACTIVE${NC}"
        fi
    else
        echo -e "${RED}❌ Backup Directory: NOT FOUND${NC}"
    fi

    echo ""
}

# Recent activity
recent_activity() {
    echo -e "${CYAN}RECENT ACTIVITY${NC}"

    # Recent monitoring logs
    local monitor_log="./monitoring.log"
    if [ -f "$monitor_log" ]; then
        echo -e "📋 Recent Monitoring Events:"
        tail -3 "$monitor_log" 2>/dev/null | sed 's/^/   /' || echo "   No recent logs"
    fi

    # Recent backup logs
    local cron_log="$HOME/emr_backups/cron.log"
    if [ -f "$cron_log" ]; then
        echo -e "💾 Recent Backup Events:"
        tail -2 "$cron_log" 2>/dev/null | sed 's/^/   /' || echo "   No recent backups"
    fi

    echo ""
}

# System alerts
system_alerts() {
    echo -e "${CYAN}SYSTEM ALERTS${NC}"

    local alerts_found=false

    # Check for high resource usage
    local cpu=$(top -bn1 | grep "Cpu(s)" | sed "s/.*, *\([0-9.]*\)%* id.*/\1/" | awk '{print 100 - $1}')
    if (( $(echo "$cpu > 80" | bc -l) )); then
        echo -e "${RED}🚨 HIGH CPU USAGE: ${cpu}%${NC}"
        alerts_found=true
    fi

    local mem=$(free | grep Mem | awk '{printf "%.1f", $3/$2 * 100.0}')
    if (( $(echo "$mem > 85" | bc -l) )); then
        echo -e "${RED}🚨 HIGH MEMORY USAGE: ${mem}%${NC}"
        alerts_found=true
    fi

    local disk=$(df / | tail -1 | awk '{print $5}' | sed 's/%//')
    if [ "$disk" -gt 90 ]; then
        echo -e "${RED}🚨 HIGH DISK USAGE: ${disk}%${NC}"
        alerts_found=true
    fi

    # Check service status
    if ! docker compose -f "$COMPOSE_FILE" ps | grep -q "Up"; then
        echo -e "${RED}🚨 SERVICES DOWN: Check Docker containers${NC}"
        alerts_found=true
    fi

    # Check backup age
    local latest_backup_age=$(find "$HOME/emr_backups" -name "20*" -type d -printf '%T@\n' 2>/dev/null | sort -n | tail -1)
    if [ -n "$latest_backup_age" ]; then
        local age_hours=$(( ($(date +%s) - ${latest_backup_age%.*}) / 3600 ))
        if [ "$age_hours" -gt 25 ]; then
            echo -e "${YELLOW}⚠️  OLD BACKUP: ${age_hours} hours since last backup${NC}"
            alerts_found=true
        fi
    else
        echo -e "${RED}🚨 NO BACKUPS: No backup directory found${NC}"
        alerts_found=true
    fi

    if ! $alerts_found; then
        echo -e "${GREEN}✅ No active alerts${NC}"
    fi

    echo ""
}

# Footer with commands
footer() {
    echo -e "${BLUE}================================================================================${NC}"
    echo -e "${WHITE}EMR Production Commands:${NC}"
    echo -e "  ${CYAN}./emr-prod-manager.sh status${NC}     - Service status"
    echo -e "  ${CYAN}./emr-prod-manager.sh health${NC}     - Health check"
    echo -e "  ${CYAN}./emr-prod-manager.sh backup${NC}     - Manual backup"
    echo -e "  ${CYAN}./emr-prod-manager.sh monitor${NC}    - System monitoring"
    echo -e "  ${CYAN}Ctrl+C${NC} to exit dashboard"
    echo -e "${BLUE}================================================================================${NC}"
}

# Main dashboard loop
main() {
    if [ "${1:-}" = "--once" ]; then
        # Single run mode
        clear_screen
        header
        system_status
        docker_status
        app_health
        backup_status
        recent_activity
        system_alerts
        footer
    else
        # Continuous monitoring mode
        while true; do
            clear_screen
            header
            system_status
            docker_status
            app_health
            backup_status
            recent_activity
            system_alerts
            footer

            echo -e "${YELLOW}Refreshing in ${REFRESH_INTERVAL} seconds... (Ctrl+C to exit)${NC}"
            sleep "$REFRESH_INTERVAL"
        done
    fi
}

# Run main dashboard
main "$@"