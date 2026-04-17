#!/bin/bash

# Update EMR Backup Schedule
# Change daily backups to 10:00 PM and weekly verification to Saturday 10:00 AM

echo "=== Updating EMR Backup Schedule ==="

# Remove existing cron jobs
echo "Removing existing backup cron jobs..."
crontab -l 2>/dev/null | grep -v "backup_database.sh\|verify_backup.sh" | crontab -

# Add updated cron jobs
echo "Adding new backup schedule..."
SCRIPT_DIR="$(pwd)"

# Daily backup at 10:00 PM (22:00)
echo "Setting daily backup at 10:00 PM..."
(crontab -l 2>/dev/null; echo "0 22 * * * $SCRIPT_DIR/backup_database.sh >> ~/emr_backups/cron.log 2>&1") | crontab -

# Weekly verification on Saturdays at 10:00 AM
echo "Setting weekly verification on Saturdays at 10:00 AM..."
(crontab -l 2>/dev/null; echo "0 10 * * 6 $SCRIPT_DIR/verify_backup.sh >> ~/emr_backups/cron.log 2>&1") | crontab -

echo ""
echo "=== Backup Schedule Updated Successfully! ==="
echo ""
echo "📅 New Schedule:"
echo "  🕙 Daily Database Backup: Every day at 10:00 PM"
echo "  🕐 Weekly Verification: Every Saturday at 10:00 AM"
echo ""
echo "📋 Current cron jobs:"
crontab -l
echo ""
echo "📊 Monitor backups:"
echo "  tail -f ~/emr_backups/cron.log"