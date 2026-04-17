#!/bin/bash

# Manual Backup Trigger Script
# Run this to test if the backup system works

echo "=== Manual EMR Backup Test ==="
echo "Testing backup system execution..."

# Get the script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Run the backup script
echo "Running backup script..."
"$SCRIPT_DIR/backup_database.sh"

if [ $? -eq 0 ]; then
    echo "✅ Backup completed successfully!"
    echo ""

    # Show backup results
    echo "Backup directories:"
    ls -la ~/emr_backups/ 2>/dev/null || echo "No backup directory found"

    echo ""
    echo "Recent backup logs:"
    tail -10 ~/emr_backups/cron.log 2>/dev/null || echo "No cron log found"

    echo ""
    echo "Latest backup contents:"
    LATEST_BACKUP=$(find ~/emr_backups -name "20*" -type d -printf '%T@ %p\n' 2>/dev/null | sort -n | tail -1 | cut -d' ' -f2-)
    if [ -n "$LATEST_BACKUP" ]; then
        ls -la "$LATEST_BACKUP"
    else
        echo "No backups found"
    fi
else
    echo "❌ Backup failed!"
    echo "Check the backup log for details:"
    tail -20 ~/emr_backups/cron.log 2>/dev/null || echo "No log available"
fi