#!/usr/bin/env bash
# Start EMR local development environment
# This starts the full Docker stack with backend, frontend, database, and services

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${BLUE}Starting EMR Local Development Environment${NC}"
echo ""

# Check if Docker is running
if ! docker info >/dev/null 2>&1; then
    echo -e "${YELLOW}Error: Docker is not running. Please start Docker Desktop.${NC}" >&2
    exit 1
fi

echo -e "${BLUE}Starting Docker stack...${NC}"
echo ""

# Start the full stack
"${SCRIPT_DIR}/start-stack.sh" local "$@"

echo ""
echo -e "${GREEN}✓ EMR local environment started successfully!${NC}"
echo ""
echo "Services available at:"
echo "  - Frontend (React): http://localhost:3001"
echo "  - Backend (Django): http://localhost:8001"
echo "  - API Health Check: http://localhost:8001/api/health/"
echo "  - Database (PostgreSQL): localhost:5435"
echo "  - Redis: localhost:6382"
echo ""
echo "To stop the environment:"
echo "  ./scripts/stop-local.sh"
echo ""
echo "To view logs:"
echo "  docker-compose -f docker-compose.local.yml logs -f"

