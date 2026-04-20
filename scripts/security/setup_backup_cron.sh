#!/bin/bash

# Setup automated backups for EMR system

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_SCRIPT="${SCRIPT_DIR}/backup_database.sh"
VERIFY_SCRIPT="${SCRIPT_DIR}/verify_backup.sh"
LOG_FILE="${HOME}/emr_backups/cron.log"

# Create log file
touch "$LOG_FILE"

# Add to crontab (daily at 10 PM)
(crontab -l 2>/dev/null; echo "0 22 * * * $BACKUP_SCRIPT >> /home/emrprod/emr_backups/cron.log 2>&1") | crontab -

# Add weekly verification (Saturdays at 10 AM)
(crontab -l 2>/dev/null; echo "0 10 * * 6 $VERIFY_SCRIPT >> /home/emrprod/emr_backups/cron.log 2>&1") | crontab -

echo "Automated backup cron jobs configured:"
echo "- Daily database/media backup at 10:00 PM"
echo "- Weekly backup verification on Saturdays at 10:00 AM"

echo "View backup logs: tail -f $LOG_FILE"
echo "View cron jobs: crontab -l"