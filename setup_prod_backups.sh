#!/bin/bash

# Production Server Backup Setup
# Run this script on your production server to set up automated backups

echo "=== EMR Production Backup Setup ==="
echo "Setting up automated backups for server: $(hostname)"
echo ""

# Create backups directory if it doesn't exist
echo "Creating backups directory..."
mkdir -p /home/emrprod/emr/backups

# Set proper permissions
echo "Setting permissions..."
chmod +x /home/emrprod/emr/backup_database.sh
chmod +x /home/emrprod/emr/verify_backup.sh
chmod +x /home/emrprod/emr/restore_backup.sh

# Test backup system
echo "Testing backup system..."
cd /home/emrprod/emr
./backup_database.sh

if [ $? -eq 0 ]; then
    echo "✅ Backup test successful!"
    echo ""

    # Set up cron jobs
    echo "Setting up automated backup cron jobs..."
    echo "Daily backup at 2:00 AM..."
    (crontab -l 2>/dev/null; echo "0 2 * * * /home/emrprod/emr/backup_database.sh >> /home/emrprod/emr/backups/cron.log 2>&1") | crontab -

    echo "Weekly verification on Sundays at 3:00 AM..."
    (crontab -l 2>/dev/null; echo "0 3 * * 0 /home/emrprod/emr/verify_backup.sh >> /home/emrprod/emr/backups/cron.log 2>&1") | crontab -

    echo ""
    echo "=== Backup System Setup Complete! ==="
    echo ""
    echo "📋 What's configured:"
    echo "  📁 Backup location: /home/emrprod/emr/backups/"
    echo "  ⏰ Daily backups: Every day at 2:00 AM"
    echo "  🔍 Weekly verification: Every Sunday at 3:00 AM"
    echo "  📊 Retention: 7 days (automatic cleanup)"
    echo ""
    echo "📊 Monitor backups:"
    echo "  tail -f /home/emrprod/emr/backups/backup.log"
    echo "  tail -f /home/emrprod/emr/backups/cron.log"
    echo ""
    echo "🚨 Emergency recovery:"
    echo "  /home/emrprod/emr/restore_backup.sh"
    echo ""
    echo "✅ View current backups:"
    ls -la /home/emrprod/emr/backups/

else
    echo "❌ Backup test failed! Check logs above."
    exit 1
fi