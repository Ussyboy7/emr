#!/bin/bash

# EMR Go-Live Readiness Validation
# Comprehensive system validation for production deployment

set -e

# Configuration
REPORT_FILE="emr_go_live_readiness_$(date +%Y%m%d_%H%M%S).txt"
LOG_FILE="validation.log"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Scoring
TOTAL_CHECKS=0
PASSED_CHECKS=0
FAILED_CHECKS=0
WARNING_CHECKS=0

# Logging functions
log() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') - $1" | tee -a "$LOG_FILE"
}

report() {
    echo "$1" | tee -a "$REPORT_FILE"
}

check_result() {
    local test_name="$1"
    local result="$2"
    local details="$3"
    local category="$4"

    ((TOTAL_CHECKS++))

    case "$result" in
        "PASS")
            ((PASSED_CHECKS++))
            echo -e "${GREEN}✅ PASS${NC} - $test_name"
            [ -n "$details" ] && echo "   $details"
            ;;
        "FAIL")
            ((FAILED_CHECKS++))
            echo -e "${RED}❌ FAIL${NC} - $test_name"
            [ -n "$details" ] && echo "   $details"
            ;;
        "WARN")
            ((WARNING_CHECKS++))
            echo -e "${YELLOW}⚠️  WARN${NC} - $test_name"
            [ -n "$details" ] && echo "   $details"
            ;;
        *)
            echo -e "${BLUE}ℹ️  INFO${NC} - $test_name"
            [ -n "$details" ] && echo "   $details"
            ;;
    esac

    # Add to report
    report "[$category] $test_name: $result"
    [ -n "$details" ] && report "   $details"
    report ""
}

# Generate report header
generate_header() {
    report "========================================"
    report "EMR GO-LIVE READINESS VALIDATION REPORT"
    report "========================================"
    report ""
    report "Validation Date: $(date)"
    report "System: EMR Production Environment"
    report "URL: http://172.16.0.32"
    report "Administrator: emrprod"
    report ""
    report "========================================"
    report ""
}

# Infrastructure validation
validate_infrastructure() {
    report "🔧 INFRASTRUCTURE VALIDATION"
    report "=============================="

    # Docker services
    if docker compose -f docker-compose.prod.yml ps | grep -q "emr-nginx-prod"; then
        check_result "Nginx Service" "PASS" "Nginx container is running" "INFRA"
    else
        check_result "Nginx Service" "FAIL" "Nginx container not running" "INFRA"
    fi

    if docker compose -f docker-compose.prod.yml ps | grep -q "emr-backend-prod"; then
        check_result "Backend Service" "PASS" "Django backend container is running" "INFRA"
    else
        check_result "Backend Service" "FAIL" "Django backend container not running" "INFRA"
    fi

    if docker compose -f docker-compose.prod.yml ps | grep -q "emr-frontend-prod"; then
        check_result "Frontend Service" "PASS" "Next.js frontend container is running" "INFRA"
    else
        check_result "Frontend Service" "FAIL" "Next.js frontend container not running" "INFRA"
    fi

    if docker compose -f docker-compose.prod.yml ps | grep -q "emr-postgres-prod"; then
        check_result "Database Service" "PASS" "PostgreSQL container is running" "INFRA"
    else
        check_result "Database Service" "FAIL" "PostgreSQL container not running" "INFRA"
    fi

    if docker compose -f docker-compose.prod.yml ps | grep -q "emr-redis-prod"; then
        check_result "Cache Service" "PASS" "Redis cache container is running" "INFRA"
    else
        check_result "Cache Service" "FAIL" "Redis cache container not running" "INFRA"
    fi

    # System resources
    local cpu_usage=$(top -bn1 | grep "Cpu(s)" | sed "s/.*, *\([0-9.]*\)%* id.*/\1/" | awk '{print 100 - $1}')
    if (( $(echo "$cpu_usage < 80" | bc -l) )); then
        check_result "CPU Usage" "PASS" "CPU usage: ${cpu_usage}%" "INFRA"
    else
        check_result "CPU Usage" "WARN" "High CPU usage: ${cpu_usage}%" "INFRA"
    fi

    local mem_usage=$(free | grep Mem | awk '{printf "%.2f", $3/$2 * 100.0}')
    if (( $(echo "$mem_usage < 85" | bc -l) )); then
        check_result "Memory Usage" "PASS" "Memory usage: ${mem_usage}%" "INFRA"
    else
        check_result "Memory Usage" "WARN" "High memory usage: ${mem_usage}%" "INFRA"
    fi

    local disk_usage=$(df / | tail -1 | awk '{print $5}' | sed 's/%//')
    if [ "$disk_usage" -lt 90 ]; then
        check_result "Disk Usage" "PASS" "Disk usage: ${disk_usage}%" "INFRA"
    else
        check_result "Disk Usage" "WARN" "High disk usage: ${disk_usage}%" "INFRA"
    fi
}

# Security validation
validate_security() {
    report "🔒 SECURITY VALIDATION"
    report "======================"

    # HTTPS/SSL
    if curl -s -k "https://172.16.0.32" > /dev/null 2>&1; then
        check_result "HTTPS Access" "PASS" "HTTPS endpoint accessible" "SECURITY"
    else
        check_result "HTTPS Access" "FAIL" "HTTPS not accessible" "SECURITY"
    fi

    # Security headers
    local headers=$(curl -s -I "http://172.16.0.32" | grep -E "(X-Frame-Options|X-Content-Type-Options|X-XSS-Protection|Content-Security-Policy)" | wc -l)
    if [ "$headers" -ge 3 ]; then
        check_result "Security Headers" "PASS" "Found $headers security headers" "SECURITY"
    else
        check_result "Security Headers" "FAIL" "Only found $headers security headers" "SECURITY"
    fi

    # Authentication
    local auth_response=$(curl -s -o /dev/null -w "%{http_code}" "http://172.16.0.32/api/accounts/auth/token/")
    if [ "$auth_response" = "401" ]; then
        check_result "API Authentication" "PASS" "Proper 401 response for unauthenticated requests" "SECURITY"
    else
        check_result "API Authentication" "WARN" "Unexpected auth response: $auth_response" "SECURITY"
    fi

    # Admin access
    if curl -s "http://172.16.0.32/admin/" | grep -q "login"; then
        check_result "Admin Interface" "PASS" "Django admin interface accessible" "SECURITY"
    else
        check_result "Admin Interface" "FAIL" "Django admin interface not accessible" "SECURITY"
    fi
}

# Application validation
validate_application() {
    report "🌐 APPLICATION VALIDATION"
    report "=========================="

    # Frontend accessibility
    if curl -s -f "http://172.16.0.32" > /dev/null 2>&1; then
        check_result "Frontend Homepage" "PASS" "Homepage loads successfully" "APP"
    else
        check_result "Frontend Homepage" "FAIL" "Homepage not accessible" "APP"
    fi

    # Login page
    if curl -s -f "http://172.16.0.32/login" > /dev/null 2>&1; then
        check_result "Login Page" "PASS" "Login page accessible" "APP"
    else
        check_result "Login Page" "FAIL" "Login page not accessible" "APP"
    fi

    # API health
    if curl -s -f "http://172.16.0.32/health" > /dev/null 2>&1; then
        check_result "API Health Check" "PASS" "Health endpoint responding" "APP"
    else
        check_result "API Health Check" "FAIL" "Health endpoint not responding" "APP"
    fi

    # API functionality
    if curl -s -f "http://172.16.0.32/api/" > /dev/null 2>&1; then
        check_result "API Root" "INFO" "API root accessible (expected behavior)" "APP"
    fi

    # Performance test
    local start_time=$(date +%s%3N 2>/dev/null || date +%s)
    curl -s -f "http://172.16.0.32" > /dev/null 2>&1
    local end_time=$(date +%s%3N 2>/dev/null || date +%s)
    local response_time=$((end_time - start_time))

    if [ "$response_time" -lt 3000 ]; then
        check_result "Response Time" "PASS" "Response time: ${response_time}ms" "APP"
    else
        check_result "Response Time" "WARN" "Slow response time: ${response_time}ms" "APP"
    fi
}

# Backup validation
validate_backups() {
    report "💾 BACKUP VALIDATION"
    report "==================="

    # Backup directory
    if [ -d "$HOME/emr_backups" ]; then
        check_result "Backup Directory" "PASS" "Backup directory exists" "BACKUP"

        # Recent backups
        local backup_count=$(find "$HOME/emr_backups" -name "20*" -type d 2>/dev/null | wc -l)
        if [ "$backup_count" -gt 0 ]; then
            check_result "Backup Files" "PASS" "Found $backup_count backup(s)" "BACKUP"

            # Latest backup
            local latest_backup=$(find "$HOME/emr_backups" -name "20*" -type d -printf '%T@ %p\n' 2>/dev/null | sort -n | tail -1 | cut -d' ' -f2-)
            if [ -n "$latest_backup" ]; then
                local backup_date=$(basename "$latest_backup")
                check_result "Latest Backup" "INFO" "Most recent: $backup_date" "BACKUP"
            fi
        else
            check_result "Backup Files" "WARN" "No backup files found" "BACKUP"
        fi

        # Cron logs
        if [ -f "$HOME/emr_backups/cron.log" ]; then
            check_result "Backup Logging" "PASS" "Cron logs exist" "BACKUP"
        else
            check_result "Backup Logging" "WARN" "No cron logs found" "BACKUP"
        fi
    else
        check_result "Backup Directory" "FAIL" "Backup directory not found" "BACKUP"
    fi
}

# User access validation
validate_users() {
    report "👥 USER ACCESS VALIDATION"
    report "=========================="

    # Admin user exists
    if docker compose -f docker-compose.prod.yml exec -T postgres psql -U emradmin -d emrprod -c "SELECT username FROM users WHERE username = 'emrprod';" 2>/dev/null | grep -q "emrprod"; then
        check_result "Admin User" "PASS" "emrprod user exists in database" "USERS"
    else
        check_result "Admin User" "FAIL" "emrprod user not found" "USERS"
    fi

    # User authentication works
    local token=$(curl -s -X POST "http://172.16.0.32/api/accounts/auth/token/" \
        -H "Content-Type: application/json" \
        -d '{"username":"emrprod","password":"Changeme"}' | grep -o '"access":"[^"]*' | cut -d'"' -f4)

    if [ -n "$token" ]; then
        check_result "User Authentication" "PASS" "Admin login successful" "USERS"

        # Test protected endpoint
        local user_check=$(curl -s -H "Authorization: Bearer $token" "http://172.16.0.32/api/accounts/auth/me/")
        if echo "$user_check" | grep -q "username"; then
            check_result "Protected Endpoints" "PASS" "Token-based auth working" "USERS"
        else
            check_result "Protected Endpoints" "FAIL" "Token auth not working" "USERS"
        fi
    else
        check_result "User Authentication" "FAIL" "Admin login failed" "USERS"
    fi
}

# Generate final report
generate_final_report() {
    report "📊 FINAL VALIDATION SUMMARY"
    report "============================"
    report ""
    report "Total Checks: $TOTAL_CHECKS"
    report "Passed: $PASSED_CHECKS"
    report "Failed: $FAILED_CHECKS"
    report "Warnings: $WARNING_CHECKS"
    report ""

    local pass_rate=$((PASSED_CHECKS * 100 / TOTAL_CHECKS))
    report "Success Rate: ${pass_rate}%"
    report ""

    # Go-live readiness
    report "🎯 GO-LIVE READINESS ASSESSMENT"
    report "==============================="

    if [ $FAILED_CHECKS -eq 0 ] && [ $WARNING_CHECKS -le 2 ] && [ $pass_rate -ge 90 ]; then
        report "✅ STATUS: READY FOR GO-LIVE"
        report "   - All critical systems operational"
        report "   - Security measures in place"
        report "   - Backup system functional"
        report "   - User access verified"
    elif [ $FAILED_CHECKS -le 1 ] && [ $pass_rate -ge 85 ]; then
        report "⚠️  STATUS: READY WITH MINOR ISSUES"
        report "   - Address warning items before go-live"
        report "   - Non-critical issues identified"
    else
        report "❌ STATUS: NOT READY FOR GO-LIVE"
        report "   - Critical issues must be resolved"
        report "   - Additional testing required"
    fi

    report ""
    report "📋 NEXT STEPS:"
    if [ $FAILED_CHECKS -gt 0 ]; then
        report "   1. Address all FAILED items immediately"
        report "   2. Re-run validation after fixes"
        report "   3. Obtain stakeholder approval"
    fi
    if [ $WARNING_CHECKS -gt 0 ]; then
        report "   1. Review and address WARNING items"
        report "   2. Document risk mitigation plans"
    fi
    report "   1. Execute go-live checklist"
    report "   2. Conduct user training sessions"
    report "   3. Prepare support team"
    report "   4. Schedule official go-live"
    report ""
    report "📄 Detailed Results: $LOG_FILE"
    report "📊 Full Report: $REPORT_FILE"
}

# Main validation execution
main() {
    log "=== EMR GO-LIVE READINESS VALIDATION STARTED ==="

    generate_header

    echo "🏥 Starting EMR Go-Live Validation..."
    echo "This will test all critical systems and generate a readiness report."
    echo ""

    validate_infrastructure
    echo ""

    validate_security
    echo ""

    validate_application
    echo ""

    validate_backups
    echo ""

    validate_users
    echo ""

    generate_final_report

    log "=== EMR GO-LIVE READINESS VALIDATION COMPLETED ==="

    echo ""
    echo "📊 Validation Complete!"
    echo "📄 Full report: $REPORT_FILE"
    echo "📝 Log file: $LOG_FILE"

    if [ $FAILED_CHECKS -eq 0 ]; then
        echo "🎉 System is READY for production go-live!"
    else
        echo "⚠️  $FAILED_CHECKS critical issues need attention before go-live."
    fi
}

# Run main validation
main "$@"