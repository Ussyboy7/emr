"""
Serializers for the Eye Care app.
"""
from rest_framework import serializers
from .models import EyeOrder, EyeSession, EyeSessionDiagnosticFile


class EyeOrderSerializer(serializers.ModelSerializer):
    """Serializer for EyeOrder model."""
    patient_name = serializers.CharField(source='patient.get_full_name', read_only=True)
    patient_id = serializers.CharField(source='patient.patient_id', read_only=True)
    ordered_by_name = serializers.CharField(source='ordered_by.get_full_name', read_only=True, allow_null=True)

    class Meta:
        model = EyeOrder
        fields = [
            'id', 'patient', 'patient_name', 'patient_id', 'ordered_by', 'ordered_by_name',
            'visit', 'consultation_session',
            'chief_complaint', 'visual_acuity_od', 'visual_acuity_os', 'visual_acuity_ou',
            'refraction_od', 'refraction_os', 'iop_od', 'iop_os',
            'diagnosis', 'treatment_plan', 'special_instructions',
            'priority', 'status', 'ordered_at', 'scheduled_at', 'completed_at',
        ]
        read_only_fields = ['id', 'ordered_at']


class EyeOrderCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating eye orders."""

    class Meta:
        model = EyeOrder
        fields = [
            'patient', 'visit', 'consultation_session',
            'chief_complaint', 'visual_acuity_od', 'visual_acuity_os', 'visual_acuity_ou',
            'refraction_od', 'refraction_os', 'iop_od', 'iop_os',
            'diagnosis', 'treatment_plan', 'special_instructions',
            'priority'
        ]


def _absolute_file_url(request, file_field):
    if not file_field or not getattr(file_field, 'name', None):
        return None
    url = file_field.url
    if request:
        return request.build_absolute_uri(url)
    return url


def diagnostic_attachments_for_session(session, request=None):
    """Merged list: multi-upload rows plus legacy FileField URLs when no uploads exist for that category."""
    rows = list(session.diagnostic_uploads.all())
    by_cat = {c: [r for r in rows if r.category == c] for c in ['pachymetry', 'oct', 'visual_field']}
    out = []
    for r in rows:
        out.append({
            'id': r.id,
            'category': r.category,
            'file': _absolute_file_url(request, r.file),
            'uploaded_at': r.uploaded_at,
            'legacy': False,
        })
    legacy_map = [
        ('pachymetry', session.pachymetry_file),
        ('oct', session.oct_file),
        ('visual_field', session.visual_field_file),
    ]
    for cat, field in legacy_map:
        if by_cat[cat]:
            continue
        url = _absolute_file_url(request, field)
        if url:
            out.append({
                'id': None,
                'category': cat,
                'file': url,
                'uploaded_at': None,
                'legacy': True,
            })
    order = {'pachymetry': 0, 'oct': 1, 'visual_field': 2}
    out.sort(key=lambda x: (order.get(x['category'], 99), x['legacy'], str(x['uploaded_at'] or '')))
    return out


class EyeSessionSerializer(serializers.ModelSerializer):
    """Serializer for EyeSession model."""
    patient_name = serializers.CharField(source='order.patient.get_full_name', read_only=True)
    patient_id = serializers.CharField(source='order.patient.patient_id', read_only=True)
    order_details = EyeOrderSerializer(source='order', read_only=True)
    diagnostic_attachments = serializers.SerializerMethodField()

    class Meta:
        model = EyeSession
        fields = [
            'id', 'order', 'order_details',
            'session_number', 'status', 'scheduled_at', 'started_at', 'completed_at',
            'duration_minutes', 'notes', 'procedures_performed', 'findings', 'soap_note', 'created_at',
            'pachymetry_file', 'oct_file', 'visual_field_file',
            'diagnostic_attachments',
            'patient_name', 'patient_id',
        ]
        read_only_fields = ['id', 'created_at']

    def get_diagnostic_attachments(self, obj):
        return diagnostic_attachments_for_session(obj, self.context.get('request'))


class EyeSessionCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating eye sessions."""

    class Meta:
        model = EyeSession
        fields = [
            'id', 'order', 'session_number', 'status', 'scheduled_at',
            'started_at', 'completed_at', 'duration_minutes',
            'notes', 'procedures_performed', 'findings', 'soap_note', 'created_at',
            'pachymetry_file', 'oct_file', 'visual_field_file',
        ]
        read_only_fields = ['id', 'created_at']


class EyeSessionDiagnosticFileSerializer(serializers.ModelSerializer):
    """Minimal serializer for destroy permission checks / future expansion."""

    class Meta:
        model = EyeSessionDiagnosticFile
        fields = ['id', 'session', 'category', 'file', 'uploaded_at']
