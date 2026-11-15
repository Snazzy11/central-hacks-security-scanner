"""The redaction pipeline: find the PII in a file or a piece of text, and produce a cleaned copy.

    read_text -> find_pii -> (rescan, in AI mode) -> build_replacements -> write_redacted

The web app goes through process_file (an upload stored on disk, tracked in the database).
The browser extension goes through clean_file and clean_text, which know nothing about the database.
"""

import time
from pathlib import Path
from typing import Any, NamedTuple

from app.models import UploadedFile
from app.orchestrator.documents import read_text, write_redacted
from app.orchestrator.handle_replacement import build_replacements, replace_all
from app.orchestrator.report import build_summary
from app.redact import resolve_overlaps


class Finding(NamedTuple):
    """A piece of PII that was replaced and by what"""

    entity_type: str
    value: str
    replacement: str


class Result(NamedTuple):
    output_path: Path
    summary: dict[str, Any]  # see report.py
    findings: list[Finding]


class TextResult(NamedTuple):
    text: str
    summary: dict[str, Any]
    findings: list[Finding]


def process_file(file: UploadedFile) -> Result:
    """Clean an upload from the wesbite. The cleaned copy is saved next to the original."""
    source = Path(file.file_path)
    destination = source.with_name(f"{source.stem}.redacted{source.suffix}")
    return clean_file(source, destination, file.detection_mode, file.output_mode)


def clean_file(
    source: Path,
    destination: Path,
    detection_mode: str,
    output_mode: str,
    entities: list[str] | None = None,
) -> Result:
    """Write a copy of `source` with the same type to `destination` with the PII replaced."""
    started = time.perf_counter()
    text = read_text(source)
    hits = _find_pii(text, detection_mode, output_mode, entities)
    replacements = build_replacements(hits, output_mode)

    write_redacted(source, destination, replacements)
    try:
        _ensure_pii_removed(read_text(destination), replacements)
    except RuntimeError:
        destination.unlink()
        raise

    summary = build_summary(text, hits, _milliseconds_since(started))
    return Result(destination, summary, _findings(hits, replacements))


def clean_text(
    text: str,
    detection_mode: str,
    output_mode: str,
    entities: list[str] | None = None,
) -> TextResult:
    """Essentially the same as clean_file, for text that isn't in a file like pasted text"""
    started = time.perf_counter()
    hits = _find_pii(text, detection_mode, output_mode, entities)
    replacements = build_replacements(hits, output_mode)

    cleaned = replace_all(text, replacements)
    _ensure_pii_removed(cleaned, replacements)

    summary = build_summary(text, hits, _milliseconds_since(started))
    return TextResult(cleaned, summary, _findings(hits, replacements))


def _ensure_pii_removed(cleaned_text: str, replacements: dict[str, str]) -> None:
    """Fail rather than return something that still contains PII"""
    remaining = cleaned_text
    for new_value in replacements.values():  # a replacement may contain a PII string; ignore those
        remaining = remaining.replace(new_value, "")
    leftover = sum(pii in remaining for pii in replacements)
    if leftover:
        raise RuntimeError(f"{leftover} PII value(s) could not be removed")


def _find_pii(text: str, detection_mode: str, output_mode: str, entities: list[str] | None) -> list[dict]:
    # Imported here because they load the spaCy / GLiNER models, which is slow.
    from app.prefilter import find_pii

    hits = find_pii(text, entities=entities, mode=output_mode)
    if detection_mode == "ai":
        from app.model_scan import rescan

        hits = rescan(text, hits, mode=output_mode)
    if entities is not None:  # the AI model can bring back types that weren't asked for
        hits = [hit for hit in hits if hit["entity_type"] in entities]
    return hits


def _findings(hits: list[dict], replacements: dict[str, str]) -> list[Finding]:
    """One per occurrence, with overlaps resolved the same way as the summary counts them"""
    return [
        Finding(hit["entity_type"], hit["text"], replacements[hit["text"]])
        for hit in resolve_overlaps(hits)
    ]


def _milliseconds_since(started: float) -> int:
    return round((time.perf_counter() - started) * 1000)
