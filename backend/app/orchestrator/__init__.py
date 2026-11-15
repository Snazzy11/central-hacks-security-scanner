"""The redaction pipeline: read a file, find the PII, write a cleaned copy of the same type.

    read_text -> find_pii -> (rescan, in AI mode) -> build_replacements -> write_redacted
"""

from pathlib import Path

from app.models import UploadedFile
from app.orchestrator.documents import read_text, write_redacted
from app.orchestrator.handle_replacement import build_replacements


def process_file(file: UploadedFile) -> Path:
    """Redact one uploaded file using the modes stored on its row. Returns the cleaned file."""
    path = Path(file.file_path)
    hits = _find_pii(read_text(path), file.detection_mode, file.output_mode)
    replacements = build_replacements(hits, file.output_mode)

    output_path = path.with_name(f"{path.stem}.redacted{path.suffix}")
    write_redacted(path, output_path, replacements)
    _ensure_pii_removed(output_path, replacements)
    return output_path


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
