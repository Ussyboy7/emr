#!/bin/bash

# Clean up duplicate cron jobs for EMR system
# Remove old duplicate entries and keep only the correct ones

echo "=== Cleaning Up Duplicate Cron Jobs ==="

# Show current cron jobs
echo "Current cron jobs:"
crontab -l
echo ""

# Remove all EMR-related cron jobs
echo "Removing all existing EMR cron jobs..."
crontab -l 2>/dev/null | grep -v "backup_database.sh\|verify_backup.sh\|monitor_system.sh\|check_security.sh" | crontab -

# Add back only the correct jobs
echo "Adding correct cron jobs..."
SCRIPT_DIR="$(pwd)"

# Daily backup at 10:00 PM (correct path)
(crontab -l 2>/dev/null; echo "0 22 * * * $SCRIPT_DIR/backup_database.sh >> ~/emr_backups/cron.log 2>&1") | crontab -

# Weekly verification on Saturdays at 10:00 AM (correct path)
(crontab -l 2>/dev/null; echo "0 10 * * 6 $SCRIPT_DIR/verify_backup.sh >> ~/emr_backups/cron.log 2>&1") | crontab -

# System monitoring every 5 minutes
(crontab -l 2>/dev/null; echo "*/5 * * * * $SCRIPT_DIR/monitor_system.sh >> $SCRIPT_DIR/monitoring.log 2>&1") | crontab -

# Security checks every 4 hours
(crontab -l 2>/dev/null; echo "0 */4 * * * $SCRIPT_DIR/check_security.sh >> $SCRIPT_DIR/logs/security.log 2>&1") | crontab -

echo ""
echo "=== Cron Jobs Cleaned Up Successfully ==="
echo ""
echo "✅ Removed duplicate backup jobs"
echo "✅ Kept only correct cron jobs with proper paths"
echo ""
echo "📋 Final cron jobs:"
crontab -l
echo ""
echo "🎯 Schedule Summary:"
echo "  🕙 Daily Backup: 10:00 PM → ~/emr_backups/cron.log"
echo "  🕐 Weekly Verification: Saturdays 10:00 AM → ~/emr_backups/cron.log"
echo "  👁️  System Monitoring: Every 5 minutes → ./monitoring.log"
echo "  🔍 Security Checks: Every 4 hours → ./logs/security.log"