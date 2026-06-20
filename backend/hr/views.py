"""HR-scoped API views — compliance, exemptions, outcome letters (no clinical PDFs)."""

import csv
from io import StringIO

from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.filters import OrderingFilter
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend

from audit.services import AuditService
from patients.models import AnnualCheckup, AnnualCheckupExemption

from django.db.models import Q

from .compliance import (
    DEFAULT_COMPLIANCE_PAGE_SIZE,
    MAX_COMPLIANCE_PAGE_SIZE,
    build_compliance_rows,
    compliance_summary,
    paginate_compliance,
)
from .permissions import IsHumanResources
from permissions.drf_permissions import ApiPageAccessPermission
from drf_spectacular.utils import extend_schema, extend_schema_view
from common.openapi import CHECKUP_PK_PARAM, document_viewset
from .serializers import AnnualCheckupExemptionSerializer, HRComplianceRowSerializer


@extend_schema_view(
    list=extend_schema(
        summary="HR annual check-up compliance matrix",
        tags=["HR"],
        responses={200: HRComplianceRowSerializer(many=True)},
    ),
)
class HRComplianceViewSet(viewsets.ViewSet):
    """Read-only compliance matrix for HR auditors."""

    queryset = AnnualCheckup.objects.none()
    serializer_class = HRComplianceRowSerializer
    permission_classes = [IsAuthenticated, ApiPageAccessPermission, IsHumanResources]

    def list(self, request):
        year = int(request.query_params.get("programme_year") or timezone.now().year)
        try:
            page = max(1, int(request.query_params.get("page") or 1))
        except (TypeError, ValueError):
            page = 1
        try:
            page_size = int(request.query_params.get("page_size") or DEFAULT_COMPLIANCE_PAGE_SIZE)
        except (TypeError, ValueError):
            page_size = DEFAULT_COMPLIANCE_PAGE_SIZE
        page_size = min(MAX_COMPLIANCE_PAGE_SIZE, max(1, page_size))

        rows, summary, count = paginate_compliance(
            year,
            division=request.query_params.get("division") or None,
            compliance_status=request.query_params.get("status") or None,
            search=request.query_params.get("search") or None,
            page=page,
            page_size=page_size,
        )
        serializer = HRComplianceRowSerializer(rows, many=True)
        AuditService.log_activity(
            user=request.user,
            action="read",
            object_type="hr_compliance",
            object_id=str(year),
            module="hr",
            object_repr=f"HR compliance {year}",
            description=f"Listed annual check-up compliance for {year}",
            request=request,
        )
        return Response(
            {
                "programme_year": year,
                "summary": summary,
                "results": serializer.data,
                "count": count,
                "page": page,
                "page_size": page_size,
            }
        )

    @extend_schema(tags=["HR"], summary="Summary")
    @action(detail=False, methods=["get"], url_path="summary")
    def summary(self, request):
        year = int(request.query_params.get("programme_year") or timezone.now().year)
        return Response({"programme_year": year, **compliance_summary(year)})

    @extend_schema(tags=["HR"], summary="Export csv")
    @action(detail=False, methods=["get"], url_path="export-csv")
    def export_csv(self, request):
        year = int(request.query_params.get("programme_year") or timezone.now().year)
        rows = build_compliance_rows(
            year,
            division=request.query_params.get("division") or None,
            compliance_status=request.query_params.get("status") or None,
            search=request.query_params.get("search") or None,
        )
        buffer = StringIO()
        writer = csv.writer(buffer)
        writer.writerow(
            [
                "Personal Number",
                "Patient ID",
                "Name",
                "Division",
                "Location",
                "Programme Year",
                "Status",
                "Visit Date",
                "Fitness Outcome",
                "Outcome Notes",
                "Exemption Reason",
            ]
        )
        for row in rows:
            writer.writerow(
                [
                    row["personal_number"],
                    row["patient_display_id"],
                    row["full_name"],
                    row["division"],
                    row["location"] or row["location_clinic_name"],
                    row["programme_year"],
                    row["compliance_status"],
                    row["visit_date"] or "",
                    row["fitness_outcome_display"],
                    row["outcome_notes"],
                    row["exemption_reason"],
                ]
            )
        AuditService.log_activity(
            user=request.user,
            action="read",
            object_type="hr_compliance",
            object_id=str(year),
            module="hr",
            object_repr=f"HR compliance CSV {year}",
            description=f"Exported annual check-up compliance CSV for {year}",
            request=request,
        )
        response = HttpResponse(buffer.getvalue(), content_type="text/csv")
        response["Content-Disposition"] = (
            f'attachment; filename="annual_checkup_compliance_{year}.csv"'
        )
        return response

    @extend_schema(tags=["HR"], summary="Outcome letter pdf", parameters=CHECKUP_PK_PARAM)
    @action(detail=True, methods=["get"], url_path="outcome-letter-pdf")
    def outcome_letter_pdf(self, request, pk=None):
        checkup = get_object_or_404(
            AnnualCheckup.objects.select_related("patient", "visit", "signed_off_by"),
            pk=pk,
        )
        if checkup.status != "completed":
            return Response(
                {"detail": "Outcome letter is available after doctor sign-off."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        from patients.annual_checkup_pdfs import build_hr_outcome_letter_pdf

        if checkup.outcome_letter_pdf:
            try:
                with checkup.outcome_letter_pdf.open("rb") as fh:
                    pdf_bytes = fh.read()
            except OSError:
                pdf_bytes = build_hr_outcome_letter_pdf(checkup)
        else:
            pdf_bytes = build_hr_outcome_letter_pdf(checkup)

        AuditService.log_activity(
            user=request.user,
            action="read",
            object_type="annual_checkup",
            object_id=str(checkup.id),
            module="hr",
            object_repr=f"HR outcome letter {checkup.programme_year}",
            description="Downloaded HR outcome letter PDF",
            request=request,
        )
        filename = f"outcome_letter_{checkup.patient.patient_id}_{checkup.programme_year}.pdf"
        response = HttpResponse(pdf_bytes, content_type="application/pdf")
        response["Content-Disposition"] = f'inline; filename="{filename}"'
        return response


@document_viewset(tag="HR", resource="annual check-up exemptions")
class AnnualCheckupExemptionViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated, ApiPageAccessPermission, IsHumanResources]
    serializer_class = AnnualCheckupExemptionSerializer
    filter_backends = [DjangoFilterBackend, OrderingFilter]
    filterset_fields = ["patient", "programme_year", "reason"]
    ordering_fields = ["programme_year", "granted_at"]
    ordering = ["-programme_year", "-granted_at"]
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return AnnualCheckupExemption.objects.none()

        qs = AnnualCheckupExemption.objects.select_related("patient", "granted_by")
        search = (self.request.query_params.get("search") or "").strip()
        if search:
            qs = qs.filter(
                Q(patient__surname__icontains=search)
                | Q(patient__first_name__icontains=search)
                | Q(patient__patient_id__icontains=search)
                | Q(patient__personal_number__icontains=search)
                | Q(notes__icontains=search)
                | Q(reason__icontains=search)
            )
        return qs

    def perform_create(self, serializer):
        exemption = serializer.save()
        AuditService.log_activity(
            user=self.request.user,
            action="create",
            object_type="annual_checkup_exemption",
            object_id=str(exemption.id),
            module="hr",
            object_repr=str(exemption),
            request=self.request,
        )
