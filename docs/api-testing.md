# API Testing Strategy

## Overview
This document outlines the API testing strategy for the Klear Karma backend, including the connection between project constants and testing environments.

## Testing Environments

The Klear Karma API can be tested against multiple environments:

1. **Local Development** (`http://localhost:8787`)
   - Used for rapid development and testing
   - Runs using Wrangler's local development server
   - Data is stored in local memory (not persistent)

2. **Production** (`https://api.klearkarma.life/api/v1`)
   - Live production environment
   - Uses Cloudflare Workers and KV Storage
   - Contains real or production-like data
   - **Note:** As of the current development phase, the production environment is not yet deployed. Tests against this environment will fail until deployment is complete.

## Connection to Project Constants

The API testing strategy is directly connected to the project constants defined in `/Users/sheshnarayaniyer/2025/klear-karma-backend/constants.md`:

### 1. Brand Identity & Voice

API responses follow the tone and messaging guidelines defined in the constants document:

- **Success messages** use encouraging, supportive language
- **Error messages** are helpful and solution-focused
- **Response formats** maintain consistent terminology

### 2. Technical Specifications

API responses adhere to the standard formats defined in the constants document:

```json
// Success Response Format
{
  "success": true,
  "data": {},
  "message": "Operation completed successfully",
  "timestamp": "2024-01-01T00:00:00Z"
}

// Error Response Format
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Please check your input and try again",
    "details": {}
  },
  "timestamp": "2024-01-01T00:00:00Z"
}
```

### 3. Mock Data Standards

The test data generated during API testing follows the mock data standards defined in the constants document:

- **User Profiles**: Diverse names, professional photos, authentic bios
- **Services & Pricing**: Market-realistic pricing ($50-$300), varied session types
- **Reviews & Ratings**: Balanced distribution (mostly 4-5 stars, some 3 stars)

## Testing Tools

### 1. test-api.sh

A comprehensive test script that validates all API endpoints against a specified environment.

```bash
# Test against production (default)
./scripts/test-api.sh

# Test against local environment
./scripts/test-api.sh http://localhost:8787
```

### 2. run-tests.sh

A wrapper script that can run tests against both local and production environments.

```bash
# Run tests against both environments
./scripts/run-tests.sh

# Run tests against local environment only
./scripts/run-tests.sh local

# Run tests against production environment only
./scripts/run-tests.sh prod
```

## Testing Workflow

1. **Local Development Testing**
   - Run local tests during development to validate changes
   - Ensure all tests pass before committing code

2. **Pre-Deployment Testing**
   - Run tests against staging environment (if available)
   - Verify all endpoints function as expected

3. **Production Validation**
   - After deployment, run tests against production
   - Confirm all endpoints are accessible and functioning

## Continuous Integration

In the future, these tests will be integrated into a CI/CD pipeline to automatically validate API functionality on every code push.

## Conclusion

By following this testing strategy and maintaining alignment with the project constants, we ensure that the Klear Karma API delivers a consistent, high-quality experience across all environments.