"""
Serializers for the Laboratory app.
"""
from rest_framework import serializers
import re
from .models import LabTemplate, LabPartner, LabOrder, LabTest, LabTestResultAttachment, LabResult


OTHER_TEMPLATE_CODES = {'OTHER', 'OTHERS'}

TEST_NAME_ALIASES = {
    'lft': 'liver function test',
    'lf t': 'liver function test',
    'fbc': 'full blood count',
    'cbc': 'full blood count',
    'rft': 'renal function test',
    'uecr': 'urea electrolytes creatinine',
    'u e cr': 'urea electrolytes creatinine',
}


def _normalize_test_name(value):
    normalized = re.sub(r'[^a-z0-9]+', ' ', str(value or '').lower()).strip()
    return TEST_NAME_ALIASES.get(normalized, normalized)


def _split_requested_other_tests(notes):
    if not notes:
        return []
    cleaned = re.sub(r'\b(and|&)\b', ',', str(notes), flags=re.IGNORECASE)
    parts = re.split(r'[,;\n]+', cleaned)
    result = []
    for part in parts:
        name = part.strip(" \t\r\n.-:•")
        if name:
            result.append(name)
    return result


class LabPartnerSerializer(serializers.ModelSerializer):
    """External lab partners for outsourced test processing."""

    class Meta:
        model = LabPartner
        fields = [
            "id",
            "name",
            "code",
            "phone",
            "email",
            "notes",
            "is_active",
            "sort_order",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["created_at", "updated_at"]


class LabTemplateSerializer(serializers.ModelSerializer):
    """Serializer for LabTemplate model."""
    
    class Meta:
        model = LabTemplate
        fields = '__all__'
        read_only_fields = ['created_at', 'updated_at']


class LabTestResultAttachmentSerializer(serializers.ModelSerializer):
    uploaded_by_name = serializers.SerializerMethodField()

    def get_uploaded_by_name(self, obj):
        if not obj.uploaded_by:
            return None
        try:
            return obj.uploaded_by.get_full_name()
        except (AttributeError, TypeError):
            return str(obj.uploaded_by)

    class Meta:
        model = LabTestResultAttachment
        fields = ['id', 'test', 'row_id', 'row_name', 'file', 'uploaded_by', 'uploaded_by_name', 'uploaded_at']
        read_only_fields = ['id', 'uploaded_by', 'uploaded_at']


class LabTestSerializer(serializers.ModelSerializer):
    """Serializer for LabTest model."""

    template_name = serializers.CharField(source='template.name', read_only=True, allow_null=True)
    template_category = serializers.CharField(source='template.category', read_only=True, allow_null=True)
    template_sample_type = serializers.CharField(source='template.sample_type', read_only=True, allow_null=True)
    template_normal_range = serializers.SerializerMethodField()
    collected_by_name = serializers.SerializerMethodField()
    processed_by_name = serializers.SerializerMethodField()
    verified_by_name = serializers.SerializerMethodField()
    rejected_by_name = serializers.SerializerMethodField()
    order_details = serializers.SerializerMethodField()
    result_file_exists = serializers.SerializerMethodField()
    result_attachments = LabTestResultAttachmentSerializer(many=True, read_only=True)

    def get_template_normal_range(self, obj):
        """
        Return template normal ranges in a UI-friendly shape.

        Some single-analyte tests store results under a generic key like "Result",
        while the template may define a single field like "C-Peptide". To ensure
        unit/range always displays, alias the single template entry to "Result".
        """
        template = getattr(obj, "template", None)
        normal_range = getattr(template, "normal_range", None) if template else None

        if not isinstance(normal_range, dict):
            return normal_range

        # Copy so we don't mutate model-backed dicts in memory.
        normalized = dict(normal_range)

        if "Result" not in normalized and len(normalized) == 1:
            only_key = next(iter(normalized.keys()))
            normalized["Result"] = normalized.get(only_key)

        return normalized
    
    def get_collected_by_name(self, obj):
        """Get collected by user full name."""
        if not obj.collected_by:
            return None
        try:
            return obj.collected_by.get_full_name()
        except (AttributeError, TypeError):
            return str(obj.collected_by) if obj.collected_by else None
    
    def get_processed_by_name(self, obj):
        """Get processed by user full name."""
        if not obj.processed_by:
            return None
        try:
            return obj.processed_by.get_full_name()
        except (AttributeError, TypeError):
            return str(obj.processed_by) if obj.processed_by else None
    
    def get_verified_by_name(self, obj):
        """Get verified by user full name."""
        if not obj.verified_by:
            return None
        try:
            return obj.verified_by.get_full_name()
        except (AttributeError, TypeError):
            return str(obj.verified_by) if obj.verified_by else None
    
    def get_rejected_by_name(self, obj):
        """Get rejected by user full name."""
        if not obj.rejected_by:
            return None
        try:
            return obj.rejected_by.get_full_name()
        except (AttributeError, TypeError):
            return str(obj.rejected_by) if obj.rejected_by else None
    
    def get_order_details(self, obj):
        """Get order details including patient and doctor information."""
        if not obj.order:
            return None
        
        order = obj.order
        patient_details = None
        doctor_details = None
        patient_name = None
        doctor_name = None
        
        # Get patient details
        if order.patient:
            try:
                patient_name = order.patient.get_full_name()
                patient_details = {
                    'id': order.patient.id,
                    'name': patient_name,
                    'age': getattr(order.patient, 'age', None),
                    'gender': getattr(order.patient, 'gender', ''),
                    'category': getattr(order.patient, 'category', None),
                    'employee_type': getattr(order.patient, 'employee_type', None),
                    'nonnpa_type': getattr(order.patient, 'nonnpa_type', None),
                    'dependent_type': getattr(order.patient, 'dependent_type', None),
                    'phone': getattr(order.patient, 'phone', None),
                }
            except (AttributeError, TypeError):
                patient_name = str(order.patient) if order.patient else None
        
        # Get doctor details
        if order.doctor:
            try:
                doctor_name = order.doctor.get_full_name()
                doctor_details = {
                    'id': order.doctor.id,
                    'name': doctor_name,
                    'specialty': getattr(order.doctor, 'specialty', ''),
                }
            except (AttributeError, TypeError):
                doctor_name = str(order.doctor) if order.doctor else None
        
        return {
            'id': order.id,
            'order_id': order.order_id,
            'patient_name': patient_name,
            'doctor_name': doctor_name,
            'patient_details': patient_details,
            'doctor_details': doctor_details,
            'clinic': order.get_clinic_for_display(),
            'priority': order.priority,
            'clinical_notes': order.clinical_notes or '',
        }

    def get_result_file_exists(self, obj):
        """
        Return whether the stored result file path resolves to an existing file.
        Prevents frontend from showing dead links that return 404.
        """
        rf = getattr(obj, "result_file", None)
        if not rf:
            return False
        try:
            name = getattr(rf, "name", "") or ""
            if not name:
                return False
            storage = getattr(rf, "storage", None)
            if storage is None:
                return False
            return bool(storage.exists(name))
        except Exception:
            return False
    
    class Meta:
        model = LabTest
        fields = '__all__'
        read_only_fields = ['created_at', 'updated_at']


class LabTestCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating LabTest as part of LabOrder (nested)."""

    template = serializers.PrimaryKeyRelatedField(
        queryset=LabTemplate.objects.all(),
        allow_null=True,
        required=False,
    )

    class Meta:
        model = LabTest
        fields = ['name', 'code', 'sample_type', 'status', 'template', 'notes']
        # Exclude 'order' as it will be set when creating the order


class LabOrderSerializer(serializers.ModelSerializer):
    """Serializer for LabOrder model."""
    
    patient_name = serializers.SerializerMethodField()
    doctor_name = serializers.SerializerMethodField()
    patient_details = serializers.SerializerMethodField()
    doctor_details = serializers.SerializerMethodField()
    tests = LabTestSerializer(many=True, read_only=True)
    # Allow tests to be written during creation (using nested serializer without order field)
    tests_data = LabTestCreateSerializer(many=True, write_only=True, required=False)
    icd10_diagnoses = serializers.SerializerMethodField()
    
    def get_patient_name(self, obj):
        """Get patient full name."""
        if not obj.patient:
            return None
        try:
            return obj.patient.get_full_name()
        except (AttributeError, TypeError):
            return str(obj.patient) if obj.patient else None

    def get_icd10_diagnoses(self, obj):
        from common.diagnosis_serialization import serialize_icd10_diagnoses_for_order

        return serialize_icd10_diagnoses_for_order(
            consultation_session=obj.consultation_session if getattr(obj, "consultation_session_id", None) else None,
            visit=obj.visit if getattr(obj, "visit_id", None) else None,
            patient=obj.patient,
        )

    def get_doctor_name(self, obj):
        """Get doctor full name."""
        if not obj.doctor:
            return None
        try:
            return obj.doctor.get_full_name()
        except (AttributeError, TypeError):
            return str(obj.doctor) if obj.doctor else None
    
    def get_doctor_details(self, obj):
        """Get doctor details."""
        if not obj.doctor:
            return None
        try:
            return {
                'id': obj.doctor.id,
                'name': obj.doctor.get_full_name() if hasattr(obj.doctor, 'get_full_name') else str(obj.doctor),
                'specialty': getattr(obj.doctor, 'specialty', None) or '',
            }
        except (AttributeError, TypeError):
            return {
                'id': obj.doctor.id if obj.doctor else None,
                'name': str(obj.doctor) if obj.doctor else None,
                'specialty': '',
            }
    
    def get_patient_details(self, obj):
        """Get patient details."""
        if not obj.patient:
            return None
        try:
            return {
                'id': obj.patient.id,
                'name': obj.patient.get_full_name() if hasattr(obj.patient, 'get_full_name') else str(obj.patient),
                'age': obj.patient.age,
                'gender': obj.patient.gender,
                'personal_number': obj.patient.personal_number,
                'category': getattr(obj.patient, 'category', None),
                'employee_type': getattr(obj.patient, 'employee_type', None),
                'nonnpa_type': getattr(obj.patient, 'nonnpa_type', None),
                'dependent_type': getattr(obj.patient, 'dependent_type', None),
                'phone': getattr(obj.patient, 'phone', None),
                'division': obj.patient.division,
            }
        except (AttributeError, TypeError):
            return {
                'id': obj.patient.id if obj.patient else None,
                'name': str(obj.patient) if obj.patient else None,
                'age': None,
                'gender': None,
                'personal_number': None,
                'division': None,
            }
    
    def to_representation(self, instance):
        """Customize output to include patient and doctor as objects."""
        representation = super().to_representation(instance)
        # Add patient and doctor as full objects in response
        representation['patient'] = self.get_patient_details(instance)
        representation['doctor'] = self.get_doctor_details(instance)
        return representation
    
    def validate_clinic(self, value):
        """Normalize clinic name before validation."""
        if value:
            from common.clinic_utils import normalize_clinic_name
            return normalize_clinic_name(value)
        return value
    
    def create(self, validated_data):
        """Create lab order with nested tests."""
        tests_data = validated_data.pop('tests_data', [])
        order = LabOrder.objects.create(**validated_data)

        # Create lab tests
        for test_data in tests_data:
            LabTest.objects.create(order=order, **test_data)
        
        return order

    def _expand_known_tests_from_other(self, order, tests_data):
        """
        If a clinician selected the generic Other template but typed several known
        investigations in the notes, create real LabTest rows for known templates
        and leave only unmatched names under Other.
        """
        expanded = []
        explicit_template_ids = {
            item.get('template').id if hasattr(item.get('template'), 'id') else item.get('template')
            for item in tests_data
            if item.get('template')
        }

        templates = list(LabTemplate.objects.filter(is_active=True))
        template_by_name = {}
        for template in templates:
            keys = {
                _normalize_test_name(template.name),
                _normalize_test_name(template.code),
            }
            for key in keys:
                if key:
                    template_by_name.setdefault(key, template)

        for test_data in tests_data:
            code = str(test_data.get('code') or '').upper()
            template = test_data.get('template')
            template_code = str(getattr(template, 'code', '') or '').upper()
            is_other = code in OTHER_TEMPLATE_CODES or template_code in OTHER_TEMPLATE_CODES

            if not is_other:
                expanded.append(test_data)
                continue

            requested_names = _split_requested_other_tests(test_data.get('notes') or order.clinical_notes)
            if not requested_names:
                expanded.append(test_data)
                continue

            unmatched = []
            for requested_name in requested_names:
                matched_template = template_by_name.get(_normalize_test_name(requested_name))
                if not matched_template or matched_template.id in explicit_template_ids:
                    unmatched.append(requested_name)
                    continue

                expanded.append({
                    'name': matched_template.name,
                    'code': matched_template.code,
                    'sample_type': matched_template.sample_type,
                    'status': test_data.get('status') or 'pending',
                    'template': matched_template,
                    'notes': test_data.get('notes') or order.clinical_notes or '',
                })
                explicit_template_ids.add(matched_template.id)

            if unmatched:
                next_other = dict(test_data)
                next_other['notes'] = ', '.join(unmatched)
                expanded.append(next_other)

        return expanded
    
    class Meta:
        model = LabOrder
        fields = '__all__'
        read_only_fields = ['order_id', 'ordered_at', 'created_at']


class LabResultSerializer(serializers.ModelSerializer):
    """Serializer for LabResult model."""
    
    test_details = LabTestSerializer(source='test', read_only=True)
    patient_name = serializers.SerializerMethodField()
    order_id = serializers.CharField(source='order.order_id', read_only=True)
    order = LabOrderSerializer(read_only=True)
    patient = serializers.SerializerMethodField()
    
    def get_patient_name(self, obj):
        """Get patient full name."""
        if not obj.patient:
            return None
        try:
            return obj.patient.get_full_name()
        except (AttributeError, TypeError):
            return str(obj.patient) if obj.patient else None
    
    def get_patient(self, obj):
        """Get patient details."""
        if not obj.patient:
            return None
        try:
            return {
                'id': obj.patient.id,
                'name': obj.patient.get_full_name() if hasattr(obj.patient, 'get_full_name') else str(obj.patient),
                'age': getattr(obj.patient, 'age', None),
                'gender': getattr(obj.patient, 'gender', None),
            }
        except (AttributeError, TypeError):
            return {
                'id': obj.patient.id if obj.patient else None,
                'name': str(obj.patient) if obj.patient else None,
                'age': None,
                'gender': None,
            }
    
    class Meta:
        model = LabResult
        fields = '__all__'
        read_only_fields = ['created_at']
