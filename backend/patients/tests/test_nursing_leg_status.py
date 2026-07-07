"""Tests for multi-clinic nursing leg status helpers."""
from django.test import TestCase

from common.tests.support import create_test_patient_visit
from patients.nursing_leg_status import (
    apply_visit_completion_after_leg,
    consultation_leg_state,
    mark_consultation_session_clinic_completed,
    mark_visit_clinic_completed,
    order_leg_state,
    visit_should_close_after_clinic_completion,
)
from consultation.models import ConsultationRoom, ConsultationSession


class NursingLegStatusTest(TestCase):
    def test_order_leg_state_mapping(self):
        self.assertEqual(order_leg_state('scheduled'), 'routed')
        self.assertEqual(order_leg_state('in_progress'), 'in_progress')
        self.assertEqual(order_leg_state('completed'), 'completed')

    def test_consultation_leg_state_completed_from_completed_clinics(self):
        state = consultation_leg_state(
            visit_clinics=['GOPD', 'Physiotherapy'],
            completed_clinics=['GOPD'],
            has_active_queue=False,
            has_open_session=False,
        )
        self.assertEqual(state, 'completed')

    def test_multi_clinic_visit_stays_open_until_all_clinics_done(self):
        patient, visit = create_test_patient_visit(patient_id='LEG-PT-01')
        visit.clinics = ['GOPD', 'Physiotherapy']
        visit.completed_clinics = []
        visit.status = 'in_progress'
        visit.save()

        mark_visit_clinic_completed(visit, 'GOPD')
        self.assertFalse(visit_should_close_after_clinic_completion(visit))
        changed = apply_visit_completion_after_leg(visit)
        self.assertFalse(changed)
        self.assertEqual(visit.status, 'in_progress')

        mark_visit_clinic_completed(visit, 'Physiotherapy')
        self.assertTrue(visit_should_close_after_clinic_completion(visit))
        changed = apply_visit_completion_after_leg(visit)
        self.assertTrue(changed)
        self.assertEqual(visit.status, 'completed')

    def test_mark_consultation_session_clinic_completed(self):
        patient, visit = create_test_patient_visit(patient_id='LEG-PT-02')
        visit.clinics = ['GOPD', 'Physiotherapy']
        visit.save()
        room = ConsultationRoom.objects.create(name='AGM', room_number='AGM1')
        session = ConsultationSession.objects.create(
            room=room,
            patient=patient,
            visit=visit,
            status='active',
        )
        marked = mark_consultation_session_clinic_completed(visit, session)
        self.assertTrue(marked)
        self.assertIn('GOPD', visit.completed_clinics)
