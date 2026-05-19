"""
Serializers for the Pharmacy app.
"""

from rest_framework import serializers
from rest_framework.exceptions import ValidationError
from django.db import models
from .combo_utils import combo_component_names_from_display_name
from .models import (
    GenericMedication,
    Medication,
    MedicationInventory,
    Prescription,
    PrescriptionItem,
    Dispense,
    StockRequest,
    StockRequestItem,
    StockIssue,
    StockIssueLine,
    DispensaryReceiptLine,
)


class GenericMedicationSerializer(serializers.ModelSerializer):
    """Serializer for GenericMedication model."""

    def validate_atc_code(self, value):
        if value is None:
            return None
        if isinstance(value, str) and not value.strip():
            return None
        return value

    def validate(self, attrs):
        def infer_route(dosage_form: str) -> str:
            f = (dosage_form or "").strip().lower()
            if any(
                k in f
                for k in [
                    "tablet",
                    "capsule",
                    "syrup",
                    "suspension",
                    "powder",
                    "sachet",
                    "solution",
                ]
            ):
                return "Oral"
            if any(k in f for k in ["injection", "vial", "ampoule", "infusion"]):
                return "IV"
            if any(k in f for k in ["inhaler", "nebul"]):
                return "Inhalation"
            if any(k in f for k in ["cream", "ointment", "gel", "lotion"]):
                return "Topical"
            if "eye" in f or "ophthalmic" in f:
                return "Ophthalmic"
            if "ear" in f or "otic" in f:
                return "Otic"
            if "nasal" in f:
                return "Nasal"
            if "suppository" in f:
                return "Rectal"
            return "Oral"

        # Keep generic records as single variants (one strength, one form, one route).
        for field in ("strength", "dosage_form", "route"):
            raw = attrs.get(field)
            if not isinstance(raw, str):
                continue
            cleaned = " ".join(raw.strip().split())
            attrs[field] = cleaned
            if "," in cleaned:
                raise serializers.ValidationError(
                    {
                        field: f"Use a single {field} value per generic (no comma-separated lists)."
                    }
                )
        form_value = attrs.get("dosage_form")
        route_value = attrs.get("route")
        if isinstance(form_value, str) and form_value.strip():
            if not isinstance(route_value, str) or not route_value.strip():
                attrs["route"] = infer_route(form_value)
        return attrs

    class Meta:
        model = GenericMedication
        fields = "__all__"


class MedicationSerializer(serializers.ModelSerializer):
    """Serializer for Medication model."""

    generic = GenericMedicationSerializer(read_only=True)
    generic_id = serializers.PrimaryKeyRelatedField(
        queryset=GenericMedication.objects.all(),
        source="generic",
        write_only=True,
        required=False,
    )

    def validate(self, attrs):
        generic = attrs.get("generic") or getattr(self.instance, "generic", None)
        if not generic and not self.instance:
            raise serializers.ValidationError(
                {"detail": "generic_id is required for brand medications"}
            )
        # Enforce unique brand per generic gracefully
        name = attrs.get("name") or (self.instance and self.instance.name)
        if name and generic:
            qs = Medication.objects.filter(name=name, generic=generic)
            if self.instance:
                qs = qs.exclude(pk=self.instance.pk)
            if qs.exists():
                raise serializers.ValidationError(
                    {"detail": "Brand name must be unique per generic."}
                )
        # Enforce unique code gracefully
        code = attrs.get("code") or (self.instance and self.instance.code)
        if code:
            qs_code = Medication.objects.filter(code=code)
            if self.instance:
                qs_code = qs_code.exclude(pk=self.instance.pk)
            if qs_code.exists():
                raise serializers.ValidationError(
                    {"detail": "Medication code must be unique."}
                )
        # Canonical unit: store one of the values the frontend dropdown expects (lowercase)
        allowed_units = ("tablet", "capsule", "ml", "vial", "box", "pack")
        if "unit" in attrs:
            raw = (attrs.get("unit") or "").strip().lower()
            attrs["unit"] = raw if raw in allowed_units else "tablet"
        return attrs

    class Meta:
        model = Medication
        fields = [
            "id",
            "name",
            "generic",
            "generic_id",
            "code",
            "unit",
            "strength",
            "form",
            "category",
            "manufacturer",
            "pack_size",
            "min_stock_level",
            "prescription_required",
            "description",
            "is_active",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["created_at", "updated_at"]


class StoreMedicationStockRowSerializer(MedicationSerializer):
    """Medication row with central-store aggregates (annotation fields)."""

    store_quantity = serializers.DecimalField(
        max_digits=14, decimal_places=2, read_only=True, coerce_to_string=False
    )
    nearest_expiry = serializers.DateField(read_only=True, allow_null=True)
    batch_count = serializers.IntegerField(read_only=True)

    class Meta(MedicationSerializer.Meta):
        fields = list(MedicationSerializer.Meta.fields) + [
            "store_quantity",
            "nearest_expiry",
            "batch_count",
        ]


class MedicationInventorySerializer(serializers.ModelSerializer):
    """Serializer for MedicationInventory model."""

    medication_name = serializers.CharField(source="medication.name", read_only=True)
    is_low_stock = serializers.ReadOnlyField()
    is_expired = serializers.ReadOnlyField()
    medication = MedicationSerializer(read_only=True)
    # Accept medication id for writes (required for creating inventory rows).
    medication_id = serializers.PrimaryKeyRelatedField(
        queryset=Medication.objects.all(),
        source="medication",
        write_only=True,
        required=True,
    )
    source_from_central_store = serializers.SerializerMethodField()

    def get_source_from_central_store(self, obj):
        """When batch was received from Central Store, return request/issue info."""
        from .models import StockIssueLine

        line = (
            StockIssueLine.objects.filter(destination_inventory_item=obj)
            .select_related("issue", "issue__request")
            .first()
        )
        if not line or not line.issue:
            return None
        req = line.issue.request
        return {
            "request_id": req.request_id if req else None,
            "issue_id": line.issue.issue_id,
            "issued_at": line.issue.issued_at.isoformat()
            if line.issue.issued_at
            else None,
        }

    class Meta:
        model = MedicationInventory
        fields = [
            "id",
            "medication",
            "medication_id",
            "medication_name",
            "batch_number",
            "expiry_date",
            "quantity",
            "unit",
            "min_stock_level",
            "max_stock_level",
            "location",
            "supplier",
            "purchase_price",
            "created_at",
            "updated_at",
            "is_low_stock",
            "is_expired",
            "source_from_central_store",
        ]
        read_only_fields = ["created_at", "updated_at"]


class DispensaryReceiptLineSerializer(serializers.ModelSerializer):
    """
    Serializer for Dispensary receipt lines, outputting a shape compatible with inventory list
    (so frontend can use the same transform). quantity is quantity_remaining.
    """

    medication = MedicationSerializer(read_only=True)
    medication_name = serializers.CharField(source="medication.name", read_only=True)
    source_from_central_store = serializers.SerializerMethodField()
    supplier = serializers.SerializerMethodField()

    @staticmethod
    def _resolve_source_location(obj):
        if obj.request and obj.request.from_location:
            return obj.request.from_location
        if obj.issue and obj.issue.request and obj.issue.request.from_location:
            return obj.issue.request.from_location
        return None

    def get_source_from_central_store(self, obj):
        if not obj.issue:
            return None
        req = obj.request
        from_location = self._resolve_source_location(obj)
        return {
            "request_id": req.request_id if req else None,
            "issue_id": obj.issue.issue_id,
            "issued_at": obj.issue.issued_at.isoformat()
            if obj.issue.issued_at
            else None,
            "from_location": from_location,
        }

    def get_supplier(self, obj):
        source_location = self._resolve_source_location(obj)
        if source_location:
            return source_location
        if obj.stock_issue_line and obj.stock_issue_line.source_inventory_item:
            return obj.stock_issue_line.source_inventory_item.supplier or ""
        return ""

    class Meta:
        model = DispensaryReceiptLine
        fields = [
            "id",
            "medication",
            "medication_name",
            "batch_number",
            "expiry_date",
            "quantity",
            "quantity_remaining",
            "received_at",
            "request",
            "issue",
            "supplier",
            "source_from_central_store",
        ]
        read_only_fields = [
            "quantity",
            "quantity_remaining",
            "received_at",
            "request",
            "issue",
        ]

    def to_representation(self, instance):
        data = super().to_representation(instance)
        # Expose quantity_remaining as quantity for inventory list compatibility
        data["quantity"] = float(instance.quantity_remaining)
        # Add unit and min_stock_level from medication for frontend
        med = instance.medication
        data["unit"] = getattr(med, "unit", "") or ""
        data["min_stock_level"] = float(getattr(med, "min_stock_level", 0) or 0)
        data["created_at"] = (
            instance.received_at.isoformat() if instance.received_at else None
        )
        data["updated_at"] = (
            instance.received_at.isoformat() if instance.received_at else None
        )
        return data


class PrescriptionItemSerializer(serializers.ModelSerializer):
    """Serializer for PrescriptionItem model."""

    medication_name = serializers.SerializerMethodField()
    medication_code = serializers.SerializerMethodField()
    medication_details = serializers.SerializerMethodField()
    dosage = serializers.SerializerMethodField()  # Legacy read alias for dose
    stock_dispensed_quantity = serializers.SerializerMethodField()
    stock_dispensed_unit = serializers.SerializerMethodField()
    can_split_combo = serializers.SerializerMethodField()
    combo_components = serializers.SerializerMethodField()
    prescribing_record_only = serializers.SerializerMethodField()
    prescription = serializers.PrimaryKeyRelatedField(
        read_only=True
    )  # Make prescription read-only for nested writes

    generic = serializers.PrimaryKeyRelatedField(
        queryset=GenericMedication.objects.all(), required=True
    )
    medication = serializers.PrimaryKeyRelatedField(
        queryset=Medication.objects.all(), required=False, allow_null=True
    )

    def to_internal_value(self, data):
        # Backward compatibility: accept legacy 'dosage' input and map to 'dose'
        if isinstance(data, dict) and "dose" not in data and "dosage" in data:
            data = dict(data)
            data["dose"] = data.get("dosage")
        return super().to_internal_value(data)

    def validate(self, attrs):
        generic = attrs.get("generic") or getattr(self.instance, "generic", None)
        medication = (
            attrs.get("medication")
            if "medication" in attrs
            else getattr(self.instance, "medication", None)
        )

        # Generic is required
        if not generic:
            raise serializers.ValidationError("Generic medication is required.")

        # If a brand medication is provided, it must belong to the selected generic
        if medication and medication.generic_id != generic.id:
            raise serializers.ValidationError(
                {"medication": "Selected brand does not belong to selected generic."}
            )

        # Auto-fill metadata from selected medication/generic when omitted
        def _is_blank(value):
            return value is None or (isinstance(value, str) and not value.strip())

        if _is_blank(attrs.get("unit")):
            attrs["unit"] = (
                getattr(medication, "unit", None)
                or getattr(generic, "dosage_form", None)
                or "unit"
            )
        if _is_blank(attrs.get("dosage_form")):
            attrs["dosage_form"] = (
                getattr(medication, "form", None)
                or getattr(generic, "dosage_form", None)
                or ""
            )
        if _is_blank(attrs.get("strength")):
            attrs["strength"] = (
                getattr(medication, "strength", None)
                or getattr(generic, "strength", None)
                or ""
            )
        if _is_blank(attrs.get("route")):
            attrs["route"] = getattr(generic, "route", None) or ""

        return attrs

    def get_medication_name(self, obj):
        """Get medication name safely (Brand or Generic)."""
        try:
            if obj.medication:
                return obj.medication.name
            if obj.generic:
                return obj.generic.name
            return None
        except (AttributeError, TypeError):
            return None

    def get_medication_code(self, obj):
        """Get medication code safely."""
        try:
            if obj.medication:
                return obj.medication.code
            # Generics don't have a stock code, but maybe ATC?
            if obj.generic:
                return obj.generic.atc_code
            return None
        except (AttributeError, TypeError):
            return None

    def get_medication_details(self, obj):
        """Get medication details including current stock (from dispensary)."""
        try:
            if obj.medication:
                medication = obj.medication
                from .models import DispensaryReceiptLine
                from django.db.models import Sum

                dispensary_stock = (
                    DispensaryReceiptLine.objects.filter(
                        medication=medication
                    ).aggregate(total=Sum("quantity_remaining"))["total"]
                    or 0
                )

                return {
                    "id": getattr(medication, "id", None),
                    "name": getattr(medication, "name", None),
                    "code": getattr(medication, "code", None),
                    "current_stock": float(dispensary_stock),
                    "unit": getattr(medication, "unit", None),
                    "strength": getattr(medication, "strength", None),
                    "form": getattr(medication, "form", None),
                    "pack_size": getattr(medication, "pack_size", None),
                    "type": "brand",
                    "medication_id": getattr(
                        medication, "id", None
                    ),  # Include medication_id for reference
                }
            elif obj.generic:
                generic = obj.generic
                return {
                    "id": generic.id,
                    "name": generic.name,
                    "code": generic.atc_code,
                    "unit": generic.dosage_form,  # Approximate
                    "strength": generic.strength,
                    "form": generic.dosage_form,
                    "type": "generic",
                    "generic_id": generic.id,  # Include generic_id for frontend detection
                }
            return None
        except (AttributeError, TypeError, ValueError):
            return None

    def get_dosage(self, obj):
        return getattr(obj, "dose", "") or ""

    def get_stock_dispensed_quantity(self, obj):
        try:
            total = 0.0
            for d in obj.dispenses.all():
                total += float(getattr(d, "quantity", 0) or 0)
            return total
        except (AttributeError, TypeError, ValueError):
            return 0.0

    def get_stock_dispensed_unit(self, obj):
        try:
            if obj.medication and getattr(obj.medication, "unit", None):
                return obj.medication.unit
            first = obj.dispenses.all().first()
            if first and getattr(first, "unit", None):
                return first.unit
            return obj.unit
        except (AttributeError, TypeError, ValueError):
            return obj.unit if getattr(obj, "unit", None) else ""

    def _combo_components_from_name(self, name: str):
        return combo_component_names_from_display_name(name)

    def get_combo_components(self, obj):
        generic_name = getattr(getattr(obj, "generic", None), "name", "") or ""
        components = self._combo_components_from_name(generic_name)
        return components if len(components) > 1 else []

    def get_can_split_combo(self, obj):
        if getattr(obj, "superseded_at", None):
            return False
        if getattr(obj, "is_dispensed", False):
            return False
        if float(getattr(obj, "dispensed_quantity", 0) or 0) > 0:
            return False
        return len(self.get_combo_components(obj)) > 1

    def get_prescribing_record_only(self, obj):
        return bool(getattr(obj, "superseded_at", None))

    class Meta:
        model = PrescriptionItem
        fields = [
            "id",
            "prescription",
            "medication",
            "generic",
            "medication_name",
            "medication_code",
            "medication_details",
            "quantity",
            "unit",
            "dosage_form",
            "strength",
            "dose",
            "dosage",
            "frequency",
            "duration",
            "route",
            "instructions",
            "dispensed_quantity",
            "stock_dispensed_quantity",
            "stock_dispensed_unit",
            "is_dispensed",
            "can_split_combo",
            "combo_components",
            "superseded_at",
            "superseded_split_into_ids",
            "prescribing_record_only",
        ]
        read_only_fields = [
            "prescription",
            "superseded_at",
            "superseded_split_into_ids",
        ]


class PrescriptionSerializer(serializers.ModelSerializer):
    """Serializer for Prescription model."""

    patient_name = serializers.SerializerMethodField()
    patient_details = serializers.SerializerMethodField()
    visit_details = serializers.SerializerMethodField()
    doctor_name = serializers.SerializerMethodField()
    medications = PrescriptionItemSerializer(many=True, read_only=True)
    # Allow medications to be written during creation
    items = PrescriptionItemSerializer(many=True, write_only=True, required=False)
    icd10_diagnoses = serializers.SerializerMethodField()
    dispensed_by_name = serializers.SerializerMethodField()

    def get_dispensed_by_name(self, obj):
        latest_dispense = obj.dispenses.order_by("-dispensed_at").first()
        if latest_dispense and latest_dispense.dispensed_by:
            return latest_dispense.dispensed_by.get_full_name()
        return None

    def get_patient_name(self, obj):
        """Get patient full name."""
        return obj.patient.get_full_name() if obj.patient else "Unknown Patient"

    def get_patient_details(self, obj):
        """Get detailed patient information."""
        if not obj.patient:
            return {
                "id": None,
                "name": "Unknown Patient",
                "patient_id": "N/A",
                "age": None,
                "date_of_birth": None,
                "gender": "Unknown",
                "phone": None,
                "phone_number": None,
                "allergies": [],
            }

        patient = obj.patient

        # Parse allergies from text field (comma or newline separated)
        allergies_text = patient.allergies or ""
        allergies_list = [
            a.strip() for a in allergies_text.replace("\n", ",").split(",") if a.strip()
        ]

        return {
            "id": patient.id,
            "name": patient.get_full_name(),
            "patient_id": patient.patient_id,
            "age": patient.age,
            "date_of_birth": patient.date_of_birth,
            "gender": patient.gender,
            "phone": patient.phone,
            "phone_number": patient.phone,  # Alias for compatibility
            "allergies": allergies_list,
        }

    def get_visit_details(self, obj):
        """Get visit details including clinic and location."""
        if not obj.visit:
            return None

        visit = obj.visit
        return {
            "id": visit.id,
            "visit_id": visit.visit_id,
            "clinic": visit.clinic,
            "location": visit.location,
            "visit_date": visit.created_at.date() if visit.created_at else None,
        }

    def get_doctor_name(self, obj):
        """Get doctor full name."""
        return obj.doctor.get_full_name() if obj.doctor else None

    def get_icd10_diagnoses(self, obj):
        from common.diagnosis_serialization import serialize_icd10_diagnoses_for_order

        return serialize_icd10_diagnoses_for_order(
            consultation_session=obj.consultation_session
            if getattr(obj, "consultation_session_id", None)
            else None,
            visit=obj.visit if getattr(obj, "visit_id", None) else None,
            patient=obj.patient,
        )

    def create(self, validated_data):
        """Create prescription with nested items and validation."""
        items_data = validated_data.pop("items", [])

        # Validate that we have items
        if not items_data:
            raise ValidationError(
                "At least one medication item is required for a prescription."
            )

        # Check for duplicate medications in the same prescription
        medication_ids = [
            item.get("medication") for item in items_data if item.get("medication")
        ]
        if len(medication_ids) != len(set(medication_ids)):
            raise ValidationError(
                "Duplicate medications are not allowed in the same prescription."
            )

        # Validate inventory availability for each item
        for item_data in items_data:
            medication_id = item_data.get("medication")
            quantity = item_data.get("quantity", 0)

            if medication_id and quantity > 0:
                # Check if medication exists and has sufficient stock
                from pharmacy.models import MedicationInventory

                available_stock = (
                    MedicationInventory.objects.filter(
                        medication_id=medication_id
                    ).aggregate(total_quantity=models.Sum("quantity"))["total_quantity"]
                    or 0
                )

                if available_stock < quantity:
                    raise ValidationError(
                        f"Insufficient inventory for medication {medication_id}. Available: {available_stock}, Requested: {quantity}"
                    )

        prescription = Prescription.objects.create(**validated_data)

        # Create prescription items
        prescription_items = []
        for item_data in items_data:
            prescription_items.append(
                PrescriptionItem(prescription=prescription, **item_data)
            )

        PrescriptionItem.objects.bulk_create(prescription_items)

        return prescription

    class Meta:
        model = Prescription
        fields = "__all__"
        read_only_fields = ["prescription_id", "prescribed_at", "created_at"]


class DispenseSerializer(serializers.ModelSerializer):
    """Serializer for Dispense model."""

    medication_name = serializers.CharField(source="medication.name", read_only=True)
    patient_name = serializers.CharField(
        source="prescription.patient.get_full_name", read_only=True
    )
    dispensed_by_name = serializers.CharField(
        source="dispensed_by.get_full_name", read_only=True, allow_null=True
    )
    prescription_details = PrescriptionSerializer(source="prescription", read_only=True)
    prescribed_generic_name = serializers.SerializerMethodField()
    prescribed_medication_name = serializers.SerializerMethodField()
    prescribed_unit = serializers.SerializerMethodField()
    dispense_context = serializers.SerializerMethodField()

    def get_prescribed_generic_name(self, obj):
        # No fallback: use immutable dispense-time snapshot only.
        return getattr(obj, "prescribed_generic_name_snapshot", "") or ""

    def get_prescribed_medication_name(self, obj):
        # No fallback: use immutable dispense-time snapshot only.
        return getattr(obj, "prescribed_medication_name_snapshot", "") or ""

    def get_prescribed_unit(self, obj):
        # No fallback: use immutable dispense-time snapshot only.
        return getattr(obj, "prescribed_unit_snapshot", "") or ""

    def get_dispense_context(self, obj):
        """
        as_selected_brand: dispensed brand equals prescribed brand on item
        brand_selected_from_generic: item prescribed as generic, brand selected at dispense
        substituted: dispensed brand differs from prescribed brand on item
        """
        # No fallback inference from mutable prescription state.
        # Return exactly what was snapshotted at dispense-time.
        return getattr(obj, "dispense_context_snapshot", "") or ""

    class Meta:
        model = Dispense
        fields = "__all__"
        read_only_fields = ["dispense_id", "dispensed_at"]


class StockRequestItemSerializer(serializers.ModelSerializer):
    medication_name = serializers.SerializerMethodField(read_only=True)
    medication_pack_size = serializers.SerializerMethodField(read_only=True)

    def get_medication_name(self, obj):
        return obj.medication.name if obj.medication else ""

    def get_medication_pack_size(self, obj):
        return getattr(obj.medication, "pack_size", None) if obj.medication else None

    class Meta:
        model = StockRequestItem
        fields = [
            "id",
            "request",
            "medication",
            "quantity",
            "fulfilled_quantity",
            "notes",
            "medication_name",
            "medication_pack_size",
        ]
        read_only_fields = ["request"]


class StockRequestSerializer(serializers.ModelSerializer):
    items = StockRequestItemSerializer(many=True)
    requested_by_name = serializers.SerializerMethodField(read_only=True)
    confirmed_by_name = serializers.SerializerMethodField(read_only=True)

    def get_requested_by_name(self, obj):
        return obj.requested_by.get_full_name() if obj.requested_by else ""

    def get_confirmed_by_name(self, obj):
        return obj.confirmed_by.get_full_name() if obj.confirmed_by else ""

    class Meta:
        model = StockRequest
        fields = "__all__"
        read_only_fields = ["request_id", "created_at", "updated_at", "requested_by"]

    def create(self, validated_data):
        items_data = validated_data.pop("items", [])
        # Assign requester from context if available
        if "request" in self.context and self.context["request"].user.is_authenticated:
            validated_data["requested_by"] = self.context["request"].user

        request = StockRequest.objects.create(**validated_data)
        for item_data in items_data:
            StockRequestItem.objects.create(request=request, **item_data)
        return request


class StockIssueLineSerializer(serializers.ModelSerializer):
    medication_name = serializers.CharField(source="medication.name", read_only=True)
    medication_pack_size = serializers.SerializerMethodField(read_only=True)

    def get_medication_pack_size(self, obj):
        return getattr(obj.medication, "pack_size", None) if obj.medication else None

    class Meta:
        model = StockIssueLine
        fields = [
            "id",
            "issue",
            "medication",
            "medication_name",
            "medication_pack_size",
            "source_inventory_item",
            "destination_inventory_item",
            "quantity",
        ]


class StockIssueSerializer(serializers.ModelSerializer):
    lines = StockIssueLineSerializer(many=True, read_only=True)
    issued_by_name = serializers.CharField(
        source="issued_by.get_full_name", read_only=True
    )
    request_id = serializers.SerializerMethodField(read_only=True)

    def get_request_id(self, obj):
        return obj.request.request_id if obj.request else None

    class Meta:
        model = StockIssue
        fields = [
            "id",
            "issue_id",
            "request",
            "request_id",
            "issued_by",
            "issued_by_name",
            "issued_at",
            "notes",
            "lines",
        ]
        read_only_fields = ["issue_id", "issued_at", "issued_by"]
