"""Stats shown on the results page. Counts only, no PII."""

from typing import Any

from app.redact import _resolve_overlaps, summarize


def build_summary(text: str, hits: list[dict], elapsed_ms: int) -> dict[str, Any]:
    applied = _resolve_overlaps(hits)
    return {
        **summarize(applied),
        "unique": len({(h["entity_type"], h["text"]) for h in applied}),
        "words_scanned": len(text.split()),
        "elapsed_ms": elapsed_ms,
    }
