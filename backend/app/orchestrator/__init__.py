"""The redaction pipeline: read a file, find the PII, write a cleaned copy of the same type.

    read_text -> find_pii -> (rescan, in AI mode) -> build_replacements -> write_redacted
"""

import time
from pathlib import Path
from typing import Any, NamedTuple

from app.models import UploadedFile
from app.orchestrator.documents import read_text, write_redacted
from app.orchestrator.handle_replacement import build_replacements
from app.orchestrator.report import build_summary


class Result(NamedTuple):
    output_path: Path
    summary: dict[str, Any]  # counts per type and scan stats; no PII, safe to store


def process_file(file: UploadedFile) -> Result:
    """Redact one uploaded file using the modes stored on its row."""
    started = time.perf_counter()
    path = Path(file.file_path)
    text = read_text(path)
    hits = _find_pii(text, file.detection_mode, file.output_mode)
    replacements = build_replacements(hits, file.output_mode)

    output_path = path.with_name(f"{path.stem}.redacted{path.suffix}")
    write_redacted(path, output_path, replacements)
    _ensure_pii_removed(output_path, replacements)

    elapsed_ms = round((time.perf_counter() - started) * 1000)
    return Result(output_path, build_summary(text, hits, elapsed_ms))


def _ensure_pii_removed(output_path: Path, replacements: dict[str, str]) -> None:
    """Fail rather than hand back a file that still contains something we found."""
    remaining = read_text(output_path)
    for new_value in replacements.values():  # a replacement may contain a PII string; ignore those
        remaining = remaining.replace(new_value, "")
    leftover = sum(pii in remaining for pii in replacements)
    if leftover:
        output_path.unlink()
        raise RuntimeError(f"{leftover} PII value(s) could not be removed from the file")


def _find_pii(text: str, detection_mode: str, output_mode: str) -> list[dict]:
    # Imported here because they load the spaCy / GLiNER models, which is slow.
    from app.prefilter import find_pii

    hits = find_pii(text, mode=output_mode)
    if detection_mode == "ai":
        from app.model_scan import rescan

        hits = rescan(text, hits, mode=output_mode)
    return hits
