#!/bin/bash

# EMR Functional Testing Script
# Automated tests for EMR system functionality

set -e

# Configuration
BASE_URL="http://172.16.0.32"
API_URL="${BASE_URL}/api"
FRONTEND_URL="${BASE_URL}"
TEST_LOG="emr_functional_test_$(date +%Y%m%d_%H%M%S).log"

# Test user credentials
ADMIN_USER="emrprod"
ADMIN_PASS="Changeme"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging function
log() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') - $1" | tee -a "$TEST_LOG"
}

# Test result function
test_result() {
    local test_name="$1"
    local result="$2"
    local details="$3"

    if [ "$result" = "PASS" ]; then
        echo -e "${GREEN}✅ PASS${NC} - $test_name"
        [ -n "$details" ] && echo "   $details"
    elif [ "$result" = "FAIL" ]; then
        echo -e "${RED}❌ FAIL${NC} - $test_name"
        [ -n "$details" ] && echo "   $details"
    elif [ "$result" = "SKIP" ]; then
        echo -e "${YELLOW}⏭️  SKIP${NC} - $test_name"
        [ -n "$details" ] && echo "   $details"
    else
        echo -e "${BLUE}ℹ️  INFO${NC} - $test_name"
        [ -n "$details" ] && echo "   $details"
    fi
}

# Get authentication token
get_auth_token() {
    local response
    response=$(curl -s -X POST "${API_URL}/accounts/auth/token/" \
        -H "Content-Type: application/json" \
        -d "{\"username\":\"$ADMIN_USER\",\"password\":\"$ADMIN_PASS\"}")

    if echo "$response" | grep -q "access"; then
        echo "$response" | grep -o '"access":"[^"]*' | cut -d'"' -f4
        return 0
    else
        log "Failed to get auth token: $response"
        return 1
    fi
}

# Test frontend accessibility
test_frontend_accessibility() {
    log "Testing frontend accessibility..."

    # Test homepage
    if curl -s -f "$FRONTEND_URL" > /dev/null 2>&1; then
        test_result "Frontend Homepage" "PASS" "Successfully loaded homepage"
    else
        test_result "Frontend Homepage" "FAIL" "Failed to load homepage"
    fi

    # Test login page
    if curl -s -f "${FRONTEND_URL}/login" > /dev/null 2>&1; then
        test_result "Login Page" "PASS" "Successfully loaded login page"
    else
        test_result "Login Page" "FAIL" "Failed to load login page"
    fi
}

# Test API endpoints
test_api_endpoints() {
    log "Testing API endpoints..."

    # Test API root
    if curl -s -f "${API_URL}/" > /dev/null 2>&1; then
        test_result "API Root" "PASS" "API root accessible"
    else
        test_result "API Root" "FAIL" "API root not accessible"
    fi

    # Test health endpoint
    if curl -s -f "${BASE_URL}/health" > /dev/null 2>&1; then
        test_result "Health Check" "PASS" "Health endpoint responding"
    else
        test_result "Health Check" "FAIL" "Health endpoint not responding"
    fi

    # Test authentication endpoint (should return 401 without credentials)
    local auth_response
    auth_response=$(curl -s -o /dev/null -w "%{http_code}" "${API_URL}/accounts/auth/token/")
    if [ "$auth_response" = "401" ]; then
        test_result "Auth Endpoint Protection" "PASS" "Properly protected with 401"
    else
        test_result "Auth Endpoint Protection" "FAIL" "Unexpected response: $auth_response"
    fi
}

# Test authentication
test_authentication() {
    log "Testing authentication..."

    # Get auth token
    local token
    if token=$(get_auth_token 2>/dev/null); then
        test_result "Authentication" "PASS" "Successfully obtained auth token"

        # Test token-based API access
        local user_response
        user_response=$(curl -s -H "Authorization: Bearer $token" "${API_URL}/accounts/auth/me/")
        if echo "$user_response" | grep -q "username"; then
            test_result "Token Authentication" "PASS" "Successfully accessed protected endpoint"
        else
            test_result "Token Authentication" "FAIL" "Failed to access protected endpoint: $user_response"
        fi
    else
        test_result "Authentication" "FAIL" "Failed to obtain auth token"
    fi
}

# Test patient management
test_patient_management() {
    log "Testing patient management..."

    local token
    if ! token=$(get_auth_token 2>/dev/null); then
        test_result "Patient Management" "SKIP" "Cannot test without authentication"
        return
    fi

    # Test patient list endpoint
    local patients_response
    patients_response=$(curl -s -H "Authorization: Bearer $token" "${API_URL}/patients/")
    if echo "$patients_response" | grep -q '"results"\|"count"'; then
        test_result "Patient List" "PASS" "Successfully retrieved patient list"
    else
        test_result "Patient List" "FAIL" "Failed to retrieve patient list: $patients_response"
    fi
}

# Test appointment system
test_appointments() {
    log "Testing appointment system..."

    local token
    if ! token=$(get_auth_token 2>/dev/null); then
        test_result "Appointment System" "SKIP" "Cannot test without authentication"
        return
    fi

    # Test appointments endpoint
    local appt_response
    appt_response=$(curl -s -H "Authorization: Bearer $token" "${API_URL}/appointments/")
    if echo "$appt_response" | grep -q '"results"\|"count"'; then
        test_result "Appointment List" "PASS" "Successfully retrieved appointments"
    else
        test_result "Appointment List" "FAIL" "Failed to retrieve appointments: $appt_response"
    fi
}

# Test security features
test_security() {
    log "Testing security features..."

    # Test rate limiting (rapid requests to API)
    local rate_limit_test=0
    for i in {1..5}; do
        if curl -s -f "${API_URL}/" > /dev/null 2>&1; then
            ((rate_limit_test++))
        fi
        sleep 0.1
    done

    if [ "$rate_limit_test" -eq 5 ]; then
        test_result "Rate Limiting" "INFO" "No rate limiting detected in basic test"
    else
        test_result "Rate Limiting" "PASS" "Rate limiting appears active"
    fi

    # Test security headers
    local headers
    headers=$(curl -s -I "$BASE_URL" | grep -E "(X-Frame-Options|X-Content-Type-Options|X-XSS-Protection|Content-Security-Policy)" | wc -l)
    if [ "$headers" -ge 3 ]; then
        test_result "Security Headers" "PASS" "Found $headers security headers"
    else
        test_result "Security Headers" "FAIL" "Only found $headers security headers (expected >= 3)"
    fi
}

# Test system performance
test_performance() {
    log "Testing system performance..."

    # Test response time for homepage
    local start_time end_time response_time
    start_time=$(date +%s%3N 2>/dev/null || date +%s)
    curl -s -f "$FRONTEND_URL" > /dev/null 2>&1
    end_time=$(date +%s%3N 2>/dev/null || date +%s)
    response_time=$((end_time - start_time))

    if [ "$response_time" -lt 5000 ]; then  # Less than 5 seconds
        test_result "Homepage Response Time" "PASS" "Response time: ${response_time}ms"
    else
        test_result "Homepage Response Time" "FAIL" "Response time too slow: ${response_time}ms"
    fi
}

# Generate test report
generate_report() {
    local report_file="emr_test_report_$(date +%Y%m%d_%H%M%S).txt"

    cat > "$report_file" << EOF
EMR Functional Test Report
==========================
Test Date: $(date)
System URL: $BASE_URL
Test Log: $TEST_LOG

SUMMARY:
$(grep -c "PASS\|FAIL\|SKIP" "$TEST_LOG" | head -3)

DETAILED RESULTS:
$(cat "$TEST_LOG")

RECOMMENDATIONS:
- Review any FAILED tests for issues
- Monitor performance metrics regularly
- Ensure security features remain active
- Test user workflows with healthcare staff

NEXT STEPS:
1. Address any failed tests
2. Perform user acceptance testing
3. Complete security validation
4. Prepare for production go-live
EOF

    log "Test report generated: $report_file"
    echo "📊 Test report: $report_file"
}

# Main test execution
main() {
    log "=== EMR Functional Testing Started ==="
    log "Test Environment: $BASE_URL"

    echo "🧪 Starting EMR Functional Tests..."
    echo "Results will be logged to: $TEST_LOG"
    echo ""

    test_frontend_accessibility
    echo ""

    test_api_endpoints
    echo ""

    test_authentication
    echo ""

    test_patient_management
    echo ""

    test_appointments
    echo ""

    test_security
    echo ""

    test_performance
    echo ""

    generate_report

    local pass_count fail_count skip_count
    pass_count=$(grep -c "PASS" "$TEST_LOG" 2>/dev/null || echo "0")
    fail_count=$(grep -c "FAIL" "$TEST_LOG" 2>/dev/null || echo "0")
    skip_count=$(grep -c "SKIP" "$TEST_LOG" 2>/dev/null || echo "0")

    echo ""
    echo "📊 Test Summary:"
    echo "✅ Passed: $pass_count"
    echo "❌ Failed: $fail_count"
    echo "⏭️  Skipped: $skip_count"
    echo ""

    if [ "$fail_count" -eq 0 ]; then
        log "=== ALL TESTS PASSED ==="
        echo "🎉 All functional tests passed!"
    else
        log "=== TESTS COMPLETED WITH ISSUES ==="
        echo "⚠️  Some tests failed. Review the log file: $TEST_LOG"
    fi
}

# Run main function
main "$@"