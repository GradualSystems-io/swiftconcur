#!/bin/bash

# SwiftConcur API Deployment Script
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
ENVIRONMENT=${1:-development}
PROJECT_NAME="swiftconcur-api"

echo -e "${GREEN}🚀 Deploying SwiftConcur API to ${ENVIRONMENT}${NC}"

# Validate environment
if [[ "$ENVIRONMENT" != "development" && "$ENVIRONMENT" != "production" ]]; then
    echo -e "${RED}❌ Invalid environment. Use 'development' or 'production'${NC}"
    exit 1
fi

# Check dependencies
echo -e "${YELLOW}📋 Checking dependencies...${NC}"

if ! command -v wrangler &> /dev/null; then
    echo -e "${RED}❌ Wrangler CLI not found. Install with: npm install -g wrangler${NC}"
    exit 1
fi

if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js not found${NC}"
    exit 1
fi

# Check Node version
NODE_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo -e "${RED}❌ Node.js 18+ required. Current version: $(node --version)${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Dependencies check passed${NC}"

# Install packages
echo -e "${YELLOW}📦 Installing packages...${NC}"
npm ci

# Run tests
echo -e "${YELLOW}🧪 Running tests...${NC}"
npm run test

# Type check
echo -e "${YELLOW}🔍 Type checking...${NC}"
npm run type-check

# Lint code
echo -e "${YELLOW}🔧 Linting code...${NC}"
npm run lint

echo -e "${GREEN}✅ Pre-deployment checks passed${NC}"

# Deploy based on environment
if [ "$ENVIRONMENT" = "production" ]; then
    echo -e "${YELLOW}🌍 Deploying to production...${NC}"
    
    # Prompt for confirmation
    echo -e "${RED}⚠️  You are about to deploy to PRODUCTION${NC}"
    read -p "Are you sure? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo -e "${YELLOW}❌ Deployment cancelled${NC}"
        exit 1
    fi
    
    # Production deployment
    wrangler deploy --env production
    
    echo -e "${GREEN}✅ Production deployment completed${NC}"
    echo -e "${YELLOW}🔗 Production URL: https://${PROJECT_NAME}.workers.dev${NC}"
    
else
    echo -e "${YELLOW}🛠️  Deploying to development...${NC}"
    
    # Development deployment
    wrangler deploy --env development
    
    echo -e "${GREEN}✅ Development deployment completed${NC}"
    echo -e "${YELLOW}🔗 Development URL: https://${PROJECT_NAME}-dev.workers.dev${NC}"
fi

# Post-deployment health check
echo -e "${YELLOW}🏥 Running health check...${NC}"

if [ "$ENVIRONMENT" = "production" ]; then
    HEALTH_URL="https://${PROJECT_NAME}.workers.dev/health"
else
    HEALTH_URL="https://${PROJECT_NAME}-dev.workers.dev/health"
fi

# Wait a moment for deployment to propagate
sleep 5

HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$HEALTH_URL" || echo "000")

if [ "$HTTP_STATUS" = "200" ]; then
    echo -e "${GREEN}✅ Health check passed${NC}"
else
    echo -e "${RED}❌ Health check failed (HTTP $HTTP_STATUS)${NC}"
    echo -e "${YELLOW}💡 Check logs with: wrangler tail --env $ENVIRONMENT${NC}"
    exit 1
fi

# Display next steps
echo -e "${GREEN}🎉 Deployment completed successfully!${NC}"
echo -e "${YELLOW}Next steps:${NC}"
echo "1. Test API endpoints with your client"
echo "2. Monitor logs: wrangler tail --env $ENVIRONMENT"
echo "3. Check metrics in Cloudflare dashboard"

if [ "$ENVIRONMENT" = "production" ]; then
    echo "4. Update DNS/CDN if needed"
    echo "5. Notify team of deployment"
fi

echo -e "${GREEN}🚀 Happy coding!${NC}"