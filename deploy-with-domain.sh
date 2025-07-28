#!/bin/bash

# Klear Karma Backend - Domain Deployment Script
# This script helps deploy the backend with custom domain configuration

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
DOMAIN="klearkarma.life"
PROJECT_DIR="/Users/sheshnarayaniyer/2025/klear-karma-backend/klear-karma-backend"

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

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Function to check prerequisites
check_prerequisites() {
    print_status "Checking prerequisites..."
    
    if ! command_exists "wrangler"; then
        print_error "Wrangler CLI not found. Please install it first."
        echo "npm install -g wrangler"
        exit 1
    fi
    
    if ! command_exists "curl"; then
        print_error "curl not found. Please install it first."
        exit 1
    fi
    
    # Check if logged into Cloudflare
    if ! wrangler whoami >/dev/null 2>&1; then
        print_error "Not logged into Cloudflare. Please run 'wrangler login' first."
        exit 1
    fi
    
    print_success "Prerequisites check passed"
}

# Function to validate wrangler.toml configuration
validate_config() {
    print_status "Validating wrangler.toml configuration..."
    
    if [ ! -f "$PROJECT_DIR/wrangler.toml" ]; then
        print_error "wrangler.toml not found in $PROJECT_DIR"
        exit 1
    fi
    
    # Check if domain routes are configured
    if ! grep -q "klearkarma.life" "$PROJECT_DIR/wrangler.toml"; then
        print_error "Domain routes not configured in wrangler.toml"
        print_warning "Please run the domain configuration script first"
        exit 1
    fi
    
    print_success "Configuration validation passed"
}

# Function to check DNS resolution
check_dns() {
    local subdomain=$1
    print_status "Checking DNS resolution for $subdomain..."
    
    if nslookup "$subdomain" >/dev/null 2>&1; then
        print_success "DNS resolution working for $subdomain"
        return 0
    else
        print_warning "DNS not yet resolved for $subdomain"
        return 1
    fi
}

# Function to deploy to specific environment
deploy_environment() {
    local env=$1
    local subdomain=$2
    
    print_status "Deploying to $env environment ($subdomain)..."
    
    cd "$PROJECT_DIR"
    
    # Deploy the worker
    if wrangler deploy --env "$env"; then
        print_success "Successfully deployed to $env environment"
        
        # Wait a moment for deployment to propagate
        sleep 5
        
        # Test the deployment
        test_deployment "$subdomain" "$env"
    else
        print_error "Failed to deploy to $env environment"
        return 1
    fi
}

# Function to test deployment
test_deployment() {
    local subdomain=$1
    local env=$2
    
    print_status "Testing deployment on $subdomain..."
    
    # Test health endpoint
    local health_url="https://$subdomain/health"
    
    if curl -s --max-time 10 "$health_url" >/dev/null 2>&1; then
        print_success "Health check passed for $subdomain"
        
        # Get and display response
        local response=$(curl -s "$health_url")
        echo "Response: $response"
    else
        print_warning "Health check failed for $subdomain (this is normal if DNS hasn't propagated yet)"
        
        # Try the workers.dev URL as fallback
        local fallback_url="https://api.klearkarma.life/health"
        if curl -s --max-time 10 "$fallback_url" >/dev/null 2>&1; then
            print_success "Fallback URL working: $fallback_url"
        else
            print_error "Both custom domain and fallback URL failed"
        fi
    fi
}

# Function to display post-deployment instructions
show_instructions() {
    print_success "Deployment completed!"
    echo ""
    echo "=== Next Steps ==="
    echo ""
    echo "1. DNS Configuration (if not done yet):"
    echo "   - Add $DOMAIN to your Cloudflare dashboard"
    echo "   - Configure DNS records as per cloudflare-dns-setup.md"
    echo "   - Update nameservers at your domain registrar"
    echo ""
    echo "2. Test Endpoints:"
    echo "   Production:  https://api.$DOMAIN/health"
    echo "   Staging:     https://staging-api.$DOMAIN/health"
    echo "   Development: https://dev-api.$DOMAIN/health"
    echo ""
    echo "3. Monitor Deployment:"
    echo "   wrangler tail --format pretty"
    echo "   wrangler deployments list"
    echo ""
    echo "4. Update Frontend Configuration:"
    echo "   Update API base URLs in your frontend applications"
    echo ""
    print_warning "Note: DNS propagation can take up to 48 hours"
}

# Main deployment function
main() {
    echo "=== Klear Karma Backend Domain Deployment ==="
    echo ""
    
    # Check prerequisites
    check_prerequisites
    
    # Validate configuration
    validate_config
    
    # Ask user which environments to deploy
    echo "Which environments would you like to deploy?"
    echo "1) Development only"
    echo "2) Staging only"
    echo "3) Production only"
    echo "4) All environments"
    echo "5) Custom selection"
    read -p "Enter your choice (1-5): " choice
    
    case $choice in
        1)
            deploy_environment "development" "dev-api.$DOMAIN"
            ;;
        2)
            deploy_environment "staging" "staging-api.$DOMAIN"
            ;;
        3)
            deploy_environment "production" "api.$DOMAIN"
            ;;
        4)
            deploy_environment "development" "dev-api.$DOMAIN"
            deploy_environment "staging" "staging-api.$DOMAIN"
            deploy_environment "production" "api.$DOMAIN"
            ;;
        5)
            echo "Select environments to deploy:"
            read -p "Deploy development? (y/n): " deploy_dev
            read -p "Deploy staging? (y/n): " deploy_staging
            read -p "Deploy production? (y/n): " deploy_prod
            
            [[ $deploy_dev =~ ^[Yy]$ ]] && deploy_environment "development" "dev-api.$DOMAIN"
            [[ $deploy_staging =~ ^[Yy]$ ]] && deploy_environment "staging" "staging-api.$DOMAIN"
            [[ $deploy_prod =~ ^[Yy]$ ]] && deploy_environment "production" "api.$DOMAIN"
            ;;
        *)
            print_error "Invalid choice"
            exit 1
            ;;
    esac
    
    # Show post-deployment instructions
    show_instructions
}

# Run main function
main "$@"