#!/bin/bash

# Klear Karma Backend Monitoring Script
# This script monitors the health and performance of the deployed API

set -e  # Exit on any error

echo "📊 Klear Karma Backend Monitoring"
echo "================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[OK]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_metric() {
    echo -e "${PURPLE}[METRIC]${NC} $1"
}

# Configuration
ENVIRONMENT=${1:-"production"}
ADMIN_API_KEY=${ADMIN_API_KEY:-"admin-api-key-for-development-only-change-in-production"}
MONITOR_INTERVAL=${MONITOR_INTERVAL:-60}  # seconds
ALERT_THRESHOLD_RESPONSE_TIME=${ALERT_THRESHOLD_RESPONSE_TIME:-2000}  # milliseconds
ALERT_THRESHOLD_ERROR_RATE=${ALERT_THRESHOLD_ERROR_RATE:-5}  # percentage

# Determine base URL based on environment
if [ "$ENVIRONMENT" = "production" ]; then
    BASE_URL=${PRODUCTION_URL:-"https://your-subdomain.workers.dev"}
elif [ "$ENVIRONMENT" = "staging" ]; then
    BASE_URL=${STAGING_URL:-"https://your-subdomain-staging.workers.dev"}
else
    BASE_URL=${DEV_URL:-"http://localhost:8787"}
fi

echo "Monitoring environment: $ENVIRONMENT"
echo "Base URL: $BASE_URL"
echo "Monitor interval: ${MONITOR_INTERVAL}s"
echo ""

# Function to check API health
check_health() {
    local start_time=$(date +%s%3N)
    local response
    local status_code
    local response_time
    
    response=$(curl -s -w '%{http_code}' -o /tmp/health_response.json "$BASE_URL/health" 2>/dev/null || echo "000")
    status_code="$response"
    local end_time=$(date +%s%3N)
    response_time=$((end_time - start_time))
    
    if [ "$status_code" = "200" ]; then
        print_success "Health check passed (${response_time}ms)"
        
        # Parse health response
        if [ -f "/tmp/health_response.json" ]; then
            local status=$(cat /tmp/health_response.json | grep -o '"status":"[^"]*' | cut -d'"' -f4 2>/dev/null || echo "unknown")
            local timestamp=$(cat /tmp/health_response.json | grep -o '"timestamp":"[^"]*' | cut -d'"' -f4 2>/dev/null || echo "unknown")
            print_metric "Status: $status, Timestamp: $timestamp"
        fi
        
        # Check response time threshold
        if [ "$response_time" -gt "$ALERT_THRESHOLD_RESPONSE_TIME" ]; then
            print_warning "Response time (${response_time}ms) exceeds threshold (${ALERT_THRESHOLD_RESPONSE_TIME}ms)"
        fi
        
        return 0
    else
        print_error "Health check failed - Status: $status_code, Response time: ${response_time}ms"
        return 1
    fi
}

# Function to get system metrics
get_system_metrics() {
    print_status "Fetching system metrics..."
    
    local response
    local status_code
    
    response=$(curl -s -w '%{http_code}' -o /tmp/metrics_response.json \
        -H "X-Admin-Key: $ADMIN_API_KEY" \
        "$BASE_URL/analytics/health" 2>/dev/null || echo "000")
    status_code="$response"
    
    if [ "$status_code" = "200" ] && [ -f "/tmp/metrics_response.json" ]; then
        print_success "System metrics retrieved"
        
        # Parse and display key metrics
        local total_users=$(cat /tmp/metrics_response.json | grep -o '"totalUsers":[0-9]*' | cut -d':' -f2 2>/dev/null || echo "0")
        local total_practitioners=$(cat /tmp/metrics_response.json | grep -o '"totalPractitioners":[0-9]*' | cut -d':' -f2 2>/dev/null || echo "0")
        local total_appointments=$(cat /tmp/metrics_response.json | grep -o '"totalAppointments":[0-9]*' | cut -d':' -f2 2>/dev/null || echo "0")
        local active_sessions=$(cat /tmp/metrics_response.json | grep -o '"activeSessions":[0-9]*' | cut -d':' -f2 2>/dev/null || echo "0")
        
        print_metric "Users: $total_users"
        print_metric "Practitioners: $total_practitioners"
        print_metric "Appointments: $total_appointments"
        print_metric "Active Sessions: $active_sessions"
    else
        print_error "Failed to retrieve system metrics - Status: $status_code"
    fi
}

# Function to check recent errors
check_recent_errors() {
    print_status "Checking for recent errors..."
    
    if command -v wrangler &> /dev/null; then
        # Get recent logs and check for errors
        local error_count
        if [ "$ENVIRONMENT" = "production" ]; then
            error_count=$(wrangler tail --env production --format json 2>/dev/null | \
                head -n 100 | grep -c '"level":"error"' 2>/dev/null || echo "0")
        elif [ "$ENVIRONMENT" = "staging" ]; then
            error_count=$(wrangler tail --env staging --format json 2>/dev/null | \
                head -n 100 | grep -c '"level":"error"' 2>/dev/null || echo "0")
        else
            error_count=$(wrangler tail --format json 2>/dev/null | \
                head -n 100 | grep -c '"level":"error"' 2>/dev/null || echo "0")
        fi
        
        if [ "$error_count" -gt 0 ]; then
            print_warning "Found $error_count recent errors in logs"
        else
            print_success "No recent errors found"
        fi
    else
        print_warning "Wrangler CLI not available - cannot check logs"
    fi
}

# Function to test critical endpoints
test_critical_endpoints() {
    print_status "Testing critical endpoints..."
    
    local endpoints=(
        "/health"
        "/practitioners"
        "/services"
        "/reviews"
    )
    
    local failed_endpoints=0
    local total_endpoints=${#endpoints[@]}
    
    for endpoint in "${endpoints[@]}"; do
        local start_time=$(date +%s%3N)
        local status_code
        status_code=$(curl -s -w '%{http_code}' -o /dev/null "$BASE_URL$endpoint" 2>/dev/null || echo "000")
        local end_time=$(date +%s%3N)
        local response_time=$((end_time - start_time))
        
        if [ "$status_code" = "200" ]; then
            print_success "$endpoint (${response_time}ms)"
        else
            print_error "$endpoint - Status: $status_code (${response_time}ms)"
            failed_endpoints=$((failed_endpoints + 1))
        fi
    done
    
    local error_rate=$((failed_endpoints * 100 / total_endpoints))
    print_metric "Endpoint error rate: ${error_rate}%"
    
    if [ "$error_rate" -gt "$ALERT_THRESHOLD_ERROR_RATE" ]; then
        print_warning "Error rate (${error_rate}%) exceeds threshold (${ALERT_THRESHOLD_ERROR_RATE}%)"
    fi
}

# Function to generate monitoring report
generate_report() {
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    local report_file="monitoring-report-$(date '+%Y%m%d-%H%M%S').txt"
    
    {
        echo "Klear Karma Backend Monitoring Report"
        echo "====================================="
        echo "Timestamp: $timestamp"
        echo "Environment: $ENVIRONMENT"
        echo "Base URL: $BASE_URL"
        echo ""
        echo "Health Check Results:"
        check_health 2>&1
        echo ""
        echo "System Metrics:"
        get_system_metrics 2>&1
        echo ""
        echo "Critical Endpoints Test:"
        test_critical_endpoints 2>&1
        echo ""
        echo "Recent Errors Check:"
        check_recent_errors 2>&1
    } > "$report_file"
    
    print_success "Monitoring report saved to: $report_file"
}

# Function for continuous monitoring
continuous_monitor() {
    print_status "Starting continuous monitoring (interval: ${MONITOR_INTERVAL}s)"
    print_status "Press Ctrl+C to stop"
    echo ""
    
    local iteration=1
    
    while true; do
        echo "$(date '+%Y-%m-%d %H:%M:%S') - Monitoring iteration #$iteration"
        echo "--------------------------------------------------------"
        
        check_health
        echo ""
        
        # Run detailed checks every 5 iterations
        if [ $((iteration % 5)) -eq 0 ]; then
            get_system_metrics
            echo ""
            test_critical_endpoints
            echo ""
        fi
        
        echo "Next check in ${MONITOR_INTERVAL}s..."
        echo ""
        
        sleep "$MONITOR_INTERVAL"
        iteration=$((iteration + 1))
    done
}

# Main execution
case "${2:-single}" in
    "continuous")
        continuous_monitor
        ;;
    "report")
        generate_report
        ;;
    "health")
        check_health
        ;;
    "metrics")
        get_system_metrics
        ;;
    "endpoints")
        test_critical_endpoints
        ;;
    "errors")
        check_recent_errors
        ;;
    *)
        print_status "Running single monitoring check..."
        echo ""
        check_health
        echo ""
        get_system_metrics
        echo ""
        test_critical_endpoints
        echo ""
        check_recent_errors
        echo ""
        print_success "Monitoring check completed"
        echo ""
        echo "Available commands:"
        echo "  ./scripts/monitor.sh [environment] health     - Health check only"
        echo "  ./scripts/monitor.sh [environment] metrics    - System metrics only"
        echo "  ./scripts/monitor.sh [environment] endpoints  - Test critical endpoints"
        echo "  ./scripts/monitor.sh [environment] errors     - Check recent errors"
        echo "  ./scripts/monitor.sh [environment] continuous - Continuous monitoring"
        echo "  ./scripts/monitor.sh [environment] report     - Generate detailed report"
        ;;
esac

# Cleanup
rm -f /tmp/health_response.json /tmp/metrics_response.json