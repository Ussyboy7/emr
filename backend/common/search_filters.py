"""DRF search that can match child rows with EXISTS instead of JOIN+DISTINCT."""

from __future__ import annotations

from django.apps import apps
from django.db.models import Exists, OuterRef, Q
from rest_framework.filters import SearchFilter


class ExistsAwareSearchFilter(SearchFilter):
    """
    Standard ``?search=`` (AND across whitespace terms) plus optional
    ``view.search_exists`` subqueries for 1-to-many fields.

    ``search_exists`` items: ``('app_label.Model', 'fk_to_parent', ('field', ...))``.
    """

    def filter_queryset(self, request, queryset, view):
        search_terms = self.get_search_terms(request)
        if not search_terms:
            return queryset

        base_fields = list(getattr(view, "search_fields", None) or [])
        exists_specs = tuple(getattr(view, "search_exists", ()) or ())
        if not base_fields and not exists_specs:
            return queryset

        combined = Q()
        for i, term in enumerate(search_terms):
            term_q = Q()
            for field_name in base_fields:
                term_q |= Q(**{self._lookup(field_name): term})
            for model_label, fk_field, child_fields in exists_specs:
                model = apps.get_model(model_label)
                child_q = Q()
                for field in child_fields:
                    child_q |= Q(**{f"{field}__icontains": term})
                term_q |= Q(
                    Exists(
                        model.objects.filter(**{fk_field: OuterRef("pk")}).filter(child_q)
                    )
                )
            if i == 0:
                combined = term_q
            else:
                combined &= term_q

        return queryset.filter(combined)

    @staticmethod
    def _lookup(field_name: str) -> str:
        if field_name.startswith("^"):
            return f"{field_name[1:]}__istartswith"
        if field_name.startswith("="):
            return f"{field_name[1:]}__iexact"
        if field_name.startswith("@"):
            return f"{field_name[1:]}__search"
        if field_name.startswith("$"):
            return f"{field_name[1:]}__iregex"
        return f"{field_name}__icontains"
