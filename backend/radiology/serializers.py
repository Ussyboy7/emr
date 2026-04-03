"""
Serializers for the Radiology app.
"""
from rest_framework import serializers
from .models import RadiologyTemplate, RadiologyOrder, RadiologyStudy, RadiologyReport


class RadiologyTemplateSerializer(serializers.ModelSerializer):
    """Serializer for RadiologyTemplate model."""

    class Meta:
        model = RadiologyTemplate
        fields = '__all__'
        read_only_fields = ['created_at', 'updated_at']


class RadiologyStudySerializer(serializers.ModelSerializer):
    """Serializer for RadiologyStudy model."""

    template_details = RadiologyTemplateSerializer(source='template', read_only=True)
    scheduled_by_name = serializers.CharField(source='scheduled_by.get_full_name', read_only=True, allow_null=True)
    acquired_by_name = serializers.CharField(source='acquired_by.get_full_name', read_only=True, allow_null=True)
    reported_by_name = serializers.CharField(source='reported_by.get_full_name', read_only=True, allow_null=True)
    rejected_by_name = serializers.CharField(source='rejected_by.get_full_name', read_only=True, allow_null=True)
    verified_by_name = serializers.CharField(source='verified_by.get_full_name', read_only=True, allow_null=True)
    report_file_url = serializers.SerializerMethodField()

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
    doctor_name = serializers.CharField(source='doctor.get_full_name', read_only=True, allow_null=True)
    doctor_details = serializers.SerializerMethodField()
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
    
    def get_doctor_details(self, obj):
        """Get doctor details including specialty."""
        if obj.doctor:
            return {
                'id': obj.doctor.id,
                'name': obj.doctor.get_full_name(),
                'specialty': getattr(obj.doctor, 'specialty', None),
            }
        return None

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

    def create(self, validated_data):
        """Create radiology order with associated studies."""
        studies_data = validated_data.pop('studies_data', [])

        # If no doctor is specified, try to get it from consultation session
        if not validated_data.get('doctor') and validated_data.get('consultation_session'):
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
                'doctor_name': obj.order.doctor.get_full_name() if obj.order.doctor else None,
                'doctor_specialty': getattr(obj.order.doctor, 'specialty', None) if obj.order.doctor else None,
                'clinic': obj.order.clinic,
                'clinical_notes': obj.order.clinical_notes,
                'provisional_diagnosis': obj.order.provisional_diagnosis,
                'lmp': str(obj.order.lmp) if obj.order.lmp else None,
            }
        return None
    
    class Meta:
        model = RadiologyReport
        fields = '__all__'
        read_only_fields = ['created_at']
