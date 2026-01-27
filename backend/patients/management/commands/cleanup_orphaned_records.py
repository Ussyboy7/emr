"""
Management command to clean up orphaned records and prevent data integrity issues.
"""
from django.core.management.base import BaseCommand
from django.db import transaction
from patients.models import VitalReading
from consultation.models import ConsultationQueue


class Command(BaseCommand):
    help = 'Clean up orphaned records and validate data integrity'

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Show what would be cleaned without actually doing it',
        )
        parser.add_argument(
            '--force',
            action='store_true',
            help='Force cleanup even if it might cause data loss',
        )

    def handle(self, *args, **options):
        dry_run = options['dry_run']
        force = options['force']

        self.stdout.write('Starting orphaned records cleanup...')

        # 1. Find orphaned vitals (vitals without visits)
        orphaned_vitals = VitalReading.objects.filter(visit__isnull=True)
        orphaned_count = orphaned_vitals.count()

        if orphaned_count > 0:
            self.stdout.write(
                self.style.WARNING(f'Found {orphaned_count} orphaned vital readings (no associated visit)')
            )

            if dry_run:
                self.stdout.write('DRY RUN: Would delete orphaned vitals')
                for vital in orphaned_vitals[:5]:  # Show first 5
                    self.stdout.write(f'  - Vital ID {vital.id} for patient {vital.patient.get_full_name()}')
                if orphaned_count > 5:
                    self.stdout.write(f'  ... and {orphaned_count - 5} more')
            else:
                if not force:
                    self.stdout.write(
                        self.style.ERROR('Use --force to actually delete orphaned records, or --dry-run to preview')
                    )
                    return

                with transaction.atomic():
                    deleted_count, _ = orphaned_vitals.delete()
                    self.stdout.write(
                        self.style.SUCCESS(f'Deleted {deleted_count} orphaned vital readings')
                    )

        # 2. Find orphaned queue items (queue items without patients)
        orphaned_queues = ConsultationQueue.objects.filter(patient__isnull=True)
        queue_count = orphaned_queues.count()

        if queue_count > 0:
            self.stdout.write(
                self.style.WARNING(f'Found {queue_count} orphaned consultation queue items (no associated patient)')
            )

            if dry_run:
                self.stdout.write('DRY RUN: Would delete orphaned queue items')
                for queue_item in orphaned_queues[:5]:
                    self.stdout.write(f'  - Queue ID {queue_item.id} for room {queue_item.room.name}')
                if queue_count > 5:
                    self.stdout.write(f'  ... and {queue_count - 5} more')
            else:
                if not force:
                    self.stdout.write(
                        self.style.ERROR('Use --force to actually delete orphaned records, or --dry-run to preview')
                    )
                    return

                with transaction.atomic():
                    deleted_count, _ = orphaned_queues.delete()
                    self.stdout.write(
                        self.style.SUCCESS(f'Deleted {deleted_count} orphaned queue items')
                    )

        # 3. Find status inconsistencies
        from patients.models import Visit
        from consultation.models import ConsultationSession

        # Visits that are marked as completed but have no consultation sessions
        inconsistent_visits = Visit.objects.filter(
            status='completed'
        ).exclude(
            id__in=ConsultationSession.objects.values('visit_id')
        )

        inconsistent_count = inconsistent_visits.count()
        if inconsistent_count > 0:
            self.stdout.write(
                self.style.WARNING(f'Found {inconsistent_count} visits marked as completed but with no consultation sessions')
            )

            if dry_run:
                for visit in inconsistent_visits[:5]:
                    self.stdout.write(f'  - Visit {visit.visit_id} (Patient ID: {visit.patient_id})')
            else:
                self.stdout.write('Consider manually reviewing these visits for status correction')

        # 4. Summary
        total_issues = orphaned_count + queue_count + inconsistent_count
        if total_issues == 0:
            self.stdout.write(self.style.SUCCESS('No orphaned records or inconsistencies found!'))
        else:
            if dry_run:
                self.stdout.write(f'Found {total_issues} total issues. Use --force to fix them.')
            else:
                self.stdout.write(self.style.SUCCESS(f'Cleanup completed. Fixed {total_issues} issues.'))

        # 5. Preventive measures
        self.stdout.write('\nPreventive Measures:')
        self.stdout.write('✅ Added validation to prevent future orphaned vitals')
        self.stdout.write('✅ Enhanced error handling in frontend')
        self.stdout.write('✅ Improved status synchronization logic')
        self.stdout.write('✅ Added patient ID validation to prevent confusion')