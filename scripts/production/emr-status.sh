#!/bin/bash

# EMR Quick Status Checker
# Fast status check for production operations

COMPOSE_FILE="deployment/docker-compose.prod.yml"

echo "=== EMR Production Status ==="
echo "Time: $(date)"
echo ""

# Services status
echo "Services:"
docker compose -f "$COMPOSE_FILE" ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}"
echo ""

# Quick health check
echo "Health:"
if curl -s -f --max-time 3 http://localhost/health > /dev/null 2>&1; then
    echo "✅ API: Healthy"
else
    echo "❌ API: Unhealthy"
fi

# System resources
echo ""
echo "Resources:"
echo "CPU: $(top -bn1 | grep "Cpu(s)" | sed "s/.*, *\([0-9.]*\)%* id.*/\1/" | awk '{print 100 - $1}')%"
echo "Memory: $(free | grep Mem | awk '{printf "%.1f", $3/$2 * 100.0}')%"
echo "Disk: $(df / | tail -1 | awk '{print $5}')"

# Recent backup
echo ""
echo "Latest Backup:"
LATEST=$(find ~/emr_backups -name "20*" -type d -printf '%T@ %p\n' 2>/dev/null | sort -n | tail -1 | cut -d' ' -f2-)
if [ -n "$LATEST" ]; then
    echo "$(basename "$LATEST") ($(find "$LATEST" -printf '%T@\n' | awk '{print int((systime() - $1)/3600) "h ago"}'))"
else
    echo "❌ No backups found"
fi

echo ""
echo "For detailed status: ./emr-prod-manager.sh status"
echo "For dashboard: ./emr-dashboard.sh"