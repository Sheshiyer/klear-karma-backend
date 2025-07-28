#!/bin/bash

# Klear Karma Backend Development Setup Script
# This script sets up the development environment

set -e  # Exit on any error

echo "🛠️  Setting up Klear Karma Backend Development Environment"
echo "======================================================="

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

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    print_error "Node.js is not installed. Please install Node.js 18+ first."
    exit 1
fi

NODE_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    print_error "Node.js version 18+ is required. Current version: $(node --version)"
    exit 1
fi

print_success "Node.js $(node --version) is ready"

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    print_error "npm is not installed. Please install npm first."
    exit 1
fi

print_success "npm $(npm --version) is ready"

# Install dependencies
print_status "Installing dependencies..."
npm install
print_success "Dependencies installed"

# Install wrangler globally if not present
if ! command -v wrangler &> /dev/null; then
    print_status "Installing Wrangler CLI globally..."
    npm install -g wrangler
    print_success "Wrangler CLI installed"
else
    print_success "Wrangler CLI is already installed"
fi

# Check if user is logged in to Cloudflare
if ! wrangler whoami &> /dev/null; then
    print_warning "You are not logged in to Cloudflare."
    echo "Please run: wrangler login"
    echo "This will open a browser window to authenticate with Cloudflare."
    read -p "Press Enter to continue with login, or Ctrl+C to skip..."
    wrangler login
else
    CLOUDFLARE_USER=$(wrangler whoami 2>/dev/null | head -n1 || echo "Unknown")
    print_success "Logged in to Cloudflare as: $CLOUDFLARE_USER"
fi

# Generate TypeScript types
print_status "Generating TypeScript types..."
wrangler types
print_success "TypeScript types generated"

# Create KV namespaces for development
print_status "Setting up development KV namespaces..."

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
    print_status "Creating development KV namespace: $namespace"
    wrangler kv:namespace create "$namespace" || print_warning "Namespace $namespace might already exist"
done

print_success "Development KV namespaces setup completed"

# Set up development secrets
print_status "Setting up development secrets..."

echo "Setting up JWT_SECRET..."
echo "jwt-secret-for-development-only-change-in-production" | wrangler secret put JWT_SECRET

echo "Setting up ENCRYPTION_KEY..."
echo "encryption-key-for-development-only-change-in-production" | wrangler secret put ENCRYPTION_KEY

echo "Setting up ADMIN_API_KEY..."
echo "admin-api-key-for-development-only-change-in-production" | wrangler secret put ADMIN_API_KEY

print_success "Development secrets configured"

# Create .env.example file
print_status "Creating .env.example file..."
cat > .env.example << EOF
# Klear Karma Backend Environment Variables
# Copy this file to .env and update the values for your environment

# Environment
ENVIRONMENT=development
API_VERSION=v1
CORS_ORIGIN=http://localhost:3000

# Cloudflare Worker Settings
WORKER_NAME=klear-karma-backend
WORKER_SUBDOMAIN=your-subdomain

# Development URLs
DEV_URL=http://localhost:8787
STAGING_URL=https://your-subdomain-staging.workers.dev
PRODUCTION_URL=https://your-subdomain.workers.dev

# Security (Set these via wrangler secret put)
# JWT_SECRET=your-jwt-secret-here
# ENCRYPTION_KEY=your-encryption-key-here
# ADMIN_API_KEY=your-admin-api-key-here

# Rate Limiting
RATE_LIMIT_REQUESTS=100
RATE_LIMIT_WINDOW=3600

# File Upload Limits
MAX_FILE_SIZE=10485760  # 10MB
ALLOWED_FILE_TYPES=image/jpeg,image/png,image/webp,application/pdf

# Pagination
DEFAULT_PAGE_SIZE=20
MAX_PAGE_SIZE=100

# Session Settings
SESSION_DURATION=86400  # 24 hours
REFRESH_TOKEN_DURATION=604800  # 7 days
EOF

print_success ".env.example file created"

# Create development configuration
print_status "Creating development configuration..."
cat > wrangler.dev.toml << EOF
# Development-specific Wrangler configuration
# This file extends the main wrangler.jsonc for development

[env.development]
name = "klear-karma-backend-dev"
compatibility_date = "2024-01-15"
compatibility_flags = ["nodejs_compat"]

[env.development.vars]
ENVIRONMENT = "development"
API_VERSION = "v1"
CORS_ORIGIN = "http://localhost:3000"

# Development-specific settings
[env.development.observability]
headSampling = 0.1  # Lower sampling for development
EOF

print_success "Development configuration created"

echo ""
print_success "Development environment setup completed! 🎉"
echo "======================================================="
echo "📋 Next Steps:"
echo ""
echo "1. Start the development server:"
echo "   npm run dev"
echo ""
echo "2. Test the API health endpoint:"
echo "   curl http://localhost:8787/health"
echo ""
echo "3. Populate mock data (optional):"
echo "   npm run populate-data"
echo ""
echo "4. View logs in another terminal:"
echo "   npm run logs"
echo ""
echo "5. Deploy to staging when ready:"
echo "   ./scripts/deploy.sh staging"
echo ""
echo "📚 Useful Commands:"
echo "   npm run dev          - Start development server"
echo "   npm run test:api     - Test API health"
echo "   npm run populate-data - Add mock data"
echo "   npm run logs         - View real-time logs"
echo "   npm run deploy       - Deploy to production"
echo ""
print_success "Happy coding! 🚀"