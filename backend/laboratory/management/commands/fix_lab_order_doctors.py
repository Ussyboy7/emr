"""
Management command to fix missing doctor assignments in existing lab orders.
"""

from django.core.management.base import BaseCommand
from laboratory.models import LabOrder
from accounts.models import User


class Command(BaseCommand):
    help = 'Fix missing doctor assignments in existing lab orders'

    def handle(self, *args, **options):
        self.stdout.write('Fixing missing doctor assignments in lab orders...')

        orders_without_doctors = LabOrder.objects.filter(doctor__isnull=True)
        fixed_count = 0

        for order in orders_without_doctors:
            doctor = self._find_doctor_for_order(order)
            if doctor:
                order.doctor = doctor
                order.save(update_fields=['doctor'])
                fixed_count += 1
                self.stdout.write(
                    f'  Fixed {order.order_id}: assigned doctor {doctor.get_full_name()}'
                )
            else:
                self.stdout.write(
                    self.style.WARNING(f'  Could not find doctor for {order.order_id}')
                )

        self.stdout.write(
            self.style.SUCCESS(f'Successfully fixed {fixed_count} lab orders')
        )

    def _find_doctor_for_order(self, order):
        """Find appropriate doctor for lab order using multiple strategies."""

        # Strategy 1: Check if consultation session exists and has a doctor
        if order.consultation_session and order.consultation_session.doctor:
            return order.consultation_session.doctor

        # Strategy 2: Check if visit exists and has a doctor assigned
        if order.visit and hasattr(order.visit, 'doctor') and order.visit.doctor:
            return order.visit.doctor

        # Strategy 3: Check if the created_by user is a doctor
        if order.created_by and hasattr(order.created_by, 'system_role') and order.created_by.system_role == 'Medical Doctor':
            return order.created_by

        # Strategy 4: Find any available doctor as last resort
        try:
            doctor = User.objects.filter(system_role='Medical Doctor').first()
            if doctor:
                return doctor
        except:
            pass

        return None
