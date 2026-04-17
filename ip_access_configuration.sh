# Using IP Address Instead of Domain

**Yes, you can absolutely use `172.16.0.32` for testing!** Here's how to configure it temporarily.

## Update Backend Configuration

Modify the production environment to allow IP access:

```bash
sudo tee backend/env/prod.env > /dev/null << 'EOF'
# Django
DJANGO_SECRET_KEY=strong-production-secret-key-for-medical-npa-local
DJANGO_DEBUG=False
DJANGO_ENV=prod
ALLOWED_HOSTS=medical.npa.local,172.16.0.32,localhost,127.0.0.1
CSRF_TRUSTED_ORIGINS=https://medical.npa.local,http://medical.npa.local,https://172.16.0.32,http://172.16.0.32

# Database
DB_ENGINE=postgres
DB_NAME=emrprod
DB_USER=emradmin
DB_PASSWORD=secure-production-db-password-change-this
DB_HOST=postgres
DB_PORT=5432

# Redis / Celery
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=secure-redis-password-change-this
CELERY_BROKER_URL=redis://:secure-redis-password-change-this@redis:6379/0
CELERY_RESULT_BACKEND=redis://:secure-redis-password-change-this@redis:6379/1

# JWT
JWT_ACCESS_MINUTES=15
JWT_REFRESH_DAYS=7

# Frontend integration
CORS_ALLOWED_ORIGINS=https://medical.npa.local,http://medical.npa.local,https://172.16.0.32,http://172.16.0.32
MAX_UPLOAD_SIZE_MB=10

# Timezone
TIME_ZONE=Africa/Lagos

# Pagination
PAGINATION_PAGE_SIZE=50
EOF
```

## Update Frontend Configuration

```bash
sudo tee frontend/.env.prod > /dev/null << 'EOF'
# ================================
# MEDICAL NPA LOCAL EMR FRONTEND - PRODUCTION
# ================================
NEXT_PUBLIC_API_URL=http://172.16.0.32/api
NEXT_PUBLIC_WS_URL=ws://172.16.0.32/ws/
NEXT_PUBLIC_ENVIRONMENT=production
NEXT_PUBLIC_APP_NAME=Medical NPA EMR
NEXT_PUBLIC_APP_VERSION=1.0.0

NEXTAUTH_URL=http://172.16.0.32
NEXTAUTH_SECRET=strong-production-nextauth-secret-change-this

NEXT_PUBLIC_ANALYTICS_ID=
NEXT_PUBLIC_SENTRY_DSN=
NEXT_PUBLIC_SENTRY_ENVIRONMENT=production
NEXT_PUBLIC_ENABLE_ANALYTICS=false
NEXT_PUBLIC_ENABLE_ERROR_REPORTING=false

NEXT_PUBLIC_DATADOG_APP_ID=
NEXT_PUBLIC_DATADOG_CLIENT_TOKEN=
EOF
```

## Update Nginx Configuration

Modify nginx to serve on IP:

```bash
sudo tee nginx/prod.conf > /dev/null << 'EOF'
user nginx;
worker_processes auto;
error_log /var/log/nginx/error.log warn;
pid /var/run/nginx.pid;

events {
    worker_connections 1024;
}

http {
    include /etc/nginx/mime.types;
    default_type application/octet-stream;

    log_format main '$remote_addr - $remote_user [$time_local] "$request" '
                    '$status $body_bytes_sent "$http_referer" '
                    '"$http_user_agent" "$http_x_forwarded_for"';

    access_log /var/log/nginx/access.log main;

    sendfile on;
    tcp_nopush on;
    tcp_nodelay on;
    keepalive_timeout 65;
    types_hash_max_size 2048;
    client_max_body_size 100M;

    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_proxied any;
    gzip_comp_level 6;
    gzip_types text/plain text/css text/xml text/javascript 
               application/json application/javascript application/xml+rss 
               application/rss+xml font/truetype font/opentype 
               application/vnd.ms-fontobject image/svg+xml;

    # Backend API
    upstream backend {
        server backend:8000;
        keepalive 32;
    }

    # Frontend
    upstream frontend {
        server frontend:3000;
        keepalive 32;
    }

    # Rate limiting
    limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;
    limit_req_zone $binary_remote_addr zone=frontend:10m rate=30r/s;

    server {
        listen 80;
        server_name medical.npa.local 172.16.0.32 localhost;

        # Security headers
        add_header X-Frame-Options "SAMEORIGIN" always;
        add_header X-Content-Type-Options "nosniff" always;
        add_header X-XSS-Protection "1; mode=block" always;
        add_header Referrer-Policy "strict-origin-when-cross-origin" always;

        # Health check endpoint
        location /health {
            access_log off;
            return 200 "OK\n";
            add_header Content-Type text/plain;
        }

        # API endpoints
        location /api/ {
            limit_req zone=api burst=10 nodelay;

            proxy_pass http://backend;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_redirect off;
            
            # Timeouts
            proxy_connect_timeout 60s;
            proxy_send_timeout 120s;
            proxy_read_timeout 120s;
            
            # Buffering
            proxy_buffering on;
            proxy_buffer_size 4k;
            proxy_buffers 8 4k;
            proxy_busy_buffers_size 8k;
        }

        # WebSocket endpoints
        location /ws/ {
            proxy_pass http://backend;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection "upgrade";
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_read_timeout 86400;
        }

        # Static files
        location /static/ {
            alias /usr/share/nginx/html/static/;
            expires 30d;
            add_header Cache-Control "public, immutable";
        }

        # Media files
        location /media/ {
            alias /usr/share/nginx/html/media/;
            expires 7d;
            add_header Cache-Control "public";
        }

        # Admin interface
        location /admin/ {
            proxy_pass http://backend;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }

        # Frontend application (default)
        location / {
            limit_req zone=frontend burst=20 nodelay;

            proxy_pass http://frontend;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_redirect off;
            
            # For Next.js hot reload
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection "upgrade";
        }
    }
}
EOF
```

## Test Access

After updating configurations and restarting services:

```bash
# Restart EMR services
docker compose -f docker-compose.prod.yml down
docker compose -f docker-compose.prod.yml up -d

# Test access via IP
curl -k http://172.16.0.32/api/health/live/
curl -k http://172.16.0.32/

# Access EMR at: http://172.16.0.32
```

## Switch to Domain Later

When DNS is ready, update back to domain:

```bash
# Change frontend config back
NEXT_PUBLIC_API_URL=https://medical.npa.local/api
NEXT_PUBLIC_WS_URL=wss://medical.npa.local/ws/
NEXTAUTH_URL=https://medical.npa.local

# And backend ALLOWED_HOSTS, etc.
```

**For now, use `http://172.16.0.32` - it will work perfectly!** 

The system is configured to accept both IP and domain access, so you can test immediately while DNS is being set up. 🚀

**Ready to test EMR at http://172.16.0.32?** Let me know when you apply these changes! 👏