# EMR Production Operations Guide

## Overview
This guide provides essential commands and procedures for operating the EMR production system.

## Directory Structure

### Root Level
- `backend/` - Backend application code
- `frontend/` - Frontend application code
- `scripts/` - Operational scripts (production, security, backup, monitoring, testing)
- `deployment/` - Docker Compose configurations for local, staging, and production
- `logs/` - System logs and reports
- `docs/` - Documentation and guides
- `nginx/` - Nginx configuration
- `ssl/` - SSL certificates
- `status-page/` - Status page application
- `backups/` - Backup files and configurations
- `Makefile` - Build and development tasks
- `README.md` - Project overview and setup instructions

## Quick Start Commands

### System Management
```bash
# Start EMR production system
./scripts/production/emr-prod-manager.sh start

# Stop EMR production system
./scripts/production/emr-prod-manager.sh stop

# Check system status
./scripts/production/emr-prod-manager.sh status

# Quick status check
./scripts/production/emr-status.sh
```

### Monitoring & Health
```bash
# Real-time health dashboard
./scripts/production/emr-dashboard.sh

# Run health checks
./scripts/production/emr-prod-manager.sh health

# Performance monitoring
./scripts/production/emr-prod-manager.sh performance
```

### Backup Operations
```bash
# Manual backup
./scripts/production/emr-prod-manager.sh backup

# Check backup status
./scripts/production/emr-prod-manager.sh backup-status

# Verify backup integrity
./scripts/production/emr-prod-manager.sh verify-backup
```

## Production Manager Commands

The `emr-prod-manager.sh` script provides comprehensive production operations:

### Service Management
```bash
./scripts/production/emr-prod-manager.sh start      # Start all services
./scripts/production/emr-prod-manager.sh stop       # Stop all services
./scripts/production/emr-prod-manager.sh restart    # Restart all services
./scripts/production/emr-prod-manager.sh status     # Show service status
```

### Monitoring & Diagnostics
```bash
./scripts/production/emr-prod-manager.sh health     # Run health checks
./scripts/production/emr-prod-manager.sh monitor    # System monitoring
./scripts/production/emr-prod-manager.sh alerts     # Check for alerts
./scripts/production/emr-prod-manager.sh logs       # View recent logs
./scripts/production/emr-prod-manager.sh diagnostics # Full system diagnostics
```

### Backup Management
```bash
./scripts/production/emr-prod-manager.sh backup         # Manual backup
./scripts/production/emr-prod-manager.sh backup-status  # Backup status
./scripts/production/emr-prod-manager.sh verify-backup  # Verify backups
```

### Maintenance
```bash
./scripts/production/emr-prod-manager.sh update     # Update application
./scripts/production/emr-prod-manager.sh cleanup    # Clean up system
```

### Emergency Operations
```bash
./scripts/production/emr-emergency.sh stop          # Emergency stop
./scripts/production/emr-emergency.sh restart       # Emergency restart
./scripts/production/emr-emergency.sh recovery      # Disaster recovery
./scripts/production/emr-emergency.sh diagnostics   # Emergency diagnostics
./scripts/production/emr-emergency.sh reset         # System reset (dangerous!)
```

## Daily Operations Checklist

### Morning Startup
```bash
# 1. Check system status
./scripts/production/emr-status.sh

# 2. Start services if needed
./scripts/production/emr-prod-manager.sh start

# 3. Verify health
./scripts/production/emr-prod-manager.sh health
```

### Daily Monitoring
```bash
# Check alerts
./scripts/production/emr-prod-manager.sh alerts

# Review logs
./scripts/production/emr-prod-manager.sh logs

# Monitor performance
./scripts/production/emr-dashboard.sh  # Runs continuously
```

### Evening Maintenance
```bash
# Verify backup completed (automatic at 10 PM)
./scripts/production/emr-prod-manager.sh backup-status

# Clean up old logs
./scripts/production/emr-prod-manager.sh cleanup
```

## Automated Operations

The system runs automated operations:

- **Daily Backups**: 10:00 PM automatically
- **Health Monitoring**: Every 5 minutes
- **Security Checks**: Every 4 hours
- **Log Rotation**: 30-day retention

## Emergency Procedures

### System Down
1. Check status: `./scripts/production/emr-status.sh`
2. Emergency restart: `./scripts/production/emr-emergency.sh restart`
3. If no response, emergency recovery: `./scripts/production/emr-emergency.sh recovery`

### Data Issues
1. Stop services: `./scripts/production/emr-prod-manager.sh stop`
2. Restore from backup: `./scripts/production/emr-emergency.sh recovery`
3. Verify data integrity
4. Restart services

### Complete Failure
1. Emergency stop: `./scripts/production/emr-emergency.sh stop`
2. System reset: `./scripts/production/emr-emergency.sh reset`
3. Full recovery: `./scripts/production/emr-emergency.sh recovery`

## Key Contacts

- **System Access**: `http://172.16.0.32`
- **Admin Login**: `emrprod` / `Changeme`
- **Emergency Contact**: IT Support
- **Documentation**: EMR_ADMINISTRATION_GUIDE.md

## Performance Benchmarks

- **Response Time**: < 2 seconds
- **Uptime**: > 99.5%
- **CPU Usage**: < 80%
- **Memory Usage**: < 85%
- **Backup Success**: 100%

## Security Requirements

- Change default passwords immediately
- Monitor security logs daily
- Apply updates promptly
- Report suspicious activity
- Maintain audit trails

---

**For detailed procedures, refer to:**
- `EMR_ADMINISTRATION_GUIDE.md` - Complete administration guide
- `EMR_SUPPORT_MAINTENANCE.md` - Support and maintenance procedures
- `EMR_GO_LIVE_CHECKLIST.md` - Go-live procedures

**System ready for production healthcare operations!** 🏥✨