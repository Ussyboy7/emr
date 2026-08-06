"""
Audit and repair nursing procedure data integrity issues.

- Procedures linked to a nursing order but saved under the wrong patient
- Nursing orders missing location_clinic (multi-clinic visibility)
- Completed nursing orders missing completed_at
- Procedure rows missing structured medication fields (parsed from description)
"""
from __future__ import annotations

import re

from django.core.management.base import BaseCommand
from django.db.models import Q
from django.utils import timezone

from nursing.models import NursingOrder, Procedure


def _parse_injection_fields(description: str) -> dict[str, str]:
    text = (description or '').strip()
    if not text:
        return {}
    body = re.sub(r'^(Injection|Medication):\s*', '', text, flags=re.I).strip()
    hy = body.find(' - ')
    if hy > 0 and re.search(r'\bvia\b', body, re.I):
        med = body[:hy].strip()
        after = body[hy + 3 :]
        parts = re.split(r'\bvia\b', after, maxsplit=1, flags=re.I)
        dose = (parts[0] or '').replace('Dose:', '').strip().rstrip('.,')
        route = (parts[1] or '').strip().rstrip('.,').split('.')[0] if len(parts) > 1 else ''
        if med and med.lower() not in ('injection', 'medication'):
            return {'medication_name': med[:200], 'dosage': dose[:200], 'route': route[:100]}
    match = re.match(r'^([^:]+):\s*(.+)$', body)
    if match and match.group(1).strip().lower() not in ('injection', 'medication'):
        rest = match.group(2).strip()
        parts = [p.strip() for p in rest.split('•')]
        med = parts[0].replace('Dose:', '').strip() if parts else ''
        dose = ''
        route = ''
        for part in parts:
            if part.lower().startswith('dose:'):
                dose = part.split(':', 1)[1].strip()
            elif part.lower().startswith('route:'):
                route = part.split(':', 1)[1].strip()
        if med:
            return {
                'medication_name': med[:200],
                'dosage': (dose or parts[0] if parts else '')[:200],
                'route': route[:100],
            }
    return {}


def _parse_dressing_wound_type(description: str) -> str:
    text = (description or '').strip()
    if not text:
        return ''
    body = re.sub(r'^Dressing:\s*', '', text, flags=re.I).strip()
    at = re.match(r'^(.+?)\s+dressing\s+at\s+', body, re.I)
    if at:
        return at.group(1).strip()[:200]
    parts = [p.strip() for p in body.split('•') if p.strip()]
    if parts and not parts[0].lower().startswith('location:'):
        return parts[0][:200]
    return ''


class Command(BaseCommand):
    help = 'Audit/repair procedure patient mismatches, clinic backfill, and structured fields.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--apply',
            action='store_true',
            help='Apply fixes (default is dry-run report only).',
        )

    def handle(self, *args, **options):
        apply = bool(options['apply'])
        mode = 'APPLY' if apply else 'DRY-RUN'
        self.stdout.write(self.style.NOTICE(f'[{mode}] Nursing procedure repair\n'))

        self._repair_patient_mismatches(apply)
        self._backfill_order_clinics(apply)
        self._backfill_completed_at(apply)
        self._backfill_structured_fields(apply)

    def _repair_patient_mismatches(self, apply: bool) -> None:
        qs = Procedure.objects.filter(nursing_order__isnull=False).select_related(
            'patient', 'nursing_order', 'nursing_order__patient'
        )
        mismatches = [p for p in qs if p.patient_id != p.nursing_order.patient_id]
        self.stdout.write(f'Patient mismatches (procedure vs nursing order): {len(mismatches)}')
        for proc in mismatches[:50]:
            order = proc.nursing_order
            self.stdout.write(
                f'  PROC {proc.procedure_id} (pk={proc.pk}): '
                f'procedure patient={proc.patient.patient_id} ({proc.patient.get_full_name()}) '
                f'order patient={order.patient.patient_id} ({order.patient.get_full_name()}) '
                f'order={order.order_id}'
            )
        if len(mismatches) > 50:
            self.stdout.write(f'  ... and {len(mismatches) - 50} more')

        if apply and mismatches:
            fixed = 0
            for proc in mismatches:
                correct_id = proc.nursing_order.patient_id
                Procedure.objects.filter(pk=proc.pk).update(patient_id=correct_id)
                fixed += 1
            self.stdout.write(self.style.SUCCESS(f'Fixed {fixed} patient mismatches.'))

    def _backfill_order_clinics(self, apply: bool) -> None:
        qs = NursingOrder.objects.filter(location_clinic__isnull=True).select_related(
            'visit', 'patient', 'ordered_by'
        )
        candidates = []
        for order in qs.iterator(chunk_size=200):
            clinic_id = None
            if order.visit_id and order.visit.location_clinic_id:
                clinic_id = order.visit.location_clinic_id
            elif order.patient_id and order.patient.location_clinic_id:
                clinic_id = order.patient.location_clinic_id
            elif order.ordered_by_id and order.ordered_by.location_clinic_id:
                clinic_id = order.ordered_by.location_clinic_id
            if clinic_id:
                candidates.append((order.pk, clinic_id))

        self.stdout.write(f'Nursing orders missing location_clinic (fixable): {len(candidates)}')
        if apply and candidates:
            for pk, clinic_id in candidates:
                NursingOrder.objects.filter(pk=pk).update(location_clinic_id=clinic_id)
            self.stdout.write(self.style.SUCCESS(f'Backfilled location_clinic on {len(candidates)} orders.'))

    def _backfill_completed_at(self, apply: bool) -> None:
        qs = NursingOrder.objects.filter(status='completed', completed_at__isnull=True)
        count = qs.count()
        self.stdout.write(f'Completed orders missing completed_at: {count}')
        if apply and count:
            updated = 0
            for order in qs.iterator(chunk_size=200):
                proc = (
                    Procedure.objects.filter(nursing_order_id=order.pk)
                    .order_by('-performed_at')
                    .only('performed_at')
                    .first()
                )
                completed_at = proc.performed_at if proc else order.ordered_at or timezone.now()
                NursingOrder.objects.filter(pk=order.pk).update(completed_at=completed_at)
                updated += 1
            self.stdout.write(self.style.SUCCESS(f'Set completed_at on {updated} orders.'))

    def _backfill_structured_fields(self, apply: bool) -> None:
        qs = Procedure.objects.filter(
            Q(medication_name='') | Q(medication_name__isnull=True),
        ).exclude(description='')
        fixable = []
        for proc in qs.iterator(chunk_size=300):
            ptype = (proc.procedure_type or '').lower()
            updates: dict[str, str] = {}
            if ptype == 'injection':
                updates = _parse_injection_fields(proc.description)
            elif ptype in ('dressing', 'wound_care'):
                wound = _parse_dressing_wound_type(proc.description)
                if wound:
                    updates = {'medication_name': wound}
            elif ptype in ('medication', 'other'):
                updates = _parse_injection_fields(proc.description)
            if updates.get('medication_name'):
                fixable.append((proc.pk, updates))

        self.stdout.write(f'Procedures missing medication_name (parseable): {len(fixable)}')
        if apply and fixable:
            for pk, updates in fixable:
                Procedure.objects.filter(pk=pk).update(**updates)
            self.stdout.write(self.style.SUCCESS(f'Backfilled structured fields on {len(fixable)} procedures.'))
