#!/bin/bash

# EMR Performance Monitoring Script
# Monitors application performance and response times

set -e

# Configuration
PERF_LOG="/home/emrprod/emr/logs/performance.log"
METRICS_LOG="/home/emrprod/emr/logs/metrics.log"
DURATION=60  # Monitor for 60 seconds

# Logging function
log() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') - $1" >> "$PERF_LOG"
}

# Metrics logging function
log_metric() {
    local metric="$1"
    local value="$2"
    local unit="$3"
    echo "$(date '+%Y-%m-%d %H:%M:%S'),$metric,$value,$unit" >> "$METRICS_LOG"
}

# Monitor response times
monitor_response_times() {
    log "Starting response time monitoring..."

    local start_time=$(date +%s)
    local end_time=$((start_time + DURATION))

    while [ $(date +%s) -lt $end_time ]; do
        # Test homepage response time
        local home_time=$(curl -s -w "%{time_total}" -o /dev/null http://localhost/)
        log_metric "homepage_response_time" "$home_time" "seconds"

        # Test API health
        local api_time=$(curl -s -w "%{time_total}" -o /dev/null http://localhost/api/accounts/auth/token/)
        log_metric "api_response_time" "$api_time" "seconds"

        # Small delay between measurements
        sleep 2
    done
}

# Monitor system resources over time
monitor_system_resources() {
    log "Starting system resource monitoring..."

    local start_time=$(date +%s)
    local end_time=$((start_time + DURATION))

    while [ $(date +%s) -lt $end_time ]; do
        # CPU usage
        local cpu=$(top -bn1 | grep "Cpu(s)" | sed "s/.*, *\([0-9.]*\)%* id.*/\1/" | awk '{print 100 - $1}')
        log_metric "cpu_usage" "$cpu" "percent"

        # Memory usage
        local mem_total=$(free | grep Mem | awk '{print $2}')
        local mem_used=$(free | grep Mem | awk '{print $3}')
        local mem_percent=$(echo "scale=2; $mem_used * 100 / $mem_total" | bc)
        log_metric "memory_usage" "$mem_percent" "percent"

        # Disk I/O (simplified)
        local disk_stats=$(iostat -d 1 1 2>/dev/null | tail -1 | awk '{print $2}')
        if [ ! -z "$disk_stats" ]; then
            log_metric "disk_io" "$disk_stats" "utilization"
        fi

        sleep 5
    done
}

# Monitor Docker container resources
monitor_containers() {
    log "Starting container resource monitoring..."

    local containers=("emr-backend-prod" "emr-frontend-prod" "emr-postgres-prod" "emr-redis-prod")

    for container in "${containers[@]}"; do
        if docker ps | grep -q "$container"; then
            # Get container stats
            local stats=$(docker stats --no-stream --format "table {{.Container}}\t{{.CPUPerc}}\t{{.MemPerc}}" "$container" 2>/dev/null | tail -1)

            if [ ! -z "$stats" ]; then
                local cpu_perc=$(echo "$stats" | awk '{print $2}' | sed 's/%//')
                local mem_perc=$(echo "$stats" | awk '{print $3}' | sed 's/%//')

                log_metric "${container}_cpu" "$cpu_perc" "percent"
                log_metric "${container}_memory" "$mem_perc" "percent"
            fi
        fi
    done
}

# Generate performance report
generate_performance_report() {
    local report_file="/home/emrprod/emr/logs/performance_report_$(date +%Y%m%d_%H%M).txt"

    log "Generating performance report: $report_file"

    cat > "$report_file" << EOF
EMR Performance Report
======================
Report Date: $(date)
Monitoring Duration: ${DURATION} seconds

SYSTEM METRICS SUMMARY:
$(tail -20 "$METRICS_LOG" 2>/dev/null | head -10)

CONTAINER STATUS:
$(docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}")

RESPONSE TIME ANALYSIS:
$(grep "response_time" "$METRICS_LOG" 2>/dev/null | tail -10 | awk -F',' '{print $1 " - " $2 ": " $3 " " $4}')

RESOURCE USAGE TREND:
$(grep "cpu_usage\|memory_usage" "$METRICS_LOG" 2>/dev/null | tail -10 | awk -F',' '{print $1 " - " $2 ": " $3 " " $4}')

PERFORMANCE RECOMMENDATIONS:
- Homepage response time should be < 2 seconds
- API response time should be < 1 second
- CPU usage should be < 80%
- Memory usage should be < 85%

EOF
}

# Main performance monitoring
main() {
    log "=== EMR Performance Monitoring Started ==="
    log "Monitoring duration: ${DURATION} seconds"

    # Create log directories
    mkdir -p "/home/emrprod/emr/logs"

    # Run monitoring in parallel
    monitor_response_times &
    monitor_system_resources &
    monitor_containers &

    # Wait for all monitoring to complete
    wait

    generate_performance_report

    log "=== EMR Performance Monitoring Completed ==="
}

# Show usage
usage() {
    echo "EMR Performance Monitoring Script"
    echo "Usage: $0 [duration]"
    echo ""
    echo "Arguments:"
    echo "  duration    Monitoring duration in seconds (default: 60)"
    echo ""
    echo "Examples:"
    echo "  $0          # Monitor for 60 seconds"
    echo "  $0 120      # Monitor for 2 minutes"
}

# Parse arguments
if [ "$1" = "--help" ] || [ "$1" = "-h" ]; then
    usage
    exit 0
fi

if [ ! -z "$1" ] && [[ "$1" =~ ^[0-9]+$ ]]; then
    DURATION="$1"
fi

# Run main function
main "$@"