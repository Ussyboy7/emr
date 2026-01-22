#!/bin/bash

# EMR Staging Data Management Script
# Usage: ./scripts/staging-data.sh [backup|restore|seed-safe|seed-reset|status]

set -e

COMPOSE_FILE="docker-compose.stag.yml"

case "$1" in
    "backup")
        echo "📦 Creating backup of staging data..."
        docker-compose -f $COMPOSE_FILE exec backend python manage.py backup_data
        echo "✅ Backup completed. Check ./backups/ directory"
        ;;

    "restore")
        if [ -z "$2" ]; then
            echo "❌ Please specify backup directory: ./scripts/staging-data.sh restore <backup_dir>"
            exit 1
        fi
        echo "🔄 Restoring data from $2..."
        docker-compose -f $COMPOSE_FILE exec backend python manage.py restore_data "$2" --dry-run
        read -p "Continue with restore? (y/N): " confirm
        if [[ $confirm == [yY] || $confirm == [yY][eE][sS] ]]; then
            docker-compose -f $COMPOSE_FILE exec backend python manage.py restore_data "$2"
            echo "✅ Restore completed"
        else
            echo "❌ Restore cancelled"
        fi
        ;;

    "seed-safe")
        echo "🌱 Running safe seed (preserves existing users)..."
        docker-compose -f $COMPOSE_FILE exec backend python manage.py seed_demo_data --preserve-users
        echo "✅ Safe seed completed"
        ;;

    "seed-reset")
        echo "⚠️  WARNING: This will DELETE ALL EXISTING DATA!"
        read -p "Are you sure? Type 'YES' to continue: " confirm
        if [ "$confirm" = "YES" ]; then
            echo "🔄 Running full reset seed..."
            docker-compose -f $COMPOSE_FILE exec backend python manage.py seed_demo_data --reset
            echo "✅ Full reset seed completed"
        else
            echo "❌ Operation cancelled"
        fi
        ;;

    "status")
        echo "📊 Staging Data Status:"
        echo "======================"
        docker-compose -f $COMPOSE_FILE exec backend python manage.py shell -c "
from accounts.models import User
from organization.models import Clinic, Department
from permissions.models import Role, UserRole
print(f'Users: {User.objects.count()}')
print(f'Clinics: {Clinic.objects.count()}')
print(f'Departments: {Department.objects.count()}')
print(f'Roles: {Role.objects.count()}')
print(f'User Roles: {UserRole.objects.count()}')
        "

        echo ""
        echo "📦 Docker Volumes:"
        docker volume ls | grep stag

        echo ""
        echo "💾 Backup Files:"
        ls -la ./backups/ 2>/dev/null || echo "No backups directory found"
        ;;

    "volumes")
        echo "💽 Docker Volume Information:"
        docker system df -v | grep stag
        echo ""
        echo "📍 Volume locations:"
        echo "PostgreSQL: /var/lib/docker/volumes/emr_postgres_data_stag/_data/"
        echo "Redis: /var/lib/docker/volumes/emr_redis_data_stag/_data/"
        ;;

    *)
        echo "EMR Staging Data Management Script"
        echo "==================================="
        echo ""
        echo "Usage: $0 [command]"
        echo ""
        echo "Commands:"
        echo "  backup       - Create backup of current data"
        echo "  restore <dir> - Restore from backup directory"
        echo "  seed-safe    - Run seed data (preserves users)"
        echo "  seed-reset   - Run seed data with full reset (DELETES EVERYTHING)"
        echo "  status       - Show current data status"
        echo "  volumes      - Show volume information"
        echo ""
        echo "Examples:"
        echo "  $0 backup"
        echo "  $0 seed-safe"
        echo "  $0 status"
        ;;
esac