#!/bin/bash

# Production Server Backup Setup
# Run this script on your production server to set up automated backups

echo "=== EMR Production Backup Setup ==="
echo "Setting up automated backups for server: $(hostname)"
echo ""

# Create backups directory if it doesn't exist
echo "Creating backups directory..."
BACKUP_DIR="${HOME}/emr_backups"
mkdir -p "$BACKUP_DIR"

# Set proper permissions
echo "Setting permissions..."
chmod +x backup_database.sh
chmod +x verify_backup.sh
chmod +x restore_backup.sh

# Test backup system
echo "Testing backup system..."
./backup_database.sh

if [ $? -eq 0 ]; then
    echo "✅ Backup test successful!"
    echo ""

    # Set up cron jobs
    echo "Setting up automated backup cron jobs..."
    SCRIPT_DIR="$(pwd)"
    echo "Daily backup at 2:00 AM..."
    (crontab -l 2>/dev/null; echo "0 2 * * * $SCRIPT_DIR/backup_database.sh >> $BACKUP_DIR/cron.log 2>&1") | crontab -

    echo "Weekly verification on Sundays at 3:00 AM..."
    (crontab -l 2>/dev/null; echo "0 3 * * 0 $SCRIPT_DIR/verify_backup.sh >> $BACKUP_DIR/cron.log 2>&1") | crontab -

    echo ""
    echo "=== Backup System Setup Complete! ==="
    echo ""
    echo "📋 What's configured:"
    echo "  📁 Backup location: $BACKUP_DIR/"
    echo "  ⏰ Daily backups: Every day at 2:00 AM"
    echo "  🔍 Weekly verification: Every Sunday at 3:00 AM"
    echo "  📊 Retention: 7 days (automatic cleanup)"
    echo ""
    echo "📊 Monitor backups:"
    echo "  tail -f $BACKUP_DIR/backup.log"
    echo "  tail -f $BACKUP_DIR/cron.log"
    echo ""
    echo "🚨 Emergency recovery:"
    echo "  $SCRIPT_DIR/restore_backup.sh"
    echo ""
    echo "✅ View current backups:"
    ls -la "$BACKUP_DIR/"

else
    echo "❌ Backup test failed! Check logs above."
    exit 1
fi