# EMR Production Deployment - Final Guide (Updated 2026-04-17)

## Server Configuration (Confirmed Working)

### Server A - Primary EMR Server
- **IP:** 172.16.0.32/24
- **User:** emrprod
- **Role:** Primary Production Server
- **Services:** EMR Application, Database, Monitoring
- **Domain:** medical.npa.local (primary)

### Server B - Backup EMR Server
- **IP:** 172.16.0.30/24
- **User:** emrprod2
- **Role:** Backup & Recovery Server
- **Services:** Backup storage, failover systems
- **Domain:** backup.npa.local (backup)

### Network Configuration (Working)
- **Gateway:** 172.16.0.2
- **Subnet:** 172.16.0.0/24
- **DNS:** 8.8.8.8, 1.1.1.1
- **Internet Access:** Confirmed working

## Deployment Status

### ✅ Completed
- Server network configuration and access restored
- EMR code cloned from GitHub repository
- All deployment scripts created and tested
- SSL certificates generated
- Production environment configured

### 🔄 Ready for Execution
- Phase 1-7 deployment scripts in repository
- Network troubleshooting guides
- Emergency recovery procedures

## Quick Deployment Commands

### Transfer EMR Code to Servers
```bash
# On your local machine
cd /path/to/emr
tar -czf emr-deploy.tar.gz .

# Transfer to Server A
scp emr-deploy.tar.gz emrprod@172.16.0.32:~/

# Transfer to Server B
scp emr-deploy.tar.gz emrprod2@172.16.0.30:~/
```

### Deploy on Server A (Primary)
```bash
# SSH to server
ssh emrprod@172.16.0.32

# Extract and setup
tar -xzf emr-deploy.tar.gz
cd emr
chmod +x phase*.sh

# Execute deployment phases
./phase1_infrastructure_setup.sh  # Infrastructure setup
./phase2_application_deployment.sh  # EMR application deployment
./phase4_monitoring_security.sh  # Monitoring setup

# Check deployment
docker compose -f docker-compose.prod.yml ps
curl -k https://medical.npa.local/api/health/live/
```

### Deploy on Server B (Backup)
```bash
# SSH to server
ssh emrprod2@172.16.0.30

# Extract and setup
tar -xzf emr-deploy.tar.gz
cd emr
chmod +x phase*.sh

# Execute deployment phases
./phase1_infrastructure_setup.sh  # Infrastructure setup
./phase3_backup_recovery.sh  # Backup system setup
```

### Configure Cross-Server Backup
```bash
# On Server A (generate SSH key for backup)
ssh-keygen -t rsa -b 4096 -C "emrprod@server-a"

# Copy key to Server B
ssh-copy-id emrprod2@172.16.0.30

# Test backup transfer
/usr/local/bin/emr_backup.sh
```

## Access Information

### EMR Application
- **URL:** https://medical.npa.local
- **Admin User:** emrprod@emr
- **Initial Password:** ChangeThisPassword123!
- **API:** https://medical.npa.local/api/

### Monitoring
- **Grafana:** http://medical.npa.local:3001
- **Prometheus:** http://medical.npa.local:9090
- **Default Credentials:** admin / change_this_grafana_password

### SSH Access
- **Server A:** ssh emrprod@172.16.0.32
- **Server B:** ssh emrprod2@172.16.0.30

## File Structure (Repository)
```
emr/
├── docker-compose.prod.yml      # Production Docker services
├── backend/env/prod.env         # Backend production config
├── frontend/.env.prod           # Frontend production config
├── nginx/prod.conf              # Nginx configuration
├── ssl/                         # SSL certificates
├── phase1_infrastructure_setup.sh   # Phase 1 script
├── phase2_application_deployment.sh # Phase 2 script
├── phase3_backup_recovery.sh        # Phase 3 script
├── phase4_monitoring_security.sh    # Phase 4 script
├── phase5_data_migration.sh         # Phase 5 script
├── phase6_testing_validation.sh     # Phase 6 script
├── phase7_production_golive.sh      # Phase 7 script
└── [network troubleshooting scripts]
```

## Deployment Checklist

- [x] Server network configuration working
- [x] SSH access to both servers confirmed
- [x] EMR code available on GitHub
- [x] SSL certificates generated
- [x] Deployment scripts created
- [ ] Phase 1: Infrastructure setup (run on both servers)
- [ ] Phase 2: Application deployment (Server A)
- [ ] Phase 3: Backup & recovery (both servers)
- [ ] Phase 4: Monitoring & security (Server A)
- [ ] Phase 5: Data migration (Server A)
- [ ] Phase 6: Testing & validation (both servers)
- [ ] Phase 7: Production go-live (Server A)

## Emergency Contacts

- **Network Issues:** Check network configuration with gateway 172.16.0.2
- **Server Access:** Use console access if SSH fails
- **Deployment Issues:** Refer to troubleshooting scripts in repository

## Final Notes

- All deployment scripts are designed to be run sequentially
- Monitor server resources during deployment
- Test each phase before proceeding to the next
- Keep detailed logs of all deployment steps
- Have rollback procedures ready

**Ready for EMR production deployment! 🚀**