"""
Django management command to optimize database indexes for better performance.
This command adds missing indexes on frequently queried fields.
"""
from django.core.management.base import BaseCommand
from django.db import connection


class Command(BaseCommand):
    help = 'Optimize database indexes for better query performance'

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Show what indexes would be added without executing',
        )

    def handle(self, *args, **options):
        dry_run = options['dry_run']

        self.stdout.write(
            self.style.SUCCESS('🔍 Analyzing database indexes...')
        )

        # Index recommendations based on common query patterns
        index_recommendations = [
            # Consultation sessions - frequently queried by room and date
            {
                'table': 'consultation_sessions',
                'fields': ['room', 'status'],
                'name': 'consultation_sessions_room_status_idx'
            },
            {
                'table': 'consultation_sessions',
                'fields': ['patient', '-started_at'],
                'name': 'consultation_sessions_patient_started_idx'
            },
            {
                'table': 'consultation_sessions',
                'fields': ['doctor', '-started_at'],
                'name': 'consultation_sessions_doctor_started_idx'
            },

            # Consultation queue - frequently filtered by room and active status
            {
                'table': 'consultation_queue',
                'fields': ['room', 'is_active'],
                'name': 'consultation_queue_room_active_idx'
            },
            {
                'table': 'consultation_queue',
                'fields': ['priority', 'queued_at'],
                'name': 'consultation_queue_priority_queued_idx'
            },

            # Lab tests - frequently queried by status and order
            {
                'table': 'lab_tests',
                'fields': ['order', 'status'],
                'name': 'lab_tests_order_status_idx'
            },
            {
                'table': 'lab_tests',
                'fields': ['status', 'updated_at'],
                'name': 'lab_tests_status_updated_idx'
            },
            {
                'table': 'lab_tests',
                'fields': ['template', 'status'],
                'name': 'lab_tests_template_status_idx'
            },

            # Radiology orders - status and priority queries
            {
                'table': 'radiology_orders',
                'fields': ['status', 'priority'],
                'name': 'radiology_orders_status_priority_idx'
            },
            {
                'table': 'radiology_orders',
                'fields': ['patient', '-ordered_at'],
                'name': 'radiology_orders_patient_ordered_idx'
            },

            # Pharmacy prescriptions - status and patient queries
            {
                'table': 'prescriptions',
                'fields': ['patient', 'status'],
                'name': 'prescriptions_patient_status_idx'
            },
            {
                'table': 'prescriptions',
                'fields': ['status', '-prescribed_at'],
                'name': 'prescriptions_status_prescribed_idx'
            },

            # Audit logs - frequently queried by timestamp and user
            {
                'table': 'audit_logs',
                'fields': ['-timestamp', 'user'],
                'name': 'audit_logs_timestamp_user_idx'
            },
            {
                'table': 'audit_logs',
                'fields': ['action', '-timestamp'],
                'name': 'audit_logs_action_timestamp_idx'
            },

            # Wards - frequently queried by status and capacity
            {
                'table': 'wards',
                'fields': ['status', 'capacity'],
                'name': 'wards_status_capacity_idx'
            },
        ]

        with connection.cursor() as cursor:
            for rec in index_recommendations:
                table = rec['table']
                fields = rec['fields']
                index_name = rec['name']

                # Check if index already exists
                cursor.execute("""
                    SELECT 1 FROM pg_indexes
                    WHERE tablename = %s AND indexname = %s
                """, [table, index_name])

                if cursor.fetchone():
                    self.stdout.write(
                        self.style.WARNING(f'⚠️  Index {index_name} already exists on {table}')
                    )
                    continue

                # Build CREATE INDEX SQL
                field_str = ', '.join(f'"{f}"' if not f.startswith('-') else f'"{f[1:]}" DESC'
                                    for f in fields)
                sql = f'CREATE INDEX CONCURRENTLY "{index_name}" ON "{table}" ({field_str})'

                if dry_run:
                    self.stdout.write(
                        self.style.SUCCESS(f'📋 Would create: {sql}')
                    )
                else:
                    try:
                        cursor.execute(sql)
                        self.stdout.write(
                            self.style.SUCCESS(f'✅ Created index: {index_name} on {table}')
                        )
                    except Exception as e:
                        self.stdout.write(
                            self.style.ERROR(f'❌ Failed to create index {index_name}: {e}')
                        )

        if dry_run:
            self.stdout.write(
                self.style.INFO('\n🔍 This was a dry run. Use without --dry-run to apply changes.')
            )
        else:
            self.stdout.write(
                self.style.SUCCESS('\n🎉 Database index optimization complete!')
            )

        # Provide performance recommendations
        self.stdout.write(
            self.style.INFO('\n💡 Performance Recommendations:')
        )
        self.stdout.write('   • Monitor slow queries with EXPLAIN ANALYZE')
        self.stdout.write('   • Consider partitioning large tables by date')
        self.stdout.write('   • Review and adjust PostgreSQL configuration')
        self.stdout.write('   • Set up database connection pooling')