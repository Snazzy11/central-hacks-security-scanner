"""What we tell the user about a redacted file: how much PII was removed, and what kind.
Holds counts only (no PII), so it is saved on the UploadedFile row."""

from typing import Any

from app.redact import _resolve_overlaps, summarize


def build_summary(text: str, hits: list[dict], elapsed_ms: int) -> dict[str, Any]:
    applied = _resolve_overlaps(hits)  # the same counting rule the anonymizer uses
    return {
        **summarize(applied),
        "unique": len({(h["entity_type"], h["text"]) for h in applied}),
        "words_scanned": len(text.split()),
        "elapsed_ms": elapsed_ms,
    }
