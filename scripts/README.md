# API Testing Scripts

## Overview
This directory contains scripts for testing the Klear Karma API endpoints against both local and production environments.

## Scripts

### test-api.sh
A comprehensive test script that validates all API endpoints against a specified environment.

#### Usage
```bash
# Test against production (default)
./test-api.sh

# Test against a specific environment
./test-api.sh https://staging-api.klearkarma.life/api/v1
./test-api.sh http://localhost:8787
```

#### Features
- Tests all API endpoints (authentication, users, practitioners, services, appointments, messages, reviews, analytics)
- Validates response status codes
- Handles authentication flow
- Provides detailed test results
- Cleans up test data after execution

#### Configuration
The script uses the following default configuration:
- Production URL: `https://api.klearkarma.life/api/v1`
- Test user credentials are generated dynamically
- Admin API key for analytics endpoints

#### Output
The script provides colored output indicating test status:
- 🟢 Green: Test passed
- 🔴 Red: Test failed
- 🟡 Yellow: Warning/skipped test
- 🔵 Blue: Test information

A summary of test results is displayed at the end, showing total tests, passed tests, failed tests, and success rate.

### run-tests.sh
A wrapper script that can run tests against both local and production environments.

#### Usage
```bash
# Run tests against both local and production environments
./run-tests.sh

# Run tests against local environment only
./run-tests.sh local

# Run tests against production environment only
./run-tests.sh prod
```

#### Features
- Automatically checks if local server is running and starts it if needed
- Verifies production server accessibility before running tests
- Provides a summary of test results for both environments
- Color-coded output for easy interpretation

#### Configuration
The script uses the following configuration:
- Local URL: `http://localhost:8787`
- Production URL: `https://api.klearkarma.life/api/v1`