#!/bin/bash

# Check if today's backup ran
# This script helps debug backup execution issues

echo "=== Checking Today's Backup Status ==="
echo "Current date: $(date)"
echo "Current time: $(date +%H:%M)"
echo ""

# Check if cron log exists
CRON_LOG="$HOME/emr_backups/cron.log"
if [ -f "$CRON_LOG" ]; then
    echo "✅ Cron log exists: $CRON_LOG"
    echo "Last 10 lines of cron log:"
    tail -10 "$CRON_LOG"
    echo ""

    # Check today's entries
    TODAY=$(date +%Y-%m-%d)
    echo "Checking for today's date ($TODAY) in cron log:"
    if grep -q "$TODAY" "$CRON_LOG"; then
        echo "✅ Found today's entries in cron log"
        grep "$TODAY" "$CRON_LOG" | head -5
    else
        echo "❌ No entries for today found in cron log"
    fi
    echo ""
else
    echo "❌ Cron log does not exist: $CRON_LOG"
    echo "This means no cron jobs have logged yet."
    echo ""
fi

# Check backup directories
echo "Checking backup directories:"
ls -la ~/emr_backups/ 2>/dev/null || echo "No backup directory found"
echo ""

# Check if cron daemon is running
echo "Checking if cron service is running:"
if pgrep -x "cron" > /dev/null || pgrep -x "crond" > /dev/null; then
    echo "✅ Cron daemon is running"
else
    echo "❌ Cron daemon is NOT running"
    echo "Try: sudo systemctl start cron"
fi
echo ""

# Test manual backup
echo "Testing manual backup execution..."
echo "This will create a backup immediately for testing:"
read -p "Run manual backup test? (y/N): " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "Running manual backup..."
    ./backup_database.sh
    echo "Manual backup completed. Check ~/emr_backups/ for new backup."
else
    echo "Manual backup test skipped."
fi