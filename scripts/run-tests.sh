#!/bin/bash

# Klear Karma API Test Runner
# This script runs tests against both local and production environments

set -e  # Exit on any error

echo "🧪 Klear Karma API Test Runner"
echo "============================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_header() {
    echo -e "\n${BLUE}==== $1 ====${NC}\n"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_info() {
    echo -e "${YELLOW}[INFO]${NC} $1"
}

# Configuration
LOCAL_URL="http://localhost:8787"
DEV_URL="https://dev-api.klearkarma.life/api/v1"
PROD_URL="https://api.klearkarma.life/api/v1"

# Check if local server is running
check_local_server() {
    print_info "Checking if local server is running..."
    if curl -s --head --request GET $LOCAL_URL/health | grep "200" > /dev/null; then
        print_success "Local server is running at $LOCAL_URL"
        return 0
    else
        print_error "Local server is not running at $LOCAL_URL"
        return 1
    fi
}

# Check if production server is accessible
check_prod_server() {
    print_info "Checking if production server is accessible..."
    if curl -s --head --request GET $PROD_URL/health --connect-timeout 5 | grep "200" > /dev/null; then
        print_success "Production server is accessible at $PROD_URL"
        return 0
    else
        print_error "Production server is not accessible at $PROD_URL"
        return 1
    fi
}

# Check if dev server is accessible
check_dev_server() {
    print_info "Checking if dev server is accessible..."
    if curl -s --head --request GET $DEV_URL/health --connect-timeout 5 | grep "200" > /dev/null; then
        print_success "Dev server is accessible at $DEV_URL"
        return 0
    else
        print_error "Dev server is not accessible at $DEV_URL"
        return 1
    fi
}

# Run tests against local environment
run_local_tests() {
    print_header "Running tests against LOCAL environment"
    if check_local_server; then
        bash "$(dirname "$0")/test-api.sh" $LOCAL_URL
        return $?
    else
        print_info "Starting local server..."
        cd .. && npm run dev & 
        SERVER_PID=$!
        sleep 5
        
        if check_local_server; then
            bash "$(dirname "$0")/test-api.sh" $LOCAL_URL
            TEST_RESULT=$?
            
            print_info "Stopping local server..."
            kill $SERVER_PID
            return $TEST_RESULT
        else
            print_error "Failed to start local server"
            return 1
        fi
    fi
}

# Run tests against production environment
run_prod_tests() {
    print_header "Running tests against PRODUCTION environment"
    if check_prod_server; then
        bash "$(dirname "$0")/test-api.sh" $PROD_URL
        return $?
    else
        print_error "Cannot run tests against production - server not accessible"
        return 1
    fi
}

# Run tests against dev environment
run_dev_tests() {
    print_header "Running tests against DEV environment"
    if check_dev_server; then
        bash "$(dirname "$0")/test-api.sh" $DEV_URL
        return $?
    else
        print_error "Cannot run tests against dev - server not accessible"
        return 1
    fi
}

# Main execution
case "$1" in
    "local")
        run_local_tests
        exit $?
        ;;
    "dev")
        run_dev_tests
        exit $?
        ;;
    "prod")
        run_prod_tests
        exit $?
        ;;
    *)
        print_header "Running tests against ALL environments"
        
        # Run local tests
        run_local_tests
        LOCAL_RESULT=$?
        
        # Run dev tests
        run_dev_tests
        DEV_RESULT=$?
        
        # Run production tests
        run_prod_tests
        PROD_RESULT=$?
        
        # Summary
        print_header "Test Summary"
        
        if [ $LOCAL_RESULT -eq 0 ]; then
            print_success "Local tests: PASSED"
        else
            print_error "Local tests: FAILED"
        fi
        
        if [ $DEV_RESULT -eq 0 ]; then
            print_success "Dev tests: PASSED"
        else
            print_error "Dev tests: FAILED"
        fi
        
        if [ $PROD_RESULT -eq 0 ]; then
            print_success "Production tests: PASSED"
        else
            print_error "Production tests: FAILED"
        fi
        
        # Overall result
        if [ $LOCAL_RESULT -eq 0 ] && [ $DEV_RESULT -eq 0 ] && [ $PROD_RESULT -eq 0 ]; then
            print_success "All tests passed! 🎉"
            exit 0
        else
            print_error "Some tests failed. Please check the logs."
            exit 1
        fi
        ;;
esac