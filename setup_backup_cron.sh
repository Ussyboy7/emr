#!/bin/bash

# Setup automated backups for EMR system

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_SCRIPT="${SCRIPT_DIR}/backup_database.sh"
VERIFY_SCRIPT="${SCRIPT_DIR}/verify_backup.sh"
LOG_FILE="${SCRIPT_DIR}/backups/cron.log"

# Create log file
touch "$LOG_FILE"

# Add to crontab (daily at 2 AM)
(crontab -l 2>/dev/null; echo "0 2 * * * $BACKUP_SCRIPT >> $LOG_FILE 2>&1") | crontab -

# Add weekly verification (Sundays at 3 AM)
(crontab -l 2>/dev/null; echo "0 3 * * 0 $VERIFY_SCRIPT >> $LOG_FILE 2>&1") | crontab -

echo "Automated backup cron jobs configured:"
echo "- Daily database/media backup at 2:00 AM"
echo "- Weekly backup verification on Sundays at 3:00 AM"
echo ""
echo "View backup logs: tail -f $LOG_FILE"
echo "View cron jobs: crontab -l"