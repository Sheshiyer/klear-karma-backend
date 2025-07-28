#!/bin/bash

# Klear Karma Backend API Testing Script
# This script tests all API endpoints to ensure they're working correctly

set -e  # Exit on any error

echo "🧪 Testing Klear Karma Backend API"
echo "=================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[TEST]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[PASS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

print_error() {
    echo -e "${RED}[FAIL]${NC} $1"
}

# Configuration
BASE_URL=${1:-"https://api.klearkarma.life/api/v1"}
TIMESTAMP=$(date +%s)
TEST_EMAIL="test${TIMESTAMP}@example.com"
TEST_PASSWORD="TestPassword123!"
ADMIN_API_KEY="admin-api-key-for-development-only-change-in-production"

echo "Testing API at: $BASE_URL"
echo ""

# Test counters
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0

# Function to run a test
run_test() {
    local test_name="$1"
    local expected_status="$2"
    local url="$3"
    local method="${4:-GET}"
    local data="$5"
    local headers="$6"
    
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
    print_status "$test_name"
    
    # Build curl command
    local curl_cmd="curl -s -w '%{http_code}' -o /tmp/api_response.json --connect-timeout 10"
    
    if [ "$method" != "GET" ]; then
        curl_cmd="$curl_cmd -X $method"
    fi
    
    if [ -n "$data" ]; then
        curl_cmd="$curl_cmd -H 'Content-Type: application/json' -d '$data'"
    fi
    
    if [ -n "$headers" ]; then
        curl_cmd="$curl_cmd $headers"
    fi
    
    curl_cmd="$curl_cmd '$BASE_URL$url'"
    
    # Execute the request
    local status_code
    echo "   Executing: curl to $BASE_URL$url"
    status_code=$(eval $curl_cmd)
    
    # Check for connection errors
    if [ $? -ne 0 ]; then
        print_error "$test_name - Connection failed to $BASE_URL$url"
        FAILED_TESTS=$((FAILED_TESTS + 1))
        return
    fi
    
    # Check the result
    if [ "$status_code" = "$expected_status" ]; then
        print_success "$test_name - Status: $status_code"
        PASSED_TESTS=$((PASSED_TESTS + 1))
        
        # Show response for successful tests (optional)
        if [ "$expected_status" = "200" ] && [ -f "/tmp/api_response.json" ]; then
            local response_preview
            response_preview=$(head -c 100 /tmp/api_response.json 2>/dev/null || echo "")
            if [ -n "$response_preview" ]; then
                echo "   Response: ${response_preview}..."
            fi
        fi
    else
        print_error "$test_name - Expected: $expected_status, Got: $status_code"
        FAILED_TESTS=$((FAILED_TESTS + 1))
        
        # Show error response
        if [ -f "/tmp/api_response.json" ]; then
            echo "   Error Response: $(cat /tmp/api_response.json)"
        fi
    fi
    
    echo ""
}

# Store JWT token for authenticated requests
JWT_TOKEN=""
USER_ID=""

# Function to extract JWT token from response
extract_jwt() {
    if [ -f "/tmp/api_response.json" ]; then
        JWT_TOKEN=$(cat /tmp/api_response.json | grep -o '"accessToken":"[^"]*' | cut -d'"' -f4 || echo "")
        USER_ID=$(cat /tmp/api_response.json | grep -o '"id":"[^"]*' | cut -d'"' -f4 || echo "")
    fi
}

echo "🏥 Health Check Tests"
echo "-------------------"
run_test "Health Check" "200" "/health"
run_test "API Info" "200" "/api/v1"

echo "🔐 Authentication Tests"
echo "----------------------"

# Test user registration
register_data='{
  "email": "'$TEST_EMAIL'",
  "password": "'$TEST_PASSWORD'",
  "fullName": "Test User",
  "phone": "+1234567890",
  "dateOfBirth": "1990-01-01",
  "gender": "other"
}'

run_test "User Registration" "201" "/api/v1/auth/register" "POST" "$register_data"
extract_jwt

# Test user login
login_data='{
  "email": "'$TEST_EMAIL'",
  "password": "'$TEST_PASSWORD'"
}'

run_test "User Login" "200" "/api/v1/auth/login" "POST" "$login_data"
extract_jwt

if [ -n "$JWT_TOKEN" ]; then
    print_success "JWT Token obtained: ${JWT_TOKEN:0:20}..."
    AUTH_HEADER="-H 'Authorization: Bearer $JWT_TOKEN'"
else
    print_warning "No JWT token obtained, authenticated tests will fail"
    AUTH_HEADER=""
fi

echo "👤 User Management Tests"
echo "-----------------------"

if [ -n "$AUTH_HEADER" ]; then
    run_test "Get Current User" "200" "/api/v1/users/me" "GET" "" "$AUTH_HEADER"
    run_test "Update User Profile" "200" "/api/v1/users/me" "PUT" '{"fullName": "Updated Test User"}' "$AUTH_HEADER"
    run_test "Get User Appointments" "200" "/api/v1/users/me/appointments" "GET" "" "$AUTH_HEADER"
    run_test "Get User Messages" "200" "/api/v1/users/me/messages" "GET" "" "$AUTH_HEADER"
    run_test "Get User Reviews" "200" "/api/v1/users/me/reviews" "GET" "" "$AUTH_HEADER"
else
    print_warning "Skipping user tests - no authentication token"
fi

echo "👨‍⚕️ Practitioner Tests"
echo "----------------------"

run_test "List Practitioners" "200" "/api/v1/practitioners"
run_test "List Practitioners with Filters" "200" "/api/v1/practitioners?specialization=therapy&location=New+York"
run_test "Get Practitioner Categories" "200" "/api/v1/categories/practitioners"

echo "🛍️ Services Tests"
echo "-----------------"

run_test "List Services" "200" "/api/v1/services"
run_test "List Service Categories" "200" "/api/v1/categories/services"
run_test "List Services with Filters" "200" "/api/v1/services?category=therapy&minPrice=50&maxPrice=200"

echo "📅 Appointment Tests"
echo "-------------------"

if [ -n "$AUTH_HEADER" ]; then
    # Test appointment booking (this will likely fail without a valid practitioner)
    booking_data='{
      "practitionerId": "test-practitioner-id",
      "serviceId": "test-service-id",
      "date": "2024-12-31",
      "time": "10:00",
      "notes": "Test appointment booking"
    }'
    
    run_test "Book Appointment (Expected to fail)" "400" "/api/v1/appointments" "POST" "$booking_data" "$AUTH_HEADER"
else
    print_warning "Skipping appointment tests - no authentication token"
fi

echo "💬 Message Tests"
echo "---------------"

if [ -n "$AUTH_HEADER" ]; then
    run_test "Get User Conversations" "200" "/api/v1/messages/conversations" "GET" "" "$AUTH_HEADER"
else
    print_warning "Skipping message tests - no authentication token"
fi

echo "⭐ Review Tests"
echo "--------------"

run_test "List Reviews" "200" "/api/v1/reviews"
run_test "List Reviews with Filters" "200" "/api/v1/reviews?minRating=4&limit=10"

echo "📊 Analytics Tests (Admin)"
echo "--------------------------"

ADMIN_HEADER="-H 'X-Admin-Key: $ADMIN_API_KEY'"
run_test "Analytics Dashboard" "200" "/api/v1/analytics/dashboard" "GET" "" "$ADMIN_HEADER"
run_test "User Analytics" "200" "/api/v1/analytics/users" "GET" "" "$ADMIN_HEADER"
run_test "Appointment Analytics" "200" "/api/v1/analytics/appointments" "GET" "" "$ADMIN_HEADER"
run_test "Revenue Analytics" "200" "/api/v1/analytics/revenue" "GET" "" "$ADMIN_HEADER"
run_test "System Health" "200" "/api/v1/analytics/health" "GET" "" "$ADMIN_HEADER"

echo "🚫 Error Handling Tests"
echo "-----------------------"

run_test "404 Not Found" "404" "/nonexistent-endpoint"
run_test "Invalid JSON" "400" "/api/v1/auth/login" "POST" "invalid-json"
run_test "Unauthorized Access" "401" "/api/v1/users/me" "GET"
run_test "Invalid Admin Key" "401" "/api/v1/analytics/dashboard" "GET" "" "-H 'X-Admin-Key: invalid-key'"

echo "🧹 Cleanup"
echo "---------"

if [ -n "$AUTH_HEADER" ] && [ -n "$USER_ID" ]; then
    print_status "Cleaning up test user..."
    run_test "Delete Test User" "200" "/api/v1/users/me" "DELETE" "" "$AUTH_HEADER"
fi

# Clean up temporary files
rm -f /tmp/api_response.json

echo "📊 Test Results"
echo "==============="
echo "Total Tests: $TOTAL_TESTS"
echo "Passed: $PASSED_TESTS"
echo "Failed: $FAILED_TESTS"
echo "Success Rate: $(( PASSED_TESTS * 100 / TOTAL_TESTS ))%"
echo ""

if [ $FAILED_TESTS -eq 0 ]; then
    print_success "All tests passed! 🎉"
    exit 0
else
    print_error "$FAILED_TESTS test(s) failed. Please check the API implementation."
    exit 1
fi