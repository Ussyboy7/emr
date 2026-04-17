# EMR Production Deployment - Phase 4: Monitoring & Security
# Commands to run on Server B (172.16.0.32)

## Prometheus + Grafana Setup
# Install Prometheus and Grafana using Docker
sudo tee docker-compose.monitoring.yml > /dev/null << 'EOF'
version: '3.8'

services:
  prometheus:
    image: prom/prometheus:latest
    container_name: emr-prometheus
    volumes:
      - ./monitoring/prometheus.yml:/etc/prometheus/prometheus.yml:ro
      - prometheus_data:/prometheus
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--storage.tsdb.path=/prometheus'
      - '--web.console.libraries=/etc/prometheus/console_libraries'
      - '--web.console.templates=/etc/prometheus/consoles'
      - '--storage.tsdb.retention.time=200h'
      - '--web.enable-lifecycle'
    ports:
      - "9090:9090"
    networks:
      - emr-network-prod
    restart: always

  grafana:
    image: grafana/grafana:latest
    container_name: emr-grafana
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=change_this_grafana_password
      - GF_USERS_ALLOW_SIGN_UP=false
    volumes:
      - grafana_data:/var/lib/grafana
      - ./monitoring/grafana/provisioning:/etc/grafana/provisioning:ro
      - ./monitoring/grafana/dashboards:/var/lib/grafana/dashboards:ro
    ports:
      - "3001:3000"
    depends_on:
      - prometheus
    networks:
      - emr-network-prod
    restart: always

  node-exporter:
    image: prom/node-exporter:latest
    container_name: emr-node-exporter
    volumes:
      - /proc:/host/proc:ro
      - /sys:/host/sys:ro
      - /:/rootfs:ro
    command:
      - '--path.procfs=/host/proc'
      - '--path.rootfs=/rootfs'
      - '--path.sysfs=/host/sys'
      - '--collector.filesystem.mount-points-exclude=^/(sys|proc|dev|host|etc)($$|/)'
    ports:
      - "9100:9100"
    networks:
      - emr-network-prod
    restart: always

volumes:
  prometheus_data:
  grafana_data:

networks:
  emr-network-prod:
    external: true
EOF

# Create monitoring directories
mkdir -p monitoring/prometheus
mkdir -p monitoring/grafana/provisioning/datasources
mkdir -p monitoring/grafana/provisioning/dashboards
mkdir -p monitoring/grafana/dashboards

# Create Prometheus configuration
sudo tee monitoring/prometheus.yml > /dev/null << 'EOF'
global:
  scrape_interval: 15s
  evaluation_interval: 15s

rule_files:
  # - "first_rules.yml"
  # - "second_rules.yml"

scrape_configs:
  - job_name: 'prometheus'
    static_configs:
      - targets: ['localhost:9090']

  - job_name: 'node'
    static_configs:
      - targets: ['node-exporter:9100']

  - job_name: 'emr-backend'
    static_configs:
      - targets: ['backend:8000']
    metrics_path: '/metrics'
    scrape_interval: 30s

  - job_name: 'emr-frontend'
    static_configs:
      - targets: ['frontend:3000']
    metrics_path: '/api/metrics'
    scrape_interval: 30s

  - job_name: 'postgres'
    static_configs:
      - targets: ['postgres:5432']

  - job_name: 'redis'
    static_configs:
      - targets: ['redis:6379']
EOF

# Create Grafana datasource configuration
sudo tee monitoring/grafana/provisioning/datasources/prometheus.yml > /dev/null << 'EOF'
apiVersion: 1

datasources:
  - name: Prometheus
    type: prometheus
    access: proxy
    url: http://prometheus:9090
    isDefault: true
EOF

# Create Grafana dashboard configuration
sudo tee monitoring/grafana/provisioning/dashboards/dashboard.yml > /dev/null << 'EOF'
apiVersion: 1

providers:
  - name: 'default'
    orgId: 1
    folder: ''
    type: file
    disableDeletion: false
    updateIntervalSeconds: 10
    allowUiUpdates: true
    options:
      path: /var/lib/grafana/dashboards
EOF

# Deploy monitoring stack
docker compose -f docker-compose.monitoring.yml up -d

# Create basic EMR dashboard JSON (simplified)
sudo tee monitoring/grafana/dashboards/emr-dashboard.json > /dev/null << 'EOF'
{
  "dashboard": {
    "title": "EMR System Overview",
    "tags": ["emr", "production"],
    "timezone": "browser",
    "panels": [
      {
        "title": "System CPU Usage",
        "type": "graph",
        "targets": [{
          "expr": "100 - (avg by(instance) (irate(node_cpu_seconds_total{mode=\"idle\"}[5m])) * 100)",
          "legendFormat": "{{instance}}"
        }]
      },
      {
        "title": "System Memory Usage",
        "type": "graph",
        "targets": [{
          "expr": "(1 - node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes) * 100",
          "legendFormat": "{{instance}}"
        }]
      },
      {
        "title": "Disk Usage",
        "type": "table",
        "targets": [{
          "expr": "100 - ((node_filesystem_avail_bytes * 100) / node_filesystem_size_bytes)",
          "legendFormat": "{{mountpoint}}"
        }]
      }
    ],
    "time": {
      "from": "now-1h",
      "to": "now"
    },
    "refresh": "30s"
  }
}
EOF

## Security Hardening
# Configure PostgreSQL security
# Update pg_hba.conf for secure access
docker compose -f docker-compose.prod.yml exec postgres bash -c "
echo 'host    emrprod    emradmin    172.16.0.32/32    md5' >> /var/lib/postgresql/data/pg_hba.conf
echo 'host    emrprod    emradmin    172.22.0.0/16     md5' >> /var/lib/postgresql/data/pg_hba.conf
"

# Reload PostgreSQL configuration
docker compose -f docker-compose.prod.yml exec postgres pg_ctl reload

# Configure Redis security
# Redis password already set in docker-compose.prod.yml

# Set up nginx security headers and rate limiting
# Already configured in nginx/prod.conf

# Implement application security middleware
# Django security settings already configured

# Set up log aggregation and monitoring
# Configure rsyslog for centralized logging (optional)
sudo apt install -y rsyslog

# Configure log rotation
sudo tee /etc/logrotate.d/emr > /dev/null << 'EOF'
/home/emrprod/emr/logs/production/*.log {
    daily
    missingok
    rotate 7
    compress
    delaycompress
    notifempty
    create 644 emrprod emrprod
    postrotate
        docker compose -f /home/emrprod/emr/docker-compose.prod.yml exec backend kill -USR1 1
    endscript
}
EOF

# Set up intrusion detection (basic with fail2ban)
sudo apt install -y fail2ban

# Configure fail2ban for SSH
sudo tee /etc/fail2ban/jail.local > /dev/null << 'EOF'
[sshd]
enabled = true
port = ssh
filter = sshd
logpath = /var/log/auth.log
maxretry = 3
bantime = 3600
EOF

sudo systemctl enable fail2ban
sudo systemctl start fail2ban

## Alerting Configuration
# Create alert rules for Prometheus
sudo tee monitoring/prometheus/alert_rules.yml > /dev/null << 'EOF'
groups:
  - name: emr_alerts
    rules:
      - alert: HighCPUUsage
        expr: 100 - (avg by(instance) (irate(node_cpu_seconds_total{mode="idle"}[5m])) * 100) > 90
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High CPU usage detected"
          description: "CPU usage is {{ $value }}%"

      - alert: HighMemoryUsage
        expr: (1 - node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes) * 100 > 90
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "High memory usage detected"
          description: "Memory usage is {{ $value }}%"

      - alert: ServiceDown
        expr: up == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "Service {{ $labels.job }} is down"
          description: "{{ $labels.job }} has been down for more than 1 minute"
EOF

# Update Prometheus config to include rules
echo "rule_files:" >> monitoring/prometheus.yml
echo "  - 'alert_rules.yml'" >> monitoring/prometheus.yml

# Restart Prometheus
docker compose -f docker-compose.monitoring.yml restart prometheus

## Verification
# Check monitoring services
docker compose -f docker-compose.monitoring.yml ps

# Access Grafana at http://medical.npa.local:3001 (admin/change_this_grafana_password)
# Access Prometheus at http://medical.npa.local:9090

# Test alerts
curl -s http://localhost:9090/api/v1/alerts | jq '.data.alerts[] | select(.state != "inactive")'

# Check security
sudo fail2ban-client status sshd
sudo ufw status