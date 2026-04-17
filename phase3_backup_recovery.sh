# EMR Production Deployment - Phase 3: Backup & Recovery System
# Commands to run on Server B (172.16.0.32) and Server A (172.16.0.30)

## Automated Backup Configuration on Server B
# Create backup script
sudo tee /usr/local/bin/emr_backup.sh > /dev/null << 'EOF'
#!/bin/bash
# EMR Production Backup Script
# Run daily via cron on Server B

BACKUP_DIR="/home/emrprod/emr/backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_NAME="emr_backup_${TIMESTAMP}"

# Database backup
echo "Starting database backup..."
docker compose -f /home/emrprod/emr/docker-compose.prod.yml exec -T postgres pg_dump -U emradmin -d emrprod > "${BACKUP_DIR}/${BACKUP_NAME}_db.sql"

# Compress database backup
gzip "${BACKUP_DIR}/${BACKUP_NAME}_db.sql"

# Application data backup (logs, media, configs)
echo "Backing up application data..."
tar -czf "${BACKUP_DIR}/${BACKUP_NAME}_app.tar.gz" \
  -C /home/emrprod/emr logs/ \
  --exclude='logs/production/*.log' \
  --exclude='media/cache/*'

# Transfer to Server A
echo "Transferring backup to Server A..."
rsync -avz --delete "${BACKUP_DIR}/" emrprod2@172.16.0.30:/backup/server_b/

# Cleanup old backups (keep last 7 daily, 4 weekly, 12 monthly)
echo "Cleaning up old backups..."
find "${BACKUP_DIR}" -name "emr_backup_*_db.sql.gz" -mtime +7 -delete
find "${BACKUP_DIR}" -name "emr_backup_*_app.tar.gz" -mtime +7 -delete

echo "Backup completed at $(date)"
EOF

sudo chmod +x /usr/local/bin/emr_backup.sh
sudo chown emrprod:emrprod /usr/local/bin/emr_backup.sh

## Set up daily backup cron job on Server B
# Add to crontab (run at 2 AM daily)
(crontab -l ; echo "0 2 * * * /usr/local/bin/emr_backup.sh >> /home/emrprod/emr/logs/backup.log 2>&1") | crontab -

## Backup Transfer & Storage on Server A
# Create backup rotation script on Server A
sudo tee /usr/local/bin/backup_rotation.sh > /dev/null << 'EOF'
#!/bin/bash
# Backup rotation and validation on Server A

BACKUP_DIR="/backup/server_b"
LOG_FILE="/var/log/backup_rotation.log"

log() {
    echo "$(date +"%Y-%m-%d %H:%M:%S") - $1" >> "$LOG_FILE"
}

log "Starting backup rotation"

# Validate latest backup
LATEST_DB=$(ls -t "${BACKUP_DIR}"/emr_backup_*_db.sql.gz | head -1)
if [ -f "$LATEST_DB" ]; then
    log "Validating backup: $LATEST_DB"
    # Test gzip integrity
    if gzip -t "$LATEST_DB"; then
        log "Backup validation passed"
    else
        log "ERROR: Backup validation failed"
        # Send alert (add your notification logic)
    fi
else
    log "ERROR: No database backup found"
fi

# Rotate backups (keep 30 days on Server A)
find "${BACKUP_DIR}" -name "emr_backup_*" -mtime +30 -delete

log "Backup rotation completed"
EOF

sudo chmod +x /usr/local/bin/backup_rotation.sh
sudo chown emrprod2:emrprod2 /usr/local/bin/backup_rotation.sh

# Set up daily rotation cron on Server A
(crontab -l ; echo "30 2 * * * /usr/local/bin/backup_rotation.sh") | crontab -

## Recovery Procedures
# Create system restoration script on Server A
sudo tee /usr/local/bin/emr_restore.sh > /dev/null << 'EOF'
#!/bin/bash
# EMR System Restoration Script
# Run on Server A to restore system from backups

set -e

BACKUP_DIR="/backup/server_b"
RESTORE_TIMESTAMP=${1:-$(ls -t "${BACKUP_DIR}"/emr_backup_*_db.sql.gz | head -1 | sed 's/.*emr_backup_\([0-9_]*\)_db\.sql\.gz/\1/')}

echo "Restoring EMR system from backup: $RESTORE_TIMESTAMP"

# Stop current services (if running)
docker compose -f /home/emrprod2/emr_restore/docker-compose.prod.yml down || true

# Restore database
DB_BACKUP="${BACKUP_DIR}/emr_backup_${RESTORE_TIMESTAMP}_db.sql.gz"
if [ -f "$DB_BACKUP" ]; then
    echo "Restoring database..."
    gunzip -c "$DB_BACKUP" | docker compose -f /home/emrprod2/emr_restore/docker-compose.prod.yml exec -T postgres psql -U emradmin -d emrprod
else
    echo "ERROR: Database backup not found: $DB_BACKUP"
    exit 1
fi

# Restore application data
APP_BACKUP="${BACKUP_DIR}/emr_backup_${RESTORE_TIMESTAMP}_app.tar.gz"
if [ -f "$APP_BACKUP" ]; then
    echo "Restoring application data..."
    tar -xzf "$APP_BACKUP" -C /home/emrprod2/emr_restore/
fi

# Start services
echo "Starting EMR services..."
docker compose -f /home/emrprod2/emr_restore/docker-compose.prod.yml up -d

echo "Restoration completed. Verify system at medical.npa.local"
EOF

sudo chmod +x /usr/local/bin/emr_restore.sh
sudo chown emrprod2:emrprod2 /usr/local/bin/emr_restore.sh

## Offsite Backup Sync
# Install rclone for DR site sync
sudo apt install -y rclone

# Configure rclone (manual step - configure remote storage)
# rclone config (follow prompts for your DR storage)

# Create sync script
sudo tee /usr/local/bin/dr_sync.sh > /dev/null << 'EOF'
#!/bin/bash
# Sync backups to DR site

BACKUP_DIR="/backup/server_b"
DR_REMOTE="dr-site"  # Configure in rclone

rclone sync "${BACKUP_DIR}" "${DR_REMOTE}:/emr_backups/$(hostname)/" --log-file /var/log/dr_sync.log
EOF

sudo chmod +x /usr/local/bin/dr_sync.sh

# Weekly DR sync (adjust schedule as needed)
(crontab -l ; echo "0 3 * * 0 /usr/local/bin/dr_sync.sh") | crontab -

## Testing Backup Procedures
# Test backup creation
/usr/local/bin/emr_backup.sh

# Test backup transfer
rsync -avz --delete /backup/server_b/ emrprod2@172.16.0.30:/backup/server_b/

# Test backup validation
/usr/local/bin/backup_rotation.sh

# Test restoration (in isolated environment)
/usr/local/bin/emr_restore.sh

## Monitoring for Backup Success/Failure
# Add to monitoring system (will be set up in Phase 4)
# Check backup log: tail -f /home/emrprod/emr/logs/backup.log
# Check rotation log: tail -f /var/log/backup_rotation.log