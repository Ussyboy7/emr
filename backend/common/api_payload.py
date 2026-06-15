"""Small helpers for list-shaped API responses."""


def list_payload(data: list) -> dict:
    return {"results": data, "count": len(data)}
