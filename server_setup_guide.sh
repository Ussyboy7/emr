# Setting Up EMR Server with GitHub Repository

## On Primary Server (Server A: 172.16.0.32, user: emrprod)

### 1. SSH into the server
ssh emrprod@172.16.0.32

### 2. Install Git (if not already installed)
sudo apt update
sudo apt install -y git

### 3. Clone the EMR repository
# Create a directory for the project
mkdir -p ~/emr
cd ~/emr

# Clone your repository
git clone https://github.com/Ussyboy7/emr.git .

# If you have a specific branch (e.g., main or production), checkout it
git checkout main  # or your production branch

# Verify the clone
ls -la
git status

### 4. Set up the project directory structure
# The scripts assume the code is in /home/emrprod/emr
# If cloned to ~/emr, you're good. If elsewhere, adjust paths in scripts.

### 5. Ensure all required files are present
# Check for key files
ls -la docker-compose.prod.yml
ls -la backend/env/prod.env
ls -la frontend/.env.prod
ls -la nginx/prod.conf
ls -la ssl/  # SSL certificates directory

### 6. Make scripts executable
chmod +x phase*.sh

### 7. Run Phase 1 Infrastructure Setup
# (Already completed if following the sequence)

### 8. Run Phase 2 Application Deployment
./phase2_application_deployment.sh

### 9. Continue with remaining phases
./phase3_backup_recovery.sh
./phase4_monitoring_security.sh
./phase5_data_migration.sh
./phase6_testing_validation.sh
./phase7_production_golive.sh

## On Backup Server (Server B: 172.16.0.30, user: emrprod2)

### 1. SSH into the server
ssh emrprod2@172.16.0.30

### 2. Install Git
sudo apt update
sudo apt install -y git

### 3. Clone the repository (optional - backup server may not need full code)
# Only clone if needed for backup operations
git clone https://github.com/Ussyboy7/emr.git ~/emr

## Additional Git Operations

### Update code from repository
cd ~/emr
git pull origin main

### Check current branch
git branch -a

### Switch to production branch (if exists)
git checkout production

### View commit history
git log --oneline -10

## Security Notes
- Ensure SSH keys are set up between servers before running backup scripts
- The repository URL is public - consider using SSH keys for private repos:
  git clone git@github.com:Ussyboy7/emr.git
- All sensitive configuration (passwords, secrets) are in .env files that should not be committed

## Repository Structure Check
# After cloning, verify these key files exist:
- docker-compose.prod.yml
- backend/env/prod.env
- frontend/.env.prod
- nginx/prod.conf
- scripts/backup.sh (if exists)
- ssl/medical.npa.local.crt
- ssl/medical.npa.local.key

If any files are missing, they need to be created or copied from your local development environment.