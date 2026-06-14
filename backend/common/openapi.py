"""Shared OpenAPI helpers for drf-spectacular."""
from __future__ import annotations

from typing import Any, Dict, Optional, Sequence, Tuple, Union

from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, OpenApiResponse, extend_schema, extend_schema_view

ResponseMap = Dict[int, Union[Any, OpenApiResponse]]

# Default JSON body for APIViews that return ad-hoc dict payloads.
JSON_OBJECT_RESPONSE: ResponseMap = {200: OpenApiResponse(response=OpenApiTypes.OBJECT)}
JSON_MUTATION_RESPONSES: ResponseMap = {
    200: OpenApiResponse(response=OpenApiTypes.OBJECT),
    400: OpenApiResponse(response=OpenApiTypes.OBJECT),
    403: OpenApiResponse(response=OpenApiTypes.OBJECT),
}
HEALTH_CHECK_RESPONSE: ResponseMap = {
    200: OpenApiResponse(
        response={
            "type": "object",
            "properties": {
                "status": {"type": "string", "enum": ["healthy", "unhealthy"]},
                "services": {
                    "type": "object",
                    "additionalProperties": {"type": "string"},
                },
            },
        },
    ),
    503: OpenApiResponse(
        response={
            "type": "object",
            "properties": {
                "status": {"type": "string"},
                "services": {"type": "object"},
            },
        },
    ),
}
SERVER_TIME_RESPONSE: ResponseMap = {
    200: OpenApiResponse(
        response={
            "type": "object",
            "properties": {
                "date": {"type": "string", "format": "date"},
                "datetime": {"type": "string", "format": "date-time"},
                "timezone": {"type": "string"},
            },
        },
    ),
}


GENERIC_JSON_REQUEST = {
    "application/json": {
        "type": "object",
        "additionalProperties": True,
    }
}


def _default_responses_for_method(method: str) -> ResponseMap:
    method_lower = method.lower()
    if method_lower == "get":
        return JSON_OBJECT_RESPONSE
    if method_lower in ("post", "put", "patch"):
        return JSON_MUTATION_RESPONSES
    if method_lower == "delete":
        return {204: None, 400: OpenApiResponse(response=OpenApiTypes.OBJECT)}
    return JSON_OBJECT_RESPONSE


def document_viewset(
    *,
    tag: str,
    resource: str,
    read_only: bool = False,
    destroy_summary: Optional[str] = None,
):
    """Standard CRUD (or read-only) OpenAPI metadata for a DRF viewset."""
    if read_only:
        return extend_schema_view(
            list=extend_schema(summary=f"List {resource}", tags=[tag]),
            retrieve=extend_schema(summary=f"Retrieve {resource}", tags=[tag]),
        )
    return extend_schema_view(
        list=extend_schema(summary=f"List {resource}", tags=[tag]),
        retrieve=extend_schema(summary=f"Retrieve {resource}", tags=[tag]),
        create=extend_schema(summary=f"Create {resource}", tags=[tag]),
        update=extend_schema(summary=f"Update {resource}", tags=[tag]),
        partial_update=extend_schema(summary=f"Partially update {resource}", tags=[tag]),
        destroy=extend_schema(
            summary=destroy_summary or f"Delete {resource}",
            tags=[tag],
        ),
    )


def document_destroy_viewset(*, tag: str, resource: str):
    """OpenAPI metadata for a destroy-only viewset."""
    return extend_schema_view(
        destroy=extend_schema(summary=f"Delete {resource}", tags=[tag]),
    )


def document_api_view(
    *,
    tag: str,
    summary: str,
    description: str = "",
    methods: Sequence[str] = ("get",),
    responses: Optional[ResponseMap] = None,
    request: Optional[Any] = None,
):
    """OpenAPI metadata for APIView classes."""
    kwargs = {}
    for method in methods:
        method_lower = method.lower()
        method_summary = summary if len(methods) == 1 else f"{summary} ({method.upper()})"
        method_responses = responses or _default_responses_for_method(method_lower)
        schema_kwargs = {
            "summary": method_summary,
            "description": description or None,
            "tags": [tag],
            "responses": method_responses,
        }
        if method_lower in ("post", "put", "patch"):
            schema_kwargs["request"] = request if request is not None else GENERIC_JSON_REQUEST
        kwargs[method_lower] = extend_schema(**schema_kwargs)
    return extend_schema_view(**kwargs)


def path_int_params(*names: str) -> list[OpenApiParameter]:
    """OpenAPI path parameters typed as integers (nested @action routes)."""
    return [
        OpenApiParameter(name, OpenApiTypes.INT, OpenApiParameter.PATH)
        for name in names
    ]


ORDER_DISPATCH_ID_PARAMS = path_int_params("pk", "dispatch_id")
ORDER_DISPATCH_PK_PARAMS = path_int_params("pk", "dispatch_pk")
REFERRAL_FORM_PK_PARAMS = path_int_params("pk", "form_pk")
CHECKUP_PK_PARAM = path_int_params("pk")


def schema_safe_queryset(view, model, queryset_fn):
    """Return an empty queryset during OpenAPI generation (no DB required)."""
    if getattr(view, "swagger_fake_view", False):
        return model.objects.none()
    return queryset_fn()
