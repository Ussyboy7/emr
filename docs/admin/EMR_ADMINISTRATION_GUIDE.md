# EMR System Administration Guide
# Nigerian Ports Authority Healthcare System

## System Overview
This guide provides essential information for system administrators managing the EMR production environment.

---

## 🖥️ SYSTEM ARCHITECTURE

### Infrastructure Components
- **Server:** Ubuntu-based production server
- **Container Platform:** Docker with Docker Compose
- **Web Server:** Nginx (reverse proxy, SSL termination)
- **Application:** Django REST API + Next.js frontend
- **Database:** PostgreSQL with automated backups
- **Cache:** Redis for session and data caching
- **Background Jobs:** Celery with Redis broker

### Network Configuration
- **Internal IP:** 172.16.0.32
- **Ports:**
  - 80: HTTP (redirects to HTTPS)
  - 443: HTTPS (SSL/TLS)
  - 5434: PostgreSQL (external access for backups)
- **Firewall:** UFW with restricted access

### Data Flow
```
Client Browser → Nginx (443) → Application Services
                      ↓
              PostgreSQL (5432) + Redis (6379)
                      ↓
              Automated Backups → /home/emrprod/emr_backups/
```

---

## 👥 USER MANAGEMENT

### Creating New Users
```bash
# Access Django admin
1. Login to EMR as admin user (emrprod)
2. Navigate to /admin
3. Go to "Accounts" → "Users"
4. Click "Add User"
5. Fill required fields:
   - Username (lowercase, no spaces)
   - Email address
   - First/Last name
   - Employee ID (optional)
   - Role selection
6. Set permissions based on role
7. Save and notify user of temporary password
```

### User Roles & Permissions
- **Superuser:** Full system access (emrprod only)
- **Doctor:** Patient management, consultations, prescriptions
- **Nurse:** Vital signs, assessments, care coordination
- **Lab Technician:** Test processing and results
- **Pharmacist:** Prescription management and dispensing
- **Radiology Tech:** Imaging workflow management
- **Administrator:** User management and system configuration

### Password Management
- **Default Password:** New users get temporary password
- **Password Requirements:** Minimum 8 characters, mixed case
- **Password Reset:** Users can reset via "Forgot Password"
- **Account Lockout:** 5 failed attempts = 1 hour lockout

---

## 🔧 SYSTEM MAINTENANCE

### Daily Monitoring
```bash
# Check system status
cd ~/emr
./monitor_system.sh

# View monitoring logs
tail -f monitoring.log

# Check backup status
ls -la ~/emr_backups/
tail -20 ~/emr_backups/cron.log
```

### Weekly Maintenance
- **Review monitoring logs** for errors or warnings
- **Verify backup integrity** (runs automatically Saturdays)
- **Check disk usage** and clean up if needed
- **Update system packages** (if security updates available)
- **Review user access logs** for suspicious activity

### Monthly Maintenance
- **Full backup verification** test restore procedure
- **Security audit** review access logs
- **Performance analysis** review response time metrics
- **User permission audit** verify role assignments
- **System health assessment** comprehensive diagnostics

---

## 💾 BACKUP & RECOVERY

### Automated Backup Schedule
- **Daily:** Database backup at 10:00 PM
- **Weekly:** Backup verification Saturdays 10:00 AM
- **Retention:** 7 days automatic cleanup
- **Location:** `/home/emrprod/emr_backups/`

### Manual Backup
```bash
cd ~/emr
./backup_database.sh
```

### Emergency Recovery
```bash
cd ~/emr
./restore_backup.sh
# Follow interactive prompts
```

### Backup Verification
```bash
cd ~/emr
./verify_backup.sh
```

---

## 🚨 TROUBLESHOOTING

### Common Issues & Solutions

#### System Unresponsive
```bash
# Check service status
docker compose -f docker-compose.prod.yml ps

# Restart services
docker compose -f docker-compose.prod.yml restart

# Check logs
docker compose -f docker-compose.prod.yml logs --tail=50
```

#### Database Connection Issues
```bash
# Test database connectivity
docker compose -f docker-compose.prod.yml exec postgres pg_isready -U emradmin -d emrprod

# Check database logs
docker compose -f docker-compose.prod.yml logs postgres
```

#### High Memory/CPU Usage
```bash
# Monitor resource usage
docker stats

# Check application logs
docker compose -f docker-compose.prod.yml logs --tail=100 backend

# Restart problematic service
docker compose -f docker-compose.prod.yml restart backend
```

#### SSL Certificate Issues
```bash
# Check certificate validity
openssl x509 -in /etc/ssl/certs/emr.crt -text -noout | grep -A 2 "Validity"

# Renew certificate (when needed)
# Follow SSL certificate renewal procedures
```

### Log Analysis
```bash
# Application logs
docker compose -f docker-compose.prod.yml logs backend
docker compose -f docker-compose.prod.yml logs frontend

# Nginx access logs
tail -f /var/log/nginx/access.log

# System monitoring
tail -f ~/emr/monitoring.log
```

---

## 🔒 SECURITY MANAGEMENT

### Access Control
- **SSH Access:** Key-based authentication only
- **User Accounts:** Role-based permissions
- **API Access:** Token-based authentication
- **Database Access:** Restricted to application only

### Security Monitoring
```bash
# Check security logs
tail -f ~/emr/logs/security.log

# Monitor failed login attempts
grep "Failed password" /var/log/auth.log | tail -10

# Check firewall status
sudo ufw status
```

### Incident Response
1. **Identify:** Review logs for suspicious activity
2. **Contain:** Disable compromised accounts
3. **Investigate:** Analyze access patterns
4. **Recover:** Restore from clean backups
5. **Report:** Document incident and prevention measures

---

## 📊 PERFORMANCE MONITORING

### Real-time Monitoring
```bash
# System health check
./monitor_system.sh

# Performance metrics
./monitor_performance.sh 30
```

### Key Metrics to Monitor
- **Response Time:** < 2 seconds (target)
- **CPU Usage:** < 80% sustained
- **Memory Usage:** < 85% sustained
- **Disk Usage:** < 90% free space
- **Database Connections:** Monitor pool usage
- **Error Rate:** < 1% of requests

### Performance Optimization
- **Database:** Monitor slow queries
- **Cache:** Ensure Redis is functioning
- **Static Files:** Verify Nginx caching
- **Background Jobs:** Monitor Celery queues

---

## 🔄 SYSTEM UPDATES

### Application Updates
```bash
# Pull latest changes
cd ~/emr
git pull origin main

# Backup before update
./backup_database.sh

# Update containers
docker compose -f docker-compose.prod.yml build
docker compose -f docker-compose.prod.yml up -d

# Run migrations if needed
docker compose -f docker-compose.prod.yml exec backend python manage.py migrate

# Verify system health
./monitor_system.sh
```

### Security Updates
```bash
# Update system packages
sudo apt update && sudo apt upgrade

# Update Docker images
docker compose -f docker-compose.prod.yml pull

# Restart services
docker compose -f docker-compose.prod.yml restart
```

---

## 📞 SUPPORT PROCEDURES

### User Support
- **Level 1:** User training and documentation
- **Level 2:** Department supervisor assistance
- **Level 3:** IT support ticket system
- **Level 4:** System administrator escalation

### Emergency Contacts
- **System Down:** IT Emergency Line
- **Data Breach:** Security Incident Response Team
- **Medical Emergency:** Hospital Emergency Protocols
- **After Hours:** On-call IT administrator

### Documentation
- **User Guides:** Available in EMR system (/help)
- **Admin Guides:** This document and technical docs
- **Incident Reports:** Maintained in /var/log/incidents/
- **Change Logs:** Git repository history

---

## 📈 SCALING & CAPACITY PLANNING

### Current Capacity
- **Concurrent Users:** 50+ supported
- **Database Size:** Monitored via automated reports
- **Storage:** 100GB+ available
- **Backup:** 7-day retention

### Scaling Considerations
- **Vertical Scaling:** Increase server resources
- **Horizontal Scaling:** Multiple application servers
- **Database Scaling:** Read replicas, connection pooling
- **Load Balancing:** Nginx upstream configuration

### Monitoring Thresholds
- **Warning:** 70% resource utilization
- **Critical:** 85% resource utilization
- **Emergency:** 95% resource utilization

---

## 🎯 GO-LIVE CHECKLIST

### Pre-Go-Live
- [ ] All services running and healthy
- [ ] Backup system tested and functional
- [ ] User accounts created and tested
- [ ] Training completed for all users
- [ ] Emergency procedures documented
- [ ] Support contacts distributed

### Go-Live Day
- [ ] Final system validation completed
- [ ] Backup performed before go-live
- [ ] User access verified
- [ ] Monitoring systems active
- [ ] Support team on standby

### Post-Go-Live
- [ ] Monitor system performance (first 24 hours)
- [ ] Address any user issues immediately
- [ ] Conduct user feedback sessions
- [ ] Document lessons learned
- [ ] Plan for future enhancements

---

## 📋 DAILY ADMINISTRATOR CHECKLIST

- [ ] Review monitoring logs for errors
- [ ] Check backup completion status
- [ ] Monitor system resource usage
- [ ] Review user access patterns
- [ ] Verify service availability
- [ ] Check security alerts
- [ ] Update documentation as needed

---

## 🚨 EMERGENCY PROCEDURES

### System Outage Response
1. **Assess Impact:** Determine affected services/users
2. **Communicate:** Notify stakeholders of outage
3. **Troubleshoot:** Check logs and service status
4. **Recovery:** Implement appropriate recovery procedure
5. **Verification:** Confirm system restoration
6. **Post-Mortem:** Document incident and prevention measures

### Data Loss Response
1. **Stop Operations:** Prevent further data modification
2. **Assess Damage:** Determine scope of data loss
3. **Recovery:** Restore from most recent clean backup
4. **Verification:** Validate data integrity
5. **Communication:** Notify affected users and management
6. **Prevention:** Implement additional safeguards

---

*This guide should be reviewed quarterly and updated as the system evolves. Maintain version control and distribute updates to all administrators.*

**System integrity depends on diligent administration!** 🔒⚡