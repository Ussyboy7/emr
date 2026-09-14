"""DRF search that can match child rows with EXISTS instead of JOIN+DISTINCT."""

from __future__ import annotations

from django.apps import apps
from django.db.models import Exists, OuterRef, Q
from rest_framework.filters import SearchFilter


def search_field_lookup(field_name: str) -> str:
    if field_name.startswith("^"):
        return f"{field_name[1:]}__istartswith"
    if field_name.startswith("="):
        return f"{field_name[1:]}__iexact"
    if field_name.startswith("@"):
        return f"{field_name[1:]}__search"
    if field_name.startswith("$"):
        return f"{field_name[1:]}__iregex"
    return f"{field_name}__icontains"


def child_exists_q(
    model_label: str,
    fk_field: str,
    child_fields: tuple[str, ...],
    term: str,
    parent_ref: str = "pk",
) -> Q:
    model = apps.get_model(model_label)
    child_q = Q()
    for field in child_fields:
        child_q |= Q(**{f"{field}__icontains": term})
    return Q(
        Exists(model.objects.filter(**{fk_field: OuterRef(parent_ref)}).filter(child_q))
    )


def exists_aware_search_q(search_terms, fields, exists_specs=()) -> Q | None:
    """AND across whitespace terms; OR across fields / EXISTS child matches."""
    if not search_terms:
        return None
    combined = Q()
    for i, term in enumerate(search_terms):
        term_q = Q()
        for field_name in fields:
            term_q |= Q(**{search_field_lookup(field_name): term})
        for spec in exists_specs:
            model_label, fk_field, child_fields = spec[0], spec[1], spec[2]
            parent_ref = spec[3] if len(spec) > 3 else "pk"
            term_q |= child_exists_q(model_label, fk_field, child_fields, term, parent_ref)
        if i == 0:
            combined = term_q
        else:
            combined &= term_q
    return combined


def apply_exists_aware_search(queryset, search: str, fields, exists_specs=()):
    terms = [t for t in (search or "").split() if t]
    q = exists_aware_search_q(terms, fields, exists_specs)
    if q is None:
        return queryset
    return queryset.filter(q)


class ExistsAwareSearchFilter(SearchFilter):
    """
    Standard ``?search=`` (AND across whitespace terms) plus optional
    ``view.search_exists`` subqueries for 1-to-many fields.

    ``search_exists`` items: ``('app_label.Model', 'fk_to_parent', ('field', ...))``.
    Optional 4th item is the parent ``OuterRef`` field (default ``pk``).
    """

    def filter_queryset(self, request, queryset, view):
        search_terms = self.get_search_terms(request)
        if not search_terms:
            return queryset

        base_fields = list(getattr(view, "search_fields", None) or [])
        exists_specs = tuple(getattr(view, "search_exists", ()) or ())
        if not base_fields and not exists_specs:
            return queryset

        combined = exists_aware_search_q(search_terms, base_fields, exists_specs)
        if combined is None:
            return queryset
        return queryset.filter(combined)

    @staticmethod
    def _lookup(field_name: str) -> str:
        return search_field_lookup(field_name)
