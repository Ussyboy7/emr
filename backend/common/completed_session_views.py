"""Shared list optimizations for completed clinical session endpoints."""

from __future__ import annotations

from common.session_stats import aggregate_completed_session_stats


class CompletedSessionListMixin:
    """
    Slim list serializer, optimized joins, and embedded completed_stats on list
    when ``?status=completed`` so the frontend avoids a second HTTP round-trip.
    """

    completed_stats_mode: str = ""
    session_list_serializer_class = None
    session_list_select_related: tuple[str, ...] = ()

    def get_serializer_class(self):
        if self.action == "list" and self.session_list_serializer_class is not None:
            return self.session_list_serializer_class
        return super().get_serializer_class()

    def list(self, request, *args, **kwargs):
        queryset = self.filter_queryset(self.get_queryset())
        page = self.paginate_queryset(queryset)
        serializer = self.get_serializer(page, many=True)
        response = self.get_paginated_response(serializer.data)
        if (request.query_params.get("status") or "").strip().lower() == "completed":
            response.data["completed_stats"] = aggregate_completed_session_stats(
                queryset.filter(status="completed"),
                mode=self.completed_stats_mode,
            )
        return response
