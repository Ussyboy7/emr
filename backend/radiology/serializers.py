"""
Serializers for the Radiology app.
"""
from rest_framework import serializers
import re
from .models import (
    RadiologyTemplate,
    RadiologyOrder,
    RadiologyStudy,
    RadiologyStudyReportAttachment,
    RadiologyReport,
    ImagingPartner,
    RadiologyReferralDispatch,
)


OTHER_TEMPLATE_CODES = {'OTHER', 'OTHERS'}


def _normalize_study_name(value):
    return re.sub(r'[^a-z0-9]+', ' ', str(value or '').lower()).strip()


def _split_requested_other_studies(notes):
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


class ImagingPartnerSerializer(serializers.ModelSerializer):
    """External imaging center partners for outsourced study processing."""

    class Meta:
        model = ImagingPartner
        fields = [
            'id',
            'name',
            'code',
            'phone',
            'email',
            'address',
            'contact_person_title',
            'notes',
            'is_active',
            'sort_order',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['created_at', 'updated_at']


class RadiologyReferralDispatchSerializer(serializers.ModelSerializer):
    """
    Read serializer for RadiologyReferralDispatch. Embeds enough about the
    target studies + partner that the frontend can render the confirmation
    panel and reissue menu without an extra round-trip.
    """

    partner_id = serializers.PrimaryKeyRelatedField(
        source='partner', read_only=True, allow_null=True,
    )
    issued_by_name = serializers.SerializerMethodField()
    cancelled_by_name = serializers.SerializerMethodField()
    superseded_by_dispatch_id = serializers.CharField(
        source='superseded_by.dispatch_id', read_only=True, default=None,
    )
    studies = serializers.SerializerMethodField()

    def get_issued_by_name(self, obj):
        u = getattr(obj, 'issued_by', None)
        return u.get_full_name() if u else None

    def get_cancelled_by_name(self, obj):
        u = getattr(obj, 'cancelled_by', None)
        return u.get_full_name() if u else None

    def get_studies(self, obj):
        return [
            {
                'id': s.id,
                'procedure': s.procedure,
                'modality': s.modality,
                'body_part': s.body_part,
                'status': s.status,
                'processing_method': s.processing_method,
            }
            for s in obj.studies.all()
        ]

    class Meta:
        model = RadiologyReferralDispatch
        fields = [
            'id', 'dispatch_id', 'order', 'partner_id', 'partner_name',
            'partner_address_snapshot',
            'studies', 'status', 'superseded_by', 'superseded_by_dispatch_id',
            'cancellation_reason', 'notes',
            'issued_by', 'issued_by_name', 'issued_at',
            'cancelled_by', 'cancelled_by_name', 'cancelled_at',
            'referral_letter_printed_at', 'responsibility_form_printed_at',
        ]
        read_only_fields = fields  # writes go through dedicated endpoints


class RadiologyTemplateSerializer(serializers.ModelSerializer):
    """Serializer for RadiologyTemplate model."""

    class Meta:
        model = RadiologyTemplate
        fields = '__all__'
        read_only_fields = ['created_at', 'updated_at']


class RadiologyStudyReportAttachmentSerializer(serializers.ModelSerializer):
    uploaded_by_name = serializers.SerializerMethodField()

    def get_uploaded_by_name(self, obj):
        if not obj.uploaded_by:
            return None
        try:
            return obj.uploaded_by.get_full_name()
        except (AttributeError, TypeError):
            return str(obj.uploaded_by)

    class Meta:
        model = RadiologyStudyReportAttachment
        fields = ['id', 'study', 'row_id', 'row_name', 'file', 'uploaded_by', 'uploaded_by_name', 'uploaded_at']
        read_only_fields = ['id', 'uploaded_by', 'uploaded_at']


class RadiologyStudySerializer(serializers.ModelSerializer):
    """Serializer for RadiologyStudy model."""

    template_details = RadiologyTemplateSerializer(source='template', read_only=True)
    scheduled_by_name = serializers.CharField(source='scheduled_by.get_full_name', read_only=True, allow_null=True)
    acquired_by_name = serializers.CharField(source='acquired_by.get_full_name', read_only=True, allow_null=True)
    reported_by_name = serializers.CharField(source='reported_by.get_full_name', read_only=True, allow_null=True)
    rejected_by_name = serializers.CharField(source='rejected_by.get_full_name', read_only=True, allow_null=True)
    verified_by_name = serializers.CharField(source='verified_by.get_full_name', read_only=True, allow_null=True)
    report_file_url = serializers.SerializerMethodField()
    report_attachments = RadiologyStudyReportAttachmentSerializer(many=True, read_only=True)

    location_clinic_name = serializers.SerializerMethodField()

    def get_location_clinic_name(self, obj):
        clinic = getattr(obj.order, 'location_clinic', None) if obj.order else None
        return clinic.name if clinic else None

    def get_report_file_url(self, obj):
        """Get the URL for the uploaded report file."""
        if obj.report_file:
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(obj.report_file.url)
        return None
    
    class Meta:
        model = RadiologyStudy
        fields = '__all__'
        read_only_fields = ['created_at', 'updated_at']


class RadiologyOrderSerializer(serializers.ModelSerializer):
    """Serializer for RadiologyOrder model."""

    patient_name = serializers.CharField(source='patient.get_full_name', read_only=True)
    patient_details = serializers.SerializerMethodField()
    doctor_name = serializers.SerializerMethodField()
    doctor_details = serializers.SerializerMethodField()
    external_clinic_details = serializers.SerializerMethodField()
    location_clinic_name = serializers.SerializerMethodField()
    studies = RadiologyStudySerializer(many=True, read_only=True)
    icd10_diagnoses = serializers.SerializerMethodField()

    # Allow writing studies during creation
    studies_data = serializers.ListField(
        child=serializers.DictField(),
        write_only=True,
        required=False,
        help_text="List of studies to create with the order"
    )
    
    def get_patient_details(self, obj):
        """Get patient details including age and gender."""
        if obj.patient:
            return {
                'id': obj.patient.id,
                'patient_id': getattr(obj.patient, 'patient_id', None),
                'name': obj.patient.get_full_name(),
                'age': getattr(obj.patient, 'age', None),
                'gender': getattr(obj.patient, 'gender', None),
            }
        return None
    
    def get_doctor_name(self, obj):
        if obj.doctor:
            return obj.doctor.get_full_name()
        if obj.external_requesting_doctor_name:
            return obj.external_requesting_doctor_name
        return None
    
    def get_doctor_details(self, obj):
        """Get doctor details including specialty."""
        if obj.doctor:
            return {
                'id': obj.doctor.id,
                'name': obj.doctor.get_full_name(),
                'specialty': getattr(obj.doctor, 'specialty', None),
            }
        if obj.external_requesting_doctor_name:
            return {
                'name': obj.external_requesting_doctor_name,
            }
        return None

    def get_location_clinic_name(self, obj):
        clinic = getattr(obj, 'location_clinic', None)
        return clinic.name if clinic else None

    def get_external_clinic_details(self, obj):
        clinic = getattr(obj, 'external_clinic', None)
        if not clinic:
            return None
        return {
            'id': clinic.id,
            'name': clinic.name,
            'code': clinic.code,
            'location': clinic.location,
        }

    def get_icd10_diagnoses(self, obj):
        from common.diagnosis_serialization import serialize_icd10_diagnoses_for_order

        return serialize_icd10_diagnoses_for_order(
            consultation_session=obj.consultation_session if getattr(obj, "consultation_session_id", None) else None,
            visit=obj.visit if getattr(obj, "visit_id", None) else None,
            patient=obj.patient,
        )

    def validate_clinic(self, value):
        """Normalize clinic name before validation."""
        if value:
            from common.clinic_utils import normalize_clinic_name
            return normalize_clinic_name(value)
        return value

    def validate(self, attrs):
        attrs = super().validate(attrs)
        source_type = attrs.get('source_type', getattr(self.instance, 'source_type', 'internal_emr'))
        if source_type == 'external_manual':
            if not attrs.get('external_clinic') and not getattr(self.instance, 'external_clinic_id', None):
                raise serializers.ValidationError({'external_clinic': 'Originating clinic is required for external radiology requests.'})
            doctor_name = attrs.get(
                'external_requesting_doctor_name',
                getattr(self.instance, 'external_requesting_doctor_name', ''),
            )
            if not str(doctor_name or '').strip():
                raise serializers.ValidationError({'external_requesting_doctor_name': 'Requesting doctor from the manual form is required.'})
        return attrs

    def create(self, validated_data):
        """Create radiology order with associated studies."""
        studies_data = validated_data.pop('studies_data', [])

        # If no doctor is specified, try to get it from consultation session
        if (
            validated_data.get('source_type') != 'external_manual'
            and not validated_data.get('doctor')
            and validated_data.get('consultation_session')
        ):
            consultation_session = validated_data['consultation_session']
            if consultation_session.doctor:
                validated_data['doctor'] = consultation_session.doctor

        order = RadiologyOrder.objects.create(**validated_data)

        # Create studies if provided
        for raw in studies_data:
            study_data = dict(raw)
            # Frontend sends template as numeric PK; ORM expects instance or template_id.
            tid = study_data.pop('template', None)
            if tid is not None:
                study_data['template_id'] = tid
            # Never pass conflicting keys from ad-hoc dicts
            study_data.pop('order', None)
            study_data.pop('id', None)
            RadiologyStudy.objects.create(
                order=order,
                images_count=study_data.pop('images_count', 0),
                **study_data
            )

        return order

    def _expand_known_studies_from_other(self, order, studies_data):
        expanded = []
        explicit_template_ids = {
            item.get('template')
            for item in studies_data
            if item.get('template')
        }
        templates = list(RadiologyTemplate.objects.filter(is_active=True))
        template_by_name = {}
        for template in templates:
            for key in {
                _normalize_study_name(template.name),
                _normalize_study_name(template.code),
            }:
                if key:
                    template_by_name.setdefault(key, template)

        for study_data in studies_data:
            template = None
            template_id = study_data.get('template')
            if template_id:
                template = next((t for t in templates if t.id == template_id), None)
            code = str(getattr(template, 'code', '') or '').upper()
            procedure = str(study_data.get('procedure') or '').upper()
            is_other = code in OTHER_TEMPLATE_CODES or procedure in {'OTHER', 'OTHERS'} or 'OTHER' in procedure
            if not is_other:
                expanded.append(study_data)
                continue

            requested_names = _split_requested_other_studies(order.clinical_notes)
            if not requested_names:
                expanded.append(study_data)
                continue

            unmatched = []
            for requested_name in requested_names:
                matched_template = template_by_name.get(_normalize_study_name(requested_name))
                if not matched_template or matched_template.id in explicit_template_ids:
                    unmatched.append(requested_name)
                    continue
                expanded.append({
                    'template': matched_template.id,
                    'procedure': matched_template.name,
                    'body_part': matched_template.body_part or '',
                    'modality': matched_template.modality or matched_template.category or '',
                    'status': study_data.get('status') or 'pending',
                })
                explicit_template_ids.add(matched_template.id)

            if unmatched:
                next_other = dict(study_data)
                next_other['procedure'] = ', '.join(unmatched)
                next_other['custom_reports'] = [
                    {
                        'id': f"custom-{idx + 1}",
                        'procedure': name,
                        'report': '',
                        'recommendations': '',
                        'critical': False,
                    }
                    for idx, name in enumerate(unmatched)
                ]
                expanded.append(next_other)

        return expanded
    
    class Meta:
        model = RadiologyOrder
        fields = '__all__'
        read_only_fields = ['order_id', 'ordered_at', 'created_at']


class RadiologyReportSerializer(serializers.ModelSerializer):
    """Serializer for RadiologyReport model."""

    study_details = RadiologyStudySerializer(source='study', read_only=True)
    patient_name = serializers.CharField(source='patient.get_full_name', read_only=True)
    patient_details = serializers.SerializerMethodField()
    order_id = serializers.CharField(source='order.order_id', read_only=True)
    order_details = serializers.SerializerMethodField()
    
    def get_patient_details(self, obj):
        """Get patient details including age and gender."""
        if obj.patient:
            return {
                'id': obj.patient.id,
                'patient_id': getattr(obj.patient, 'patient_id', None),
                'name': obj.patient.get_full_name(),
                'age': getattr(obj.patient, 'age', None),
                'gender': getattr(obj.patient, 'gender', None),
            }
        return None
    
    def get_order_details(self, obj):
        """Get order details including doctor information."""
        if obj.order:
            return {
                'id': obj.order.id,
                'order_id': obj.order.order_id,
                'doctor': obj.order.doctor.id if obj.order.doctor else None,
                'doctor_name': obj.order.doctor.get_full_name() if obj.order.doctor else obj.order.external_requesting_doctor_name or None,
                'doctor_specialty': getattr(obj.order.doctor, 'specialty', None) if obj.order.doctor else None,
                'clinic': obj.order.clinic,
                'location_clinic_name': obj.order.location_clinic.name if obj.order.location_clinic else None,
                'clinical_notes': obj.order.clinical_notes,
                'provisional_diagnosis': obj.order.provisional_diagnosis,
                'lmp': str(obj.order.lmp) if obj.order.lmp else None,
            }
        return None
    
    class Meta:
        model = RadiologyReport
        fields = '__all__'
        read_only_fields = ['created_at']
