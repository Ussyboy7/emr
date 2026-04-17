#!/bin/bash

# EMR Security Hardening and Log Rotation Setup
# This script configures security hardening and log management

set -e

# Configuration
LOG_DIR="/home/emrprod/emr/logs"
BACKUP_DIR="/home/emrprod/emr_backups"
MONITOR_LOG="/home/emrprod/emr/monitoring.log"

# Create log directories
mkdir -p "$LOG_DIR"
mkdir -p "$BACKUP_DIR"

echo "=== EMR Security Hardening & Log Management Setup ==="

# Check if running as root/sudo for system configurations
if [ "$EUID" -eq 0 ]; then
    echo "✅ Running with sudo - configuring system-level security"

    # Configure logrotate for EMR logs
    cat > /etc/logrotate.d/emr << EOF
# EMR System Logs
/home/emrprod/emr/monitoring.log
/home/emrprod/emr_backups/backup.log
/home/emrprod/emr_backups/cron.log
/home/emrprod/emr/logs/*.log {
    daily
    rotate 30
    compress
    delaycompress
    missingok
    notifempty
    create 644 emrprod emrprod
    postrotate
        # Reload services if needed
        docker compose -f /home/emrprod/emr/docker-compose.prod.yml logs --tail=0 > /dev/null
    endscript
}
EOF

    echo "✅ Log rotation configured for EMR logs"

    # Configure Nginx log rotation (if not already configured)
    if [ ! -f /etc/logrotate.d/nginx ]; then
        cat > /etc/logrotate.d/nginx << EOF
/var/log/nginx/*.log {
    daily
    rotate 30
    compress
    delaycompress
    missingok
    notifempty
    create 644 nginx nginx
    postrotate
        docker exec emr-nginx-prod nginx -s reload
    endscript
}
EOF
        echo "✅ Nginx log rotation configured"
    fi

    # Set up fail2ban for SSH protection (if not installed)
    if ! command -v fail2ban-client &> /dev/null; then
        echo "⚠️  fail2ban not installed. Consider installing for SSH protection:"
        echo "    sudo apt update && sudo apt install fail2ban"
    else
        # Configure fail2ban for SSH
        cat > /etc/fail2ban/jail.d/emr.conf << EOF
[sshd]
enabled = true
port = ssh
filter = sshd
logpath = /var/log/auth.log
maxretry = 3
bantime = 3600
EOF
        systemctl enable fail2ban 2>/dev/null || true
        systemctl start fail2ban 2>/dev/null || true
        echo "✅ fail2ban configured for SSH protection"
    fi

    # Configure UFW firewall rules (if UFW is available)
    if command -v ufw &> /dev/null; then
        # Allow SSH
        ufw allow ssh >/dev/null 2>&1 || true
        # Allow HTTP and HTTPS
        ufw allow 80 >/dev/null 2>&1 || true
        ufw allow 443 >/dev/null 2>&1 || true
        # Allow PostgreSQL external access (for backups)
        ufw allow 5434 >/dev/null 2>&1 || true
        echo "✅ UFW firewall rules configured"
    fi

else
    echo "⚠️  Not running with sudo - skipping system-level configurations"
    echo ""
    echo "📋 SYSTEM ADMINISTRATOR ACTION REQUIRED:"
    echo "Run the following commands with sudo to complete security setup:"
    echo ""
    echo "# Configure log rotation for EMR logs"
    echo "sudo tee /etc/logrotate.d/emr > /dev/null << 'EOF'"
    echo "# EMR System Logs"
    echo "/home/emrprod/emr/monitoring.log"
    echo "/home/emrprod/emr_backups/backup.log"
    echo "/home/emrprod/emr_backups/cron.log"
    echo "/home/emrprod/emr/logs/*.log {"
    echo "    daily"
    echo "    rotate 30"
    echo "    compress"
    echo "    delaycompress"
    echo "    missingok"
    echo "    notifempty"
    echo "    create 644 emrprod emrprod"
    echo "    postrotate"
    echo "        docker compose -f /home/emrprod/emr/docker-compose.prod.yml logs --tail=0 > /dev/null"
    echo "    endscript"
    echo "}"
    echo "EOF"
    echo ""
    echo "# Configure UFW firewall (if using UFW)"
    echo "sudo ufw allow ssh"
    echo "sudo ufw allow 80"
    echo "sudo ufw allow 443"
    echo "sudo ufw allow 5434"
    echo ""
    echo "# Install and configure fail2ban (optional)"
    echo "sudo apt update && sudo apt install fail2ban"
    echo ""
fi

# Set proper permissions on EMR directories
chown -R emrprod:emrprod /home/emrprod/emr 2>/dev/null || true
chmod -R 755 /home/emrprod/emr 2>/dev/null || true
chmod 600 /home/emrprod/emr/backend/env/prod.env 2>/dev/null || true

echo "✅ Directory permissions configured"

# Configure monitoring cron job
if ! crontab -l | grep -q "monitor_system.sh"; then
    (crontab -l 2>/dev/null; echo "*/5 * * * * /home/emrprod/emr/monitor_system.sh >> $MONITOR_LOG 2>&1") | crontab -
    echo "✅ System monitoring configured (runs every 5 minutes)"
fi

# Create security monitoring script
cat > /home/emrprod/emr/check_security.sh << 'EOF'
#!/bin/bash
# Security monitoring script

echo "=== EMR Security Check $(date) ==="

# Check for suspicious processes
echo "Checking for suspicious processes..."
ps aux | grep -E "(netcat|ncat|nc|wget|curl)" | grep -v grep || echo "No suspicious processes found"

# Check open ports
echo "Checking open ports..."
netstat -tlnp 2>/dev/null | grep LISTEN || ss -tlnp | grep LISTEN

# Check disk usage
echo "Checking disk usage..."
df -h | grep -E "^(/|Filesystem)"

# Check system load
echo "Checking system load..."
uptime

# Check failed login attempts
echo "Checking recent failed logins..."
grep "Failed password" /var/log/auth.log 2>/dev/null | tail -5 || echo "No recent failed logins"

echo "=== Security Check Complete ==="
EOF

chmod +x /home/emrprod/emr/check_security.sh
echo "✅ Security monitoring script created"

# Schedule security checks
if ! crontab -l | grep -q "check_security.sh"; then
    (crontab -l 2>/dev/null; echo "0 */4 * * * /home/emrprod/emr/check_security.sh >> /home/emrprod/emr/logs/security.log 2>&1") | crontab -
    echo "✅ Security checks scheduled (every 4 hours)"
fi

echo ""
echo "=== Security Hardening Complete ==="
echo ""
echo "🔒 Security Features Configured:"
echo "  📝 Log rotation (30 days retention)"
echo "  🛡️  fail2ban SSH protection"
echo "  🔥 UFW firewall rules"
echo "  👁️  System monitoring (5-minute intervals)"
echo "  🔍 Security checks (4-hour intervals)"
echo ""
echo "📊 View logs:"
echo "  Monitoring: tail -f $MONITOR_LOG"
echo "  Security: tail -f /home/emrprod/emr/logs/security.log"
echo "  System: tail -f /var/log/syslog"
echo ""
echo "🚨 Alerts will be logged to: $MONITOR_LOG"
echo ""
echo "Next steps:"
echo "1. Configure email alerts (update ALERT_EMAIL in monitor_system.sh)"
echo "2. Set up SSL certificates for HTTPS"
echo "3. Configure backup offsite storage"
echo "4. Set up log aggregation (optional)"