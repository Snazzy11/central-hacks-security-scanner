"""The redaction pipeline: read a file, find the PII, write a cleaned copy.

    scrapeText -> find_pii -> (rescan, in AI mode) -> handle_replacement -> write
"""

from pathlib import Path

from app.models import UploadedFile
from app.orchestrator.handle_replacement import handle_replacement


def process_file(file: UploadedFile) -> Path:
    """Redact one uploaded file using the modes stored on its row. Returns the cleaned file."""
    path = Path(file.file_path)
    text = _read_text(path)
    hits = _find_pii(text, file.detection_mode, file.output_mode)
    cleaned = handle_replacement(text, hits, file.output_mode)

    # The pipeline works on plain text, so the result is always a .txt file.
    output_path = path.with_suffix(".redacted.txt")
    output_path.write_text(cleaned, encoding="utf-8")
    return output_path


def _read_text(path: Path) -> str:
    from app.scraper import detect_type, scrapeText  # heavy imports: only load when needed

    text = scrapeText(path, detect_type(path))
    if text is None:
        raise ValueError(f"Unsupported file type: {path.suffix}")
    return text


def _find_pii(text: str, detection_mode: str, output_mode: str) -> list[dict]:
    # Imported here because they load the spaCy / GLiNER models, which is slow.
    from app.prefilter import find_pii

    hits = find_pii(text, mode=output_mode)
    if detection_mode == "ai":
        from app.model_scan import rescan

        hits = rescan(text, hits, mode=output_mode)
    return hits
