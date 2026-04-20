#!/bin/bash

# URIT 5160 Integration Setup Script
# This script helps set up the URIT 5160 hematology analyzer integration

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$(dirname "$SCRIPT_DIR")")"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."

    # Check if Docker is installed
    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed. Please install Docker first."
        exit 1
    fi

    # Check if Docker Compose is available
    if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
        log_error "Docker Compose is not available. Please install Docker Compose."
        exit 1
    fi

    # Check if Node.js is installed (optional)
    if command -v node &> /dev/null; then
        log_info "Node.js found: $(node --version)"
    else
        log_warning "Node.js not found. Docker will be used for the middleware service."
    fi

    log_success "Prerequisites check completed"
}

# Setup middleware configuration
setup_middleware() {
    log_info "Setting up middleware configuration..."

    local middleware_dir="$SCRIPT_DIR/urit5160"
    local env_file="$middleware_dir/.env"

    if [ ! -f "$env_file" ]; then
        cp "$middleware_dir/.env.example" "$env_file"
        log_success "Created middleware environment file: $env_file"
        log_warning "Please edit $env_file with your EMR API details"
    else
        log_info "Middleware environment file already exists: $env_file"
    fi
}

# Seed hematology templates
seed_templates() {
    log_info "Seeding hematology templates..."

    # Check if we're in the backend directory or can access Django
    if [ -f "$PROJECT_ROOT/backend/manage.py" ]; then
        cd "$PROJECT_ROOT/backend"

        # Check if virtual environment exists and activate it
        if [ -f "venv/bin/activate" ]; then
            source venv/bin/activate
            log_info "Activated Python virtual environment"
        fi

        # Run the seed command
        if python manage.py seed_hematology_templates; then
            log_success "Hematology templates seeded successfully"
        else
            log_error "Failed to seed hematology templates"
            log_info "Make sure your Django settings are configured and database is accessible"
            exit 1
        fi
    else
        log_warning "Django manage.py not found. Please run the seed command manually:"
        echo "cd backend && python manage.py seed_hematology_templates"
    fi
}

# Start middleware service
start_middleware() {
    log_info "Starting middleware service..."

    local middleware_dir="$SCRIPT_DIR/urit5160"

    cd "$middleware_dir"

    # Check if .env file exists and has required values
    if [ ! -f ".env" ]; then
        log_error "Middleware environment file not found. Please run setup first."
        exit 1
    fi

    # Check for required environment variables
    if ! grep -q "EMR_API_KEY=" .env || grep -q "EMR_API_KEY=your-emr-api-key-here" .env; then
        log_warning "EMR_API_KEY not configured in .env file"
        log_info "Please edit .env file with your actual EMR API key"
    fi

    # Start the service
    if command -v docker-compose &> /dev/null; then
        docker-compose up -d
        log_success "Middleware service started with Docker Compose"
    elif docker compose version &> /dev/null; then
        docker compose up -d
        log_success "Middleware service started with Docker Compose v2"
    else
        log_error "Docker Compose not available"
        exit 1
    fi

    # Wait a moment for service to start
    sleep 3

    # Check if service is running
    if docker-compose ps | grep -q "urit5160-middleware"; then
        log_success "Middleware service is running"
        log_info "Service URL: http://localhost:2575"
        log_info "View logs: docker-compose logs -f"
    else
        log_error "Middleware service failed to start"
        log_info "Check logs: docker-compose logs"
        exit 1
    fi
}

# Test the integration
test_integration() {
    log_info "Testing integration..."

    local test_script="$SCRIPT_DIR/urit5160/test-integration.js"

    if [ ! -f "$test_script" ]; then
        log_error "Test script not found: $test_script"
        return 1
    fi

    # Run the test
    if node "$test_script" --all; then
        log_success "Integration test completed successfully"
        log_info "Check middleware logs and EMR for test results"
    else
        log_error "Integration test failed"
        log_info "Check middleware logs: docker-compose logs -f middleware"
        return 1
    fi
}

# Show status
show_status() {
    log_info "Integration Status:"
    echo ""

    # Check middleware service
    if docker-compose ps 2>/dev/null | grep -q "urit5160-middleware"; then
        echo -e "${GREEN}✓${NC} Middleware service: Running"
    else
        echo -e "${RED}✗${NC} Middleware service: Not running"
    fi

    # Check configuration
    if [ -f "$SCRIPT_DIR/urit5160/.env" ]; then
        echo -e "${GREEN}✓${NC} Middleware configuration: Present"
    else
        echo -e "${RED}✗${NC} Middleware configuration: Missing"
    fi

    # Check network connectivity
    if nc -z localhost 2575 2>/dev/null; then
        echo -e "${GREEN}✓${NC} HL7 port (2575): Open"
    else
        echo -e "${RED}✗${NC} HL7 port (2575): Closed"
    fi

    echo ""
    log_info "Next steps:"
    echo "1. Configure URIT 5160 analyzer (see URIT5160_SETUP_GUIDE.md)"
    echo "2. Test with real analyzer data"
    echo "3. Monitor logs and performance"
    echo "4. Set up alerts for critical values"
}

# Main menu
show_menu() {
    echo "URIT 5160 Integration Setup"
    echo "==========================="
    echo ""
    echo "Available options:"
    echo "1) Check prerequisites"
    echo "2) Setup middleware configuration"
    echo "3) Seed hematology templates"
    echo "4) Start middleware service"
    echo "5) Test integration"
    echo "6) Show status"
    echo "7) Run complete setup"
    echo "8) Exit"
    echo ""
}

# Complete setup
complete_setup() {
    log_info "Running complete URIT 5160 integration setup..."

    check_prerequisites
    setup_middleware
    seed_templates
    start_middleware
    test_integration

    log_success "Complete setup finished!"
    echo ""
    show_status
}

# Main script logic
case "${1:-}" in
    "check")
        check_prerequisites
        ;;
    "setup")
        setup_middleware
        ;;
    "seed")
        seed_templates
        ;;
    "start")
        start_middleware
        ;;
    "test")
        test_integration
        ;;
    "status")
        show_status
        ;;
    "complete")
        complete_setup
        ;;
    *)
        show_menu

        if [ -n "$1" ]; then
            echo "Invalid option: $1"
            exit 1
        fi

        # Interactive mode
        while true; do
            read -p "Select option (1-8): " choice
            case $choice in
                1)
                    check_prerequisites
                    ;;
                2)
                    setup_middleware
                    ;;
                3)
                    seed_templates
                    ;;
                4)
                    start_middleware
                    ;;
                5)
                    test_integration
                    ;;
                6)
                    show_status
                    ;;
                7)
                    complete_setup
                    ;;
                8)
                    log_info "Goodbye!"
                    exit 0
                    ;;
                *)
                    log_error "Invalid option. Please select 1-8."
                    ;;
            esac
            echo ""
        done
        ;;
esac