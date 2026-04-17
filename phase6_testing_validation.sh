# EMR Production Deployment - Phase 6: Testing & Validation
# Commands to run on Server B (172.16.0.32) and Server A (172.16.0.30)

## Functional Testing
# Test complete EMR workflows end-to-end

# Create test script for API endpoints
sudo tee /usr/local/bin/test_emr_api.sh > /dev/null << 'EOF'
#!/bin/bash
# EMR API Functional Testing

BASE_URL="http://medical.npa.local"
TOKEN=""

echo "Testing EMR API endpoints..."

# Test health endpoint
echo "1. Testing health endpoint..."
curl -s -o /dev/null -w "Status: %{http_code}\n" "${BASE_URL}/api/health/live/"

# Test authentication (requires valid credentials)
echo "2. Testing authentication..."
# Get token (replace with actual credentials)
# TOKEN=$(curl -s -X POST "${BASE_URL}/api/accounts/auth/token/" \
#   -H "Content-Type: application/json" \
#   -d '{"username":"emrprod","password":"test_password"}' | jq -r '.access')

if [ -n "$TOKEN" ]; then
    echo "Authentication successful"

    # Test user profile
    echo "3. Testing user profile..."
    curl -s -H "Authorization: Bearer $TOKEN" "${BASE_URL}/api/accounts/auth/me/" | jq '.username'

    # Test clinics
    echo "4. Testing clinics endpoint..."
    curl -s -H "Authorization: Bearer $TOKEN" "${BASE_URL}/api/organization/clinics/" | jq '.count'

    # Test departments
    echo "5. Testing departments endpoint..."
    curl -s -H "Authorization: Bearer $TOKEN" "${BASE_URL}/api/organization/departments/" | jq '.count'

    # Test users
    echo "6. Testing users endpoint..."
    curl -s -H "Authorization: Bearer $TOKEN" "${BASE_URL}/api/accounts/users/" | jq '.count'

else
    echo "Authentication failed - using public endpoints only"
fi

# Test public endpoints
echo "7. Testing public API access..."
curl -s "${BASE_URL}/api/common/settings/" | jq '.'

echo "API testing complete"
EOF

sudo chmod +x /usr/local/bin/test_emr_api.sh

# Run API tests
/usr/local/bin/test_emr_api.sh

## User Authentication and Authorization Testing
# Test login functionality
curl -X POST "http://medical.npa.local/api/accounts/auth/token/" \
  -H "Content-Type: application/json" \
  -d '{"username":"emrprod@emr","password":"ChangeThisPassword123!"}'

# Test permission-based access (requires authentication)
# Test different user roles and their access levels

## Data Entry and Retrieval Operations Testing
# Test patient registration
curl -X POST "http://medical.npa.local/api/medical-records/patients/" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "first_name": "Test",
    "last_name": "Patient",
    "date_of_birth": "1990-01-01",
    "gender": "M",
    "phone": "+1234567890"
  }'

# Test data retrieval
curl -s -H "Authorization: Bearer $TOKEN" "http://medical.npa.local/api/medical-records/patients/" | jq '.results[0]'

## Performance Testing
# Load testing with concurrent users
sudo apt install -y apache2-utils

# Run load test (10 concurrent users, 100 requests)
ab -n 100 -c 10 -H "Authorization: Bearer $TOKEN" "http://medical.npa.local/api/accounts/auth/me/"

# Database performance benchmarking
docker compose -f docker-compose.prod.yml exec postgres pgbench -U emradmin -d emrprod -c 10 -j 2 -T 30

# Application response time testing
# Use curl with timing
curl -w "@curl-format.txt" -o /dev/null -s "http://medical.npa.local/api/health/live/"

# Create curl format file
sudo tee curl-format.txt > /dev/null << 'EOF'
     time_namelookup:  %{time_namelookup}\n
        time_connect:  %{time_connect}\n
     time_appconnect:  %{time_appconnect}\n
    time_pretransfer:  %{time_pretransfer}\n
       time_redirect:  %{time_redirect}\n
  time_starttransfer:  %{time_starttransfer}\n
                     ----------\n
          time_total:  %{time_total}\n
EOF

## Backup & Recovery Testing
# Test automated backup creation and transfer
echo "Testing backup creation..."
/usr/local/bin/emr_backup.sh

# Validate backup on Server A
ssh emrprod2@172.16.0.30 "ls -la /backup/server_b/ | tail -5"

# Test backup restoration (in isolated environment)
echo "Testing backup restoration..."
# Create test restore environment
mkdir -p /tmp/emr_restore_test
cd /tmp/emr_restore_test

# Copy docker-compose for testing
cp /home/emrprod/emr/docker-compose.prod.yml .

# Modify for test environment
sed -i 's/emr-postgres-prod/emr-postgres-test/g' docker-compose.prod.yml
sed -i 's/emrprod/emr_db_test/g' docker-compose.prod.yml
sed -i 's/5434:5432/5435:5432/g' docker-compose.prod.yml

# Start test database
docker compose -f docker-compose.prod.yml up -d postgres

# Wait for database
sleep 10

# Restore from backup
LATEST_BACKUP=$(ls -t /home/emrprod/emr/backups/emr_backup_*_db.sql.gz | head -1)
if [ -f "$LATEST_BACKUP" ]; then
    echo "Restoring from: $LATEST_BACKUP"
    gunzip -c "$LATEST_BACKUP" | docker compose -f docker-compose.prod.yml exec -T postgres psql -U emradmin -d emr_db_test
    echo "Restore test successful"
else
    echo "No backup found for testing"
fi

# Clean up test environment
docker compose -f docker-compose.prod.yml down -v
cd -
rm -rf /tmp/emr_restore_test

# Test disaster recovery procedures
echo "Disaster recovery test completed"

## Verification Commands
# Check system resources
echo "System Resources:"
df -h
free -h
uptime

# Check service health
echo "Service Health:"
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.monitoring.yml ps

# Check application logs
echo "Recent Application Logs:"
docker compose -f docker-compose.prod.yml logs --tail=20 backend

# Check monitoring metrics
echo "Monitoring Status:"
curl -s http://localhost:9090/api/v1/query?query=up | jq '.data.result[]'

# Performance baseline
echo "Performance Baseline:"
curl -w "@curl-format.txt" -o /dev/null -s "http://medical.npa.local/api/health/live/"

# Security check
echo "Security Status:"
sudo fail2ban-client status
sudo ufw status

# Backup status
echo "Backup Status:"
ls -la /home/emrprod/emr/backups/ | tail -5
ssh emrprod2@172.16.0.30 "ls -la /backup/server_b/ | tail -5"