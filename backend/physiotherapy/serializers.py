"""
Physiotherapy serializers for the EMR system.
"""
from rest_framework import serializers
from .models import PhysioTemplate, PhysioOrder, PhysioSession


class PhysioTemplateSerializer(serializers.ModelSerializer):
    """Serializer for physiotherapy templates."""

    class Meta:
        model = PhysioTemplate
        fields = ['id', 'name', 'code', 'category', 'description', 'is_active', 'created_at']


class PhysioOrderSerializer(serializers.ModelSerializer):
    """Serializer for physiotherapy orders."""
    patient_name = serializers.SerializerMethodField()
    patient_id = serializers.SerializerMethodField()
    ordered_by_name = serializers.SerializerMethodField()

    class Meta:
        model = PhysioOrder
        fields = [
            'id', 'patient', 'patient_name', 'patient_id',
            'ordered_by', 'ordered_by_name', 'consultation_session',
            'diagnosis', 'chief_complaint', 'treatment_goal', 'special_instructions',
            'priority', 'status', 'ordered_at', 'scheduled_at', 'completed_at',
            'sessions_completed'
        ]
        read_only_fields = ['id', 'ordered_at', 'patient_name', 'patient_id', 'ordered_by_name']

    def get_patient_name(self, obj):
        try:
            if obj.patient:
                return obj.patient.get_full_name()
            return None
        except:
            return None

    def get_ordered_by_name(self, obj):
        try:
            if obj.ordered_by:
                return obj.ordered_by.get_full_name() or obj.ordered_by.username
            return None
        except:
            return None

    def get_patient_id(self, obj):
        try:
            if obj.patient:
                return obj.patient.patient_id
            return None
        except:
            return None



class PhysioOrderCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating physiotherapy orders."""

    class Meta:
        model = PhysioOrder
        fields = [
            'patient', 'consultation_session', 'diagnosis',
            'chief_complaint', 'treatment_goal', 'special_instructions',
            'priority'
        ]


class PhysioSessionSerializer(serializers.ModelSerializer):
    """Serializer for physiotherapy sessions."""
    patient_name = serializers.SerializerMethodField()
    patient_id = serializers.SerializerMethodField()
    physiotherapist_name = serializers.SerializerMethodField()
    order_details = PhysioOrderSerializer(source='order', read_only=True)

    class Meta:
        model = PhysioSession
        fields = [
            # Basic info
            'id', 'order', 'order_details', 'physiotherapist', 'physiotherapist_name',
            'session_number', 'status', 'scheduled_at', 'started_at', 'completed_at',
            'duration_minutes', 'created_at',

            # Patient info
            'patient_name', 'patient_id',

            # A. Patient Assessment
            'presenting_complaint', 'pain_level_before', 'pain_level_after',

            # B. Medical & Social Background
            'medical_history', 'surgical_history', 'medications', 'allergies',
            'social_history', 'previous_treatments',

            # C. Physical Examination
            'posture_gait', 'range_of_motion', 'muscle_strength', 'sensation',
            'reflexes', 'special_tests', 'balance_coordination', 'assessment_findings',

            # D. Functional Evaluation
            'functional_assessment', 'functional_limitations', 'functional_goals', 'assistive_devices',

            # E. Clinical Reasoning
            'diagnosis_impression', 'prognosis', 'clinical_reasoning',

            # F. Treatment Plan
            'treatment_performed', 'exercises_prescribed', 'equipment_used', 'patient_education',

            # G. Session & Continuity
            'session_notes', 'progress_notes', 'recommendations', 'follow_up_instructions', 'next_session_plan'
        ]

    def get_patient_name(self, obj):
        try:
            if obj.order and obj.order.patient:
                return obj.order.patient.get_full_name()
            return None
        except:
            return None

    def get_physiotherapist_name(self, obj):
        try:
            if obj.physiotherapist:
                return obj.physiotherapist.get_full_name() or obj.physiotherapist.username
            return None
        except:
            return None

    def get_patient_id(self, obj):
        try:
            if obj.order and obj.order.patient:
                return obj.order.patient.patient_id
            return None
        except:
            return None

    def to_representation(self, instance):
        try:
            return super().to_representation(instance)
        except Exception as e:
            # Return minimal representation on error
            return {
                'id': instance.id,
                'order': instance.order_id if hasattr(instance, 'order_id') else instance.order,
                'physiotherapist': instance.physiotherapist_id if hasattr(instance, 'physiotherapist_id') else instance.physiotherapist,
                'session_number': instance.session_number,
                'status': instance.status,
                'error': str(e)
            }


class PhysioSessionCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating physiotherapy sessions. Accepts full assessment data."""

    class Meta:
        model = PhysioSession
        fields = [
            'id', 'order', 'physiotherapist', 'session_number', 'scheduled_at',
            'started_at', 'completed_at', 'duration_minutes', 'status',
            # A. Patient Assessment
            'presenting_complaint', 'pain_level_before', 'pain_level_after',
            # B. Medical & Social Background
            'medical_history', 'surgical_history', 'medications', 'allergies',
            'social_history', 'previous_treatments',
            # C. Physical Examination
            'posture_gait', 'range_of_motion', 'muscle_strength', 'sensation',
            'reflexes', 'balance_coordination', 'special_tests',
            # D. Functional Evaluation
            'functional_assessment', 'assistive_devices', 'functional_goals', 'functional_limitations',
            # E. Clinical Reasoning
            'assessment_findings', 'diagnosis_impression', 'prognosis', 'clinical_reasoning',
            # F. Treatment & Plan
            'treatment_performed', 'exercises_prescribed', 'equipment_used',
            'patient_education', 'next_session_plan',
            # G. Session & Continuity
            'session_notes', 'progress_notes', 'recommendations', 'follow_up_instructions',
        ]
        read_only_fields = ['id']