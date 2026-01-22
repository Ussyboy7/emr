# EMR Staging Data Management Guide

## Overview
This guide explains how to manage data persistence in the EMR staging environment to prevent data loss during builds, restarts, and seed operations.

## Docker Volume Persistence

The staging environment uses named Docker volumes to persist data across container restarts and rebuilds:

### Persistent Volumes
- `postgres_data_stag` - PostgreSQL database data
- `redis_data_stag` - Redis cache data
- `static_files_stag` - Django static files
- `media_files_stag` - Django uploaded media files
- `backups_stag` - Database backups

### Volume Inspection
```bash
# Check volume status
docker volume ls | grep stag

# Inspect volume details
docker volume inspect emr_postgres_data_stag

# View volume data (if using local driver)
ls -la /var/lib/docker/volumes/emr_postgres_data_stag/_data/
```

## Seed Data Operations

### Safe Seed Commands

**⚠️ WARNING: The default `--reset` flag DELETES ALL DATA**

#### Option 1: Safe Seeding (Preserves Users)
```bash
# Run seed data without deleting existing users/clinics
docker-compose -f docker-compose.stag.yml exec backend python manage.py seed_demo_data --preserve-users

# Or without reset flag (adds to existing data)
docker-compose -f docker-compose.stag.yml exec backend python manage.py seed_demo_data
```

#### Option 2: Full Reset (⚠️ DELETES EVERYTHING)
```bash
# This will delete ALL data including users
docker-compose -f docker-compose.stag.yml exec backend python manage.py seed_demo_data --reset
```

### Manual Backup Before Seeding
```bash
# Backup important data before seeding
docker-compose -f docker-compose.stag.yml exec backend python manage.py backup_data

# Check backup files
docker-compose -f docker-compose.stag.yml exec backend ls -la /backups/

# Run seed with reset (if needed)
docker-compose -f docker-compose.stag.yml exec backend python manage.py seed_demo_data --reset

# Restore if needed
docker-compose -f docker-compose.stag.yml exec backend python manage.py restore_data /backups/latest_backup_dir
```

## Automatic Backups

The staging backend automatically creates backups on startup:
- Located in `/backups/` inside the container
- Available at `./backups/` on the host
- Files are timestamped and include summary

## Data Recovery

### Restore from Backup
```bash
# List available backups
ls -la ./backups/

# Dry run restore
docker-compose -f docker-compose.stag.yml exec backend python manage.py restore_data /backups/backup_dir --dry-run

# Perform restore
docker-compose -f docker-compose.stag.yml exec backend python manage.py restore_data /backups/backup_dir
```

### Volume Recovery
```bash
# Stop containers
docker-compose -f docker-compose.stag.yml down

# Create backup of volume (if needed)
docker run --rm -v emr_postgres_data_stag:/source -v $(pwd)/volume_backup:/backup alpine tar czf /backup/postgres_backup.tar.gz -C /source .

# Restore volume from backup (if available)
docker run --rm -v emr_postgres_data_stag:/target -v $(pwd)/volume_backup:/backup alpine tar xzf /backup/postgres_backup.tar.gz -C /target

# Restart containers
docker-compose -f docker-compose.stag.yml up -d
```

## Best Practices

### 1. Always Backup Before Major Operations
```bash
# Before seeding or major changes
docker-compose -f docker-compose.stag.yml exec backend python manage.py backup_data
```

### 2. Use Safe Seed Commands
```bash
# Prefer this over --reset
docker-compose -f docker-compose.stag.yml exec backend python manage.py seed_demo_data --preserve-users
```

### 3. Monitor Volume Usage
```bash
# Check volume sizes
docker system df -v | grep stag

# Clean up unused volumes (CAUTION!)
docker volume prune
```

### 4. Regular Backups
- Backups are created automatically on container startup
- Consider external backup solutions for production-like staging
- Store backups in external storage for disaster recovery

## Troubleshooting

### Data Loss After Build
- **Cause**: Volumes persist, but seed commands with `--reset` delete data
- **Solution**: Use `--preserve-users` flag or restore from backup

### Container Won't Start
```bash
# Check container logs
docker-compose -f docker-compose.stag.yml logs backend

# Check volume permissions
docker-compose -f docker-compose.stag.yml exec postgres ls -la /var/lib/postgresql/data/
```

### Volume Corruption
```bash
# Remove and recreate volume (⚠️ DELETES DATA)
docker-compose -f docker-compose.stag.yml down
docker volume rm emr_postgres_data_stag
docker-compose -f docker-compose.stag.yml up -d
```

## Emergency Contacts

If you experience critical data loss:
1. Check automatic backups in `./backups/`
2. Contact system administrator
3. Restore from external backups if available

## Quick Reference

```bash
# Safe operations
docker-compose -f docker-compose.stag.yml exec backend python manage.py backup_data
docker-compose -f docker-compose.stag.yml exec backend python manage.py seed_demo_data --preserve-users

# Dangerous operations (use with caution)
docker-compose -f docker-compose.stag.yml exec backend python manage.py seed_demo_data --reset
docker volume rm emr_postgres_data_stag
```