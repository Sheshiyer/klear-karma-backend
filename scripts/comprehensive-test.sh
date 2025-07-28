#!/bin/bash

# Klear Karma Backend - Comprehensive API Testing Script
# Tests all endpoints across multiple environments with detailed validation

set -e  # Exit on any error

echo "🧪 Comprehensive Klear Karma Backend API Testing"
echo "================================================"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
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

print_info() {
    echo -e "${CYAN}[INFO]${NC} $1"
}

print_section() {
    echo -e "${PURPLE}\n=== $1 ===${NC}"
}

# Configuration
ENVIRONMENT=${1:-"production"}
VERBOSE=${2:-"false"}

# Environment URLs
case $ENVIRONMENT in
    "production")
        BASE_URL="https://api.klearkarma.life/api/v1"
        HEALTH_URL="https://api.klearkarma.life/health"
        ;;
    "staging")
        BASE_URL="https://staging-api.klearkarma.life/api/v1"
        HEALTH_URL="https://staging-api.klearkarma.life/health"
        ;;
    "development")
        BASE_URL="https://dev-api.klearkarma.life/api/v1"
        HEALTH_URL="https://dev-api.klearkarma.life/health"
        ;;
    "local")
        BASE_URL="http://localhost:8787/api/v1"
        HEALTH_URL="http://localhost:8787/health"
        ;;
    *)
        echo "Invalid environment. Use: production, staging, development, or local"
        exit 1
        ;;
esac

TIMESTAMP=$(date +%s)
TEST_EMAIL="test${TIMESTAMP}@example.com"
TEST_PASSWORD="TestPassword123!"
ADMIN_API_KEY="admin-api-key-for-development-only-change-in-production"

echo "Testing Environment: $ENVIRONMENT"
echo "API Base URL: $BASE_URL"
echo "Health URL: $HEALTH_URL"
echo "Test Email: $TEST_EMAIL"
echo ""

# Test counters
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0
SKIPPED_TESTS=0

# Response storage
RESPONSE_FILE="/tmp/api_response_${TIMESTAMP}.json"
ERROR_LOG="/tmp/api_errors_${TIMESTAMP}.log"

# Function to run a test with enhanced validation
run_test() {
    local test_name="$1"
    local expected_status="$2"
    local url="$3"
    local method="${4:-GET}"
    local data="$5"
    local headers="$6"
    local validate_response="${7:-false}"
    local expected_fields="$8"
    
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
    print_status "$test_name"
    
    # Build curl command
    local curl_cmd="curl -s -w '%{http_code}' -o '$RESPONSE_FILE' --connect-timeout 15 --max-time 30"
    
    if [ "$method" != "GET" ]; then
        curl_cmd="$curl_cmd -X $method"
    fi
    
    if [ -n "$data" ]; then
        curl_cmd="$curl_cmd -H 'Content-Type: application/json' -d '$data'"
    fi
    
    if [ -n "$headers" ]; then
        curl_cmd="$curl_cmd $headers"
    fi
    
    # Handle different URL patterns
    if [[ "$url" == http* ]]; then
        curl_cmd="$curl_cmd '$url'"
    else
        curl_cmd="$curl_cmd '$BASE_URL$url'"
    fi
    
    # Execute the request
    local status_code
    if [ "$VERBOSE" = "true" ]; then
        echo "   Command: $curl_cmd"
    fi
    
    status_code=$(eval $curl_cmd 2>>"$ERROR_LOG")
    local curl_exit_code=$?
    
    # Check for connection errors
    if [ $curl_exit_code -ne 0 ]; then
        print_error "$test_name - Connection failed (exit code: $curl_exit_code)"
        FAILED_TESTS=$((FAILED_TESTS + 1))
        echo "   Error details logged to $ERROR_LOG"
        return
    fi
    
    # Validate status code
    if [ "$status_code" = "$expected_status" ]; then
        print_success "$test_name - Status: $status_code"
        PASSED_TESTS=$((PASSED_TESTS + 1))
        
        # Validate response content if requested
        if [ "$validate_response" = "true" ] && [ -f "$RESPONSE_FILE" ]; then
            validate_json_response "$expected_fields"
        fi
        
        # Show response preview for successful tests
        if [ "$VERBOSE" = "true" ] && [ -f "$RESPONSE_FILE" ]; then
            local response_preview
            response_preview=$(head -c 200 "$RESPONSE_FILE" 2>/dev/null || echo "")
            if [ -n "$response_preview" ]; then
                echo "   Response: ${response_preview}..."
            fi
        fi
    else
        print_error "$test_name - Expected: $expected_status, Got: $status_code"
        FAILED_TESTS=$((FAILED_TESTS + 1))
        
        # Show error response
        if [ -f "$RESPONSE_FILE" ]; then
            local error_response
            error_response=$(cat "$RESPONSE_FILE" 2>/dev/null || echo "No response body")
            echo "   Error Response: $error_response"
        fi
    fi
    
    echo ""
}

# Function to validate JSON response fields
validate_json_response() {
    local expected_fields="$1"
    
    if [ -z "$expected_fields" ]; then
        return
    fi
    
    if command -v jq >/dev/null 2>&1; then
        for field in $expected_fields; do
            if jq -e ".$field" "$RESPONSE_FILE" >/dev/null 2>&1; then
                echo "   ✓ Field '$field' present"
            else
                echo "   ✗ Field '$field' missing"
            fi
        done
    else
        echo "   Note: jq not available for response validation"
    fi
}

# Function to skip test with reason
skip_test() {
    local test_name="$1"
    local reason="$2"
    
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
    SKIPPED_TESTS=$((SKIPPED_TESTS + 1))
    print_warning "SKIP: $test_name - $reason"
    echo ""
}

# Store authentication tokens
JWT_TOKEN=""
USER_ID=""
PRACTITIONER_ID=""
PRODUCT_ID=""

# Function to extract data from JSON response
extract_from_response() {
    local field="$1"
    
    if [ -f "$RESPONSE_FILE" ] && command -v jq >/dev/null 2>&1; then
        jq -r ".$field // empty" "$RESPONSE_FILE" 2>/dev/null || echo ""
    elif [ -f "$RESPONSE_FILE" ]; then
        # Fallback grep method
        grep -o "\"$field\":\"[^\"]*\"" "$RESPONSE_FILE" | cut -d'"' -f4 || echo ""
    else
        echo ""
    fi
}

# Function to extract JWT token and user info
extract_auth_info() {
    JWT_TOKEN=$(extract_from_response "tokens.accessToken")
    USER_ID=$(extract_from_response "user.id")
    
    if [ -z "$JWT_TOKEN" ]; then
        JWT_TOKEN=$(extract_from_response "accessToken")
    fi
    
    if [ -z "$JWT_TOKEN" ]; then
        JWT_TOKEN=$(extract_from_response "token")
    fi
    
    if [ -z "$USER_ID" ]; then
        USER_ID=$(extract_from_response "id")
    fi
}

# Function to get first practitioner ID
get_first_practitioner_id() {
    if [ -f "$RESPONSE_FILE" ] && command -v jq >/dev/null 2>&1; then
        PRACTITIONER_ID=$(jq -r '.data[0].id // .practitioners[0].id // empty' "$RESPONSE_FILE" 2>/dev/null || echo "")
    fi
}

# Function to get first product ID
get_first_product_id() {
    if [ -f "$RESPONSE_FILE" ] && command -v jq >/dev/null 2>&1; then
        PRODUCT_ID=$(jq -r '.data[0].id // .products[0].id // empty' "$RESPONSE_FILE" 2>/dev/null || echo "")
    fi
}

print_section "INFRASTRUCTURE TESTS"

# Health and API Info Tests
run_test "Health Check" "200" "$HEALTH_URL" "GET" "" "" "true" "status message"
run_test "API Info" "200" "/" "GET" "" "" "true" "name version"
run_test "API v1 Info" "200" "/api/v1" "GET" "" "" "true" "name version"

print_section "AUTHENTICATION TESTS"

# User Registration
register_data='{
  "email": "'$TEST_EMAIL'",
  "password": "'$TEST_PASSWORD'",
  "fullName": "Test User",
  "phone": "+1234567890",
  "dateOfBirth": "1990-01-01",
  "gender": "other"
}'

run_test "User Registration" "201" "/auth/register" "POST" "$register_data" "" "true" "tokens user"
# Extract auth info from the new response format
JWT_TOKEN=$(extract_from_response "tokens.accessToken")
USER_ID=$(extract_from_response "user.id")

# User Login
login_data='{
  "email": "'$TEST_EMAIL'",
  "password": "'$TEST_PASSWORD'"
}'

run_test "User Login" "200" "/auth/login" "POST" "$login_data" "" "true" "tokens user"
# Extract auth info from the new response format
JWT_TOKEN=$(extract_from_response "tokens.accessToken")
USER_ID=$(extract_from_response "user.id")

if [ -n "$JWT_TOKEN" ]; then
    print_success "JWT Token obtained: ${JWT_TOKEN:0:30}..."
    AUTH_HEADER="-H 'Authorization: Bearer $JWT_TOKEN'"
else
    print_warning "No JWT token obtained, authenticated tests will be skipped"
    AUTH_HEADER=""
fi

# Authentication Error Tests
run_test "Login with Invalid Credentials" "401" "/auth/login" "POST" '{"email":"invalid@test.com","password":"wrong"}'
run_test "Register with Invalid Email" "400" "/auth/register" "POST" '{"email":"invalid-email","password":"Test123!"}'
run_test "Register with Weak Password" "400" "/auth/register" "POST" '{"email":"test@test.com","password":"123"}'

print_section "USER MANAGEMENT TESTS"

if [ -n "$AUTH_HEADER" ]; then
    run_test "Get Current User" "200" "/users/me" "GET" "" "$AUTH_HEADER" "true" "id email fullName"
    
    update_data='{
      "fullName": "Updated Test User",
      "phone": "+1987654321"
    }'
    run_test "Update User Profile" "200" "/users/me" "PUT" "$update_data" "$AUTH_HEADER" "true" "id fullName"
    
    run_test "Get User Appointments" "200" "/users/me/appointments" "GET" "" "$AUTH_HEADER" "true" "data success"
    run_test "Get User Messages" "200" "/users/me/messages" "GET" "" "$AUTH_HEADER" "true" "data success"
    run_test "Get User Reviews" "200" "/users/me/reviews" "GET" "" "$AUTH_HEADER" "true" "data success"
else
    skip_test "User Management Tests" "No authentication token"
fi

# Unauthorized access tests
run_test "Unauthorized User Profile Access" "401" "/users/me" "GET"
run_test "Unauthorized Profile Update" "401" "/users/me" "PUT" '{"fullName":"Hacker"}'

print_section "PRACTITIONER TESTS"

run_test "List All Practitioners" "200" "/practitioners" "GET" "" "" "true" "data success"
get_first_practitioner_id

run_test "List Practitioners with Pagination" "200" "/practitioners?page=1&limit=5" "GET" "" "" "true" "data success"
run_test "Search Practitioners by Specialization" "200" "/practitioners?specialization=therapy" "GET" "" "" "true" "data success"
run_test "Search Practitioners by Location" "200" "/practitioners?city=New+York" "GET" "" "" "true" "data success"
run_test "Filter Available Practitioners" "200" "/practitioners?available=true" "GET" "" "" "true" "data success"
run_test "Complex Practitioner Search" "200" "/practitioners?specialization=reiki&city=Los+Angeles&available=true&minRating=4&limit=10" "GET" "" "" "true" "data success"

if [ -n "$PRACTITIONER_ID" ]; then
    run_test "Get Specific Practitioner" "200" "/practitioners/$PRACTITIONER_ID" "GET" "" "" "true" "id fullName specializations"
    run_test "Get Practitioner Services" "200" "/practitioners/$PRACTITIONER_ID/services" "GET" "" "" "true" "services"
    run_test "Get Practitioner Reviews" "200" "/practitioners/$PRACTITIONER_ID/reviews" "GET" "" "" "true" "reviews"
    run_test "Get Practitioner Availability" "200" "/practitioners/$PRACTITIONER_ID/availability" "GET" "" "" "true" "availability"
else
    skip_test "Specific Practitioner Tests" "No practitioner ID available"
fi

# Practitioner error tests
run_test "Get Non-existent Practitioner" "404" "/practitioners/non-existent-id" "GET"
run_test "Invalid Practitioner Search Parameters" "400" "/practitioners?minRating=invalid" "GET"

print_section "SERVICES TESTS"

run_test "List All Services" "200" "/services" "GET" "" "" "true" "data success"
run_test "List Services with Pagination" "200" "/services?page=1&limit=10" "GET" "" "" "true" "data success"
run_test "Search Services by Category" "200" "/services?category=therapy" "GET" "" "" "true" "data success"
run_test "Filter Services by Price Range" "200" "/services?minPrice=50&maxPrice=200" "GET" "" "" "true" "data success"
run_test "Search Services by Name" "200" "/services?search=meditation" "GET" "" "" "true" "data success"
run_test "Complex Service Search" "200" "/services?category=healing&minPrice=30&maxPrice=150&search=reiki&limit=5" "GET" "" "" "true" "data success"

# Service error tests
run_test "Invalid Service Search Parameters" "400" "/services?minPrice=invalid" "GET"

print_section "CATEGORIES TESTS"

run_test "Get Practitioner Categories" "200" "/categories/practitioners" "GET" "" "" "true" "data success"
run_test "Get Service Categories" "200" "/categories/services" "GET" "" "" "true" "data success"
run_test "Get Product Categories" "200" "/categories/products" "GET" "" "" "true" "data success"

print_section "PRODUCT MARKETPLACE TESTS"

run_test "List All Products" "200" "/products" "GET" "" "" "true" "data success"
get_first_product_id

run_test "List Products with Pagination" "200" "/products?page=1&limit=10" "GET" "" "" "true" "data success"
run_test "Search Products by Category" "200" "/products?category=books" "GET" "" "" "true" "data success"
run_test "Filter Products by Price Range" "200" "/products?minPrice=10&maxPrice=100" "GET" "" "" "true" "data success"
run_test "Search Products by Name" "200" "/products?search=crystal" "GET" "" "" "true" "data success"
run_test "Filter Verified Products Only" "200" "/products?verified=true" "GET" "" "" "true" "data success"
run_test "Filter Products by Modality" "200" "/products?modality=physical" "GET" "" "" "true" "data success"
run_test "Complex Product Search" "200" "/products?category=crystals&minPrice=20&maxPrice=80&verified=true&sort=price&order=asc" "GET" "" "" "true" "data success"

if [ -n "$PRODUCT_ID" ]; then
    run_test "Get Specific Product" "200" "/products/$PRODUCT_ID" "GET" "" "" "true" "id name description price"
else
    skip_test "Specific Product Tests" "No product ID available"
fi

# Product creation/management (requires authentication)
if [ -n "$AUTH_HEADER" ]; then
    product_data='{
      "name": "Test Crystal Set",
      "description": "A beautiful set of healing crystals for meditation",
      "price": 49.99,
      "category": "crystals",
      "modality": "physical",
      "images": ["https://example.com/crystal1.jpg"],
      "tags": ["healing", "meditation", "crystals"]
    }'
    
    run_test "Create Product (User - Should Fail)" "403" "/products" "POST" "$product_data" "$AUTH_HEADER"
else
    skip_test "Product Creation Tests" "No authentication token"
fi

# Product error tests
run_test "Get Non-existent Product" "404" "/products/non-existent-id" "GET"
run_test "Invalid Product Search Parameters" "400" "/products?minPrice=invalid" "GET"

print_section "APPOINTMENT TESTS"

if [ -n "$AUTH_HEADER" ] && [ -n "$PRACTITIONER_ID" ]; then
    # Get a service ID first
    run_test "Get Services for Appointment" "200" "/services?limit=1" "GET" "" "" "false"
    SERVICE_ID=$(extract_from_response "services.0.id")
    
    if [ -n "$SERVICE_ID" ]; then
        booking_data='{
          "practitionerId": "'$PRACTITIONER_ID'",
          "serviceId": "'$SERVICE_ID'",
          "date": "2024-12-31",
          "time": "10:00",
          "notes": "Test appointment booking"
        }'
        
        run_test "Book Appointment" "201" "/appointments" "POST" "$booking_data" "$AUTH_HEADER" "true" "id practitionerId serviceId"
        APPOINTMENT_ID=$(extract_from_response "id")
        
        if [ -n "$APPOINTMENT_ID" ]; then
            run_test "Get Appointment Details" "200" "/appointments/$APPOINTMENT_ID" "GET" "" "$AUTH_HEADER" "true" "id status"
            run_test "Update Appointment" "200" "/appointments/$APPOINTMENT_ID" "PUT" '{"notes":"Updated notes"}' "$AUTH_HEADER" "true" "id notes"
            run_test "Cancel Appointment" "200" "/appointments/$APPOINTMENT_ID/cancel" "POST" "" "$AUTH_HEADER" "true" "id status"
        fi
    else
        skip_test "Appointment Booking" "No service ID available"
    fi
else
    skip_test "Appointment Tests" "Missing authentication or practitioner ID"
fi

# Appointment error tests
if [ -n "$AUTH_HEADER" ]; then
    run_test "Book Invalid Appointment" "400" "/appointments" "POST" '{"practitionerId":"invalid"}' "$AUTH_HEADER"
    run_test "Get Non-existent Appointment" "404" "/appointments/non-existent-id" "GET" "" "$AUTH_HEADER"
fi

print_section "MESSAGING TESTS"

if [ -n "$AUTH_HEADER" ]; then
    run_test "Get User Conversations" "200" "/messages/conversations" "GET" "" "$AUTH_HEADER" "true" "data success"
    run_test "Get Conversation Messages" "200" "/messages/conversations/test-conversation-id" "GET" "" "$AUTH_HEADER"
    
    message_data='{
      "recipientId": "test-recipient-id",
      "content": "Test message content",
      "type": "text"
    }'
    
    run_test "Send Message" "201" "/messages" "POST" "$message_data" "$AUTH_HEADER"
else
    skip_test "Messaging Tests" "No authentication token"
fi

print_section "REVIEW TESTS"

run_test "List All Reviews" "200" "/reviews" "GET" "" "" "true" "data success"
run_test "List Reviews with Filters" "200" "/reviews?minRating=4&limit=10" "GET" "" "" "true" "data success"
run_test "List Reviews by Practitioner" "200" "/reviews?practitionerId=test-id" "GET" "" "" "true" "data success"

if [ -n "$AUTH_HEADER" ] && [ -n "$PRACTITIONER_ID" ]; then
    review_data='{
      "practitionerId": "'$PRACTITIONER_ID'",
      "rating": 5,
      "comment": "Excellent service, highly recommended!",
      "serviceId": "test-service-id"
    }'
    
    run_test "Create Review" "201" "/reviews" "POST" "$review_data" "$AUTH_HEADER" "true" "id rating comment"
else
    skip_test "Review Creation" "Missing authentication or practitioner ID"
fi

print_section "ADMIN TESTS"

ADMIN_HEADER="-H 'X-Admin-Key: $ADMIN_API_KEY'"

# Admin Analytics
run_test "Analytics Dashboard" "200" "/admin/analytics/dashboard" "GET" "" "$ADMIN_HEADER" "true" "users practitioners appointments"
run_test "User Analytics" "200" "/admin/analytics/users" "GET" "" "$ADMIN_HEADER" "true" "totalUsers"
run_test "Practitioner Analytics" "200" "/admin/analytics/practitioners" "GET" "" "$ADMIN_HEADER" "true" "totalPractitioners"
run_test "Appointment Analytics" "200" "/admin/analytics/appointments" "GET" "" "$ADMIN_HEADER" "true" "totalAppointments"
run_test "Revenue Analytics" "200" "/admin/analytics/revenue" "GET" "" "$ADMIN_HEADER" "true" "totalRevenue"
run_test "System Health" "200" "/admin/analytics/health" "GET" "" "$ADMIN_HEADER" "true" "status"

# Admin User Management
run_test "List All Users (Admin)" "200" "/admin/users" "GET" "" "$ADMIN_HEADER" "true" "users total"
run_test "Search Users (Admin)" "200" "/admin/users?search=test" "GET" "" "$ADMIN_HEADER" "true" "users"

if [ -n "$USER_ID" ]; then
    run_test "Get User Details (Admin)" "200" "/admin/users/$USER_ID" "GET" "" "$ADMIN_HEADER" "true" "id email fullName"
    run_test "Update User Status (Admin)" "200" "/admin/users/$USER_ID/status" "PUT" '{"status":"active"}' "$ADMIN_HEADER" "true" "id status"
fi

# Admin Practitioner Management
run_test "List All Practitioners (Admin)" "200" "/admin/practitioners" "GET" "" "$ADMIN_HEADER" "true" "practitioners total"

if [ -n "$PRACTITIONER_ID" ]; then
    run_test "Verify Practitioner (Admin)" "200" "/admin/practitioners/$PRACTITIONER_ID/verify" "POST" "" "$ADMIN_HEADER" "true" "id verified"
fi

# Admin Product Management
run_test "List All Products (Admin)" "200" "/admin/products" "GET" "" "$ADMIN_HEADER" "true" "products total"

if [ -n "$PRODUCT_ID" ]; then
    run_test "Verify Product (Admin)" "200" "/admin/products/$PRODUCT_ID/verify" "POST" "" "$ADMIN_HEADER" "true" "id verified"
fi

# Admin Settings
run_test "Get System Settings" "200" "/admin/settings" "GET" "" "$ADMIN_HEADER" "true" "settings"

settings_data='{
  "maintenanceMode": false,
  "registrationEnabled": true,
  "maxAppointmentsPerDay": 10
}'
run_test "Update System Settings" "200" "/admin/settings" "PUT" "$settings_data" "$ADMIN_HEADER" "true" "settings"

# Admin error tests
run_test "Admin Access with Invalid Key" "401" "/admin/analytics/dashboard" "GET" "" "-H 'X-Admin-Key: invalid-key'"
run_test "Admin Access without Key" "401" "/admin/analytics/dashboard" "GET"

print_section "ERROR HANDLING TESTS"

# 404 Tests
run_test "404 - Non-existent Endpoint" "404" "/nonexistent-endpoint" "GET"
run_test "404 - Non-existent API Version" "404" "/api/v2/users" "GET"
run_test "404 - Non-existent Resource" "404" "/users/non-existent-id" "GET"

# 400 Tests
run_test "400 - Invalid JSON" "400" "/auth/login" "POST" "invalid-json"
run_test "400 - Missing Required Fields" "400" "/auth/register" "POST" '{}'
run_test "400 - Invalid Email Format" "400" "/auth/register" "POST" '{"email":"invalid-email","password":"Test123!"}'

# 401 Tests
run_test "401 - No Authorization Header" "401" "/users/me" "GET"
run_test "401 - Invalid JWT Token" "401" "/users/me" "GET" "" "-H 'Authorization: Bearer invalid-token'"
run_test "401 - Expired JWT Token" "401" "/users/me" "GET" "" "-H 'Authorization: Bearer eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJPbmxpbmUgSldUIEJ1aWxkZXIiLCJpYXQiOjE2MDk0NTkxOTksImV4cCI6MTYwOTQ1OTIwMCwiYXVkIjoid3d3LmV4YW1wbGUuY29tIiwic3ViIjoianJvY2tldEBleGFtcGxlLmNvbSIsIkdpdmVuTmFtZSI6IkpvaG5ueSIsIlN1cm5hbWUiOiJSb2NrZXQiLCJFbWFpbCI6Impyb2NrZXRAZXhhbXBsZS5jb20iLCJSb2xlIjpbIk1hbmFnZXIiLCJQcm9qZWN0IEFkbWluaXN0cmF0b3IiXX0.invalid'"

# 403 Tests
if [ -n "$AUTH_HEADER" ]; then
    run_test "403 - User Accessing Admin Endpoint" "403" "/admin/users" "GET" "" "$AUTH_HEADER"
    run_test "403 - User Creating Product" "403" "/products" "POST" '{"name":"Test"}' "$AUTH_HEADER"
fi

# 405 Tests
run_test "405 - Method Not Allowed" "405" "/health" "POST"
run_test "405 - Invalid Method on Endpoint" "405" "/users/me" "PATCH"

# Rate Limiting Tests (if implemented)
print_section "RATE LIMITING TESTS"
print_info "Note: Rate limiting may be disabled in development"

for i in {1..5}; do
    run_test "Rate Limit Test $i" "200" "/health" "GET"
    sleep 0.1
done

print_section "PERFORMANCE TESTS"

# Response time tests
print_info "Testing response times (should be < 2 seconds)"
start_time=$(date +%s%N)
run_test "Performance - Health Check" "200" "$HEALTH_URL" "GET"
end_time=$(date +%s%N)
response_time=$(( (end_time - start_time) / 1000000 ))
print_info "Health check response time: ${response_time}ms"

start_time=$(date +%s%N)
run_test "Performance - List Practitioners" "200" "/practitioners?limit=50" "GET"
end_time=$(date +%s%N)
response_time=$(( (end_time - start_time) / 1000000 ))
print_info "Practitioners list response time: ${response_time}ms"

print_section "CLEANUP"

# Clean up test user
if [ -n "$AUTH_HEADER" ] && [ -n "$USER_ID" ]; then
    print_status "Cleaning up test user..."
    run_test "Delete Test User" "200" "/users/me" "DELETE" "" "$AUTH_HEADER"
fi

# Clean up temporary files
rm -f "$RESPONSE_FILE" 2>/dev/null || true

print_section "TEST RESULTS SUMMARY"

echo "Environment: $ENVIRONMENT"
echo "API Base URL: $BASE_URL"
echo "Total Tests: $TOTAL_TESTS"
echo "Passed: $PASSED_TESTS"
echo "Failed: $FAILED_TESTS"
echo "Skipped: $SKIPPED_TESTS"

if [ $TOTAL_TESTS -gt 0 ]; then
    success_rate=$(( (PASSED_TESTS * 100) / TOTAL_TESTS ))
    echo "Success Rate: ${success_rate}%"
else
    echo "Success Rate: N/A"
fi

echo ""

if [ $FAILED_TESTS -eq 0 ]; then
    print_success "All tests passed! 🎉"
    echo "The API is functioning correctly across all tested endpoints."
    exit 0
else
    print_error "$FAILED_TESTS test(s) failed."
    echo "Please review the failed tests and check the API implementation."
    if [ -f "$ERROR_LOG" ]; then
        echo "Error details available in: $ERROR_LOG"
    fi
    exit 1
fi