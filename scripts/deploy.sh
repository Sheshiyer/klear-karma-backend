#!/bin/bash

# Klear Karma Backend Deployment Script
# This script sets up KV namespaces and deploys the Cloudflare Worker

set -e  # Exit on any error

echo "🚀 Starting Klear Karma Backend Deployment"
echo "==========================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if wrangler is installed
if ! command -v wrangler &> /dev/null; then
    print_error "Wrangler CLI is not installed. Please install it first:"
    echo "npm install -g wrangler"
    exit 1
fi

# Check if user is logged in
if ! wrangler whoami &> /dev/null; then
    print_error "You are not logged in to Cloudflare. Please run:"
    echo "wrangler login"
    exit 1
fi

print_success "Wrangler CLI is ready"

# Environment selection
ENVIRONMENT=${1:-"development"}
print_status "Deploying to environment: $ENVIRONMENT"

# Create KV namespaces if they don't exist
print_status "Setting up KV namespaces..."

KV_NAMESPACES=(
    "USERS_KV"
    "PRACTITIONERS_KV"
    "APPOINTMENTS_KV"
    "MESSAGES_KV"
    "SERVICES_KV"
    "REVIEWS_KV"
    "ANALYTICS_KV"
)

for namespace in "${KV_NAMESPACES[@]}"; do
    print_status "Creating KV namespace: $namespace"
    
    if [ "$ENVIRONMENT" = "production" ]; then
        wrangler kv:namespace create "$namespace" --env production || print_warning "Namespace $namespace might already exist"
    else
        wrangler kv:namespace create "$namespace" || print_warning "Namespace $namespace might already exist"
    fi
done

print_success "KV namespaces setup completed"

# Set up secrets (if not already set)
print_status "Checking required secrets..."

REQUIRED_SECRETS=(
    "JWT_SECRET"
    "ENCRYPTION_KEY"
    "ADMIN_API_KEY"
)

for secret in "${REQUIRED_SECRETS[@]}"; do
    if [ "$ENVIRONMENT" = "production" ]; then
        if ! wrangler secret list --env production | grep -q "$secret"; then
            print_warning "Secret $secret not found. Please set it manually:"
            echo "wrangler secret put $secret --env production"
        fi
    else
        if ! wrangler secret list | grep -q "$secret"; then
            print_warning "Secret $secret not found. Please set it manually:"
            echo "wrangler secret put $secret"
        fi
    fi
done

# Generate TypeScript types
print_status "Generating TypeScript types..."
wrangler types

# Deploy the worker
print_status "Deploying Cloudflare Worker..."

if [ "$ENVIRONMENT" = "production" ]; then
    wrangler deploy --env production
    WORKER_URL=$(wrangler subdomain get 2>/dev/null || echo "your-subdomain.workers.dev")
    print_success "Deployed to production: https://$WORKER_URL"
elif [ "$ENVIRONMENT" = "staging" ]; then
    wrangler deploy --env staging
    print_success "Deployed to staging environment"
else
    wrangler deploy
    WORKER_URL=$(wrangler subdomain get 2>/dev/null || echo "your-subdomain.workers.dev")
    print_success "Deployed to development: https://$WORKER_URL"
fi

# Test the deployment
print_status "Testing deployment..."

if [ "$ENVIRONMENT" = "production" ]; then
    HEALTH_URL="https://$WORKER_URL/health"
else
    HEALTH_URL="https://$WORKER_URL/health"
fi

if curl -s "$HEALTH_URL" | grep -q "healthy"; then
    print_success "Health check passed! API is responding correctly."
else
    print_warning "Health check failed. Please check the deployment manually."
fi

echo ""
print_success "Deployment completed successfully!"
echo "==========================================="
echo "📋 Next Steps:"
echo "1. Set up required secrets if not already done:"
for secret in "${REQUIRED_SECRETS[@]}"; do
    if [ "$ENVIRONMENT" = "production" ]; then
        echo "   wrangler secret put $secret --env production"
    else
        echo "   wrangler secret put $secret"
    fi
done
echo ""
echo "2. Populate mock data (development only):"
echo "   curl -X POST https://$WORKER_URL/populate-mock-data"
echo ""
echo "3. Test the API:"
echo "   curl https://$WORKER_URL/health"
echo ""
echo "4. Monitor logs:"
if [ "$ENVIRONMENT" = "production" ]; then
    echo "   wrangler tail --env production"
else
    echo "   wrangler tail"
fi
echo ""
print_success "Happy coding! 🎉"