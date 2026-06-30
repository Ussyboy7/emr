"""Detect consultation → ward handoff nursing orders (informational, not tasks)."""


def is_handoff_description(description: str | None) -> bool:
    desc = (description or '').lower()
    return (
        'observation admission' in desc
        or 'ward admission' in desc
        or 'day care' in desc
        or ('presenting complaint' in desc and 'diagnos' in desc)
    )


def is_informational_handoff_order(order_type: str | None, description: str | None) -> bool:
    ot = (order_type or '').strip().lower()
    if ot == 'observation admission':
        return True
    if ot != 'ward instruction':
        return False
    return is_handoff_description(description)
