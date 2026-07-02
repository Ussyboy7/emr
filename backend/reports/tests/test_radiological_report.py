"""Tests for radiological services report aggregation."""
from datetime import date
from unittest.mock import MagicMock

from django.test import SimpleTestCase

from reports.radiological_report import _study_location, _study_modality


class RadiologicalReportHelpersTest(SimpleTestCase):
    def test_modality_renames_other_template_label(self):
        study = MagicMock()
        study.modality = "See clinical notes"
        study.procedure = "Other"
        self.assertEqual(_study_modality(study), "Other (see clinical notes)")

    def test_modality_keeps_renamed_other_label(self):
        study = MagicMock()
        study.modality = "Other (see clinical notes)"
        study.procedure = "Other"
        self.assertEqual(_study_modality(study), "Other (see clinical notes)")

    def test_modality_uses_study_modality_not_procedure(self):
        study = MagicMock()
        study.modality = "CT Scan"
        study.procedure = "CT HEAD WITHOUT CONTRAST"
        self.assertEqual(_study_modality(study), "CT Scan")

    def test_location_falls_back_to_processing_clinic(self):
        study = MagicMock()
        study.order = MagicMock()
        study.order.location_clinic = None
        study.order.consultation_session = None
        study.order.visit = None
        study.order.processing_clinic = MagicMock(name="Tincan Island Port Clinic")
        study.order.processing_clinic.name = "Tincan Island Port Clinic"
        study.order.clinic = ""
        self.assertEqual(_study_location(study), "Tincan Island Port Clinic")

    def test_location_unspecified_when_no_clinic_data(self):
        study = MagicMock()
        study.order = MagicMock()
        study.order.location_clinic = None
        study.order.consultation_session = None
        study.order.visit = None
        study.order.processing_clinic = None
        study.order.clinic = ""
        self.assertEqual(_study_location(study), "Unspecified")
