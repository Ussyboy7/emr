# EMR Production Deployment - Phase 1: Infrastructure Preparation
# Commands to run on each server

## Server A (172.16.0.32) - Primary Production Server Setup

### 1. Install Ubuntu Server 22.04 LTS
# (Already done - verify)
cat /etc/os-release

### 2. Configure emrprod user with sudo access
# (Already exists - verify)
sudo -l -U emrprod

### 3. Install Docker Engine and Docker Compose
# Update package list
sudo apt update

# Install required packages
sudo apt install -y ca-certificates curl gnupg lsb-release

# Add Docker's official GPG key
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg

# Set up stable repository
echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# Install Docker Engine
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

# Start and enable Docker
sudo systemctl start docker
sudo systemctl enable docker

# Add emrprod to docker group
sudo usermod -aG docker emrprod

# Verify installation
docker --version
docker compose version

### 4. Configure firewall (ports: 80, 443, 22)
# Enable UFW
sudo ufw enable

# Allow SSH (port 22)
sudo ufw allow ssh

# Allow HTTP (port 80)
sudo ufw allow 80

# Allow HTTPS (port 443)
sudo ufw allow 443

# Reload firewall
sudo ufw reload

# Check status
sudo ufw status

### 5. Set up system monitoring (htop, ncdu, journalctl)
sudo apt install -y htop ncdu

# journalctl is part of systemd, already available
journalctl --version

### 6. Configure automatic security updates
# Install unattended-upgrades
sudo apt install -y unattended-upgrades

# Enable automatic updates
sudo dpkg-reconfigure --priority=low unattended-upgrades

# Verify configuration
cat /etc/apt/apt.conf.d/20auto-upgrades

### 7. Optimize PostgreSQL settings for 32-64GB RAM
# This will be done when deploying the Docker containers
# PostgreSQL configuration will be in docker-compose.prod.yml

## Server B (172.16.0.30) - Backup & Recovery Server Setup

### 1. Install Ubuntu Server 22.04 LTS
# (Already done - verify version)
cat /etc/os-release

### 2. Configure emrprod2 user with sudo access
# (Already exists - verify sudo access)
sudo -l -U emrprod2

### 3. Install Docker Engine and backup tools (rsync, cron)
# Update package list
sudo apt update

# Install Docker (same as Server A)
sudo apt install -y ca-certificates curl gnupg lsb-release
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
sudo systemctl start docker
sudo systemctl enable docker
sudo usermod -aG docker emrprod2

# Install backup tools
sudo apt install -y rsync cron

# Verify
docker --version
rsync --version
crontab -l  # Should work

### 4. Configure firewall (ports: 22, backup transfer ports)
sudo ufw enable
sudo ufw allow ssh
# Allow rsync/scp (default SSH port 22 is sufficient)
sudo ufw reload
sudo ufw status

### 5. Set up backup storage directories (/backup/server_b)
sudo mkdir -p /backup/server_b
sudo chown emrprod2:emrprod2 /backup/server_b
sudo chmod 755 /backup/server_b

# Verify
ls -la /backup/

### 6. Configure automated backup reception scripts
# Create backup reception script
sudo tee /usr/local/bin/receive_backup.sh > /dev/null << 'EOF'
#!/bin/bash
# Automated backup reception script for Server B

BACKUP_DIR="/backup/server_b"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
LOG_FILE="/var/log/backup_reception.log"

# Log function
log() {
    echo "$(date +"%Y-%m-%d %H:%M:%S") - $1" >> "$LOG_FILE"
}

log "Starting backup reception from Server A"

# Create backup directory with timestamp
BACKUP_PATH="$BACKUP_DIR/backup_$TIMESTAMP"
mkdir -p "$BACKUP_PATH"

# This script will be called by rsync from Server A
# Rsync command from Server A: rsync -avz --delete /path/to/backup/ emrprod2@172.16.0.30:/backup/server_b/

log "Backup reception completed to $BACKUP_PATH"

# Optional: Send notification or alert
# Add your notification logic here

exit 0
EOF

sudo chmod +x /usr/local/bin/receive_backup.sh
sudo chown root:root /usr/local/bin/receive_backup.sh

# Create log file
sudo touch /var/log/backup_reception.log
sudo chown emrprod2:emrprod2 /var/log/backup_reception.log

### 7. Set up offsite sync preparation
# Install rclone for cloud storage sync (optional)
sudo apt install -y rclone

# Rclone configuration will be done later for DR site sync

## Network & Domain Configuration

### Configure DNS for medical.npa.local domain
# This needs to be done on your DNS server or /etc/hosts for internal resolution

# On both servers, add to /etc/hosts:
echo "172.16.0.32 medical.npa.local" | sudo tee -a /etc/hosts
echo "172.16.0.30 backup.npa.local" | sudo tee -a /etc/hosts

### Test network connectivity and bandwidth
# Test ping between servers
ping -c 4 172.16.0.30  # From Server A
ping -c 4 172.16.0.32  # From Server B

# Test bandwidth (install iperf if needed)
# sudo apt install -y iperf
# On Server A: iperf -s
# On Server B: iperf -c 172.16.0.30

### Configure static IP assignments
# Check current IP configuration
ip addr show

# If DHCP, configure static IP in /etc/netplan/ (Ubuntu 22.04 uses netplan)
# Example netplan configuration (adjust for your network):
sudo tee /etc/netplan/01-netcfg.yaml > /dev/null << 'EOF'
network:
  version: 2
  ethernets:
    ens18:  # Change to your interface name
      dhcp4: no
      addresses:
        - 172.16.0.32/24  # For Server A (primary)
      gateway4: 172.16.0.1
      nameservers:
        addresses:
          - 8.8.8.8
          - 8.8.4.4
EOF

# Apply netplan changes
sudo netplan apply

### Set up SSH key authentication between servers
# On Server A (primary, as emrprod):
ssh-keygen -t rsa -b 4096 -C "emrprod@server-a"

# Copy public key to Server B
ssh-copy-id emrprod2@172.16.0.30

# Test passwordless SSH
ssh emrprod2@172.16.0.30 "echo 'SSH key authentication working'"

# On Server B (backup, as emrprod2):
ssh-keygen -t rsa -b 4096 -C "emrprod2@server-b"
ssh-copy-id emrprod@172.16.0.32
ssh emrprod@172.16.0.32 "echo 'Reverse SSH working'"

## Verification Commands

# On Server A (primary):
docker ps
sudo ufw status
df -h
free -h

# On Server B (backup):
ls -la /backup/
sudo ufw status
crontab -l

# Network test:
ping -c 4 medical.npa.local
nslookup medical.npa.local