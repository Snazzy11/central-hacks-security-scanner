"""Reading and writing each file type.

The detector only ever sees text, but the output must stay the same kind of file. So a format's
reader and writer live together and work on exactly the same text: whatever the reader showed the
detector is what the writer looks for when it replaces things in the original file.
"""

import re
from collections.abc import Callable, Iterator
from pathlib import Path
from typing import Any, NamedTuple, cast

import pymupdf
from docx import Document
from docx.document import Document as DocxDocument
from docx.section import _Footer, _Header
from docx.table import _Cell
from docx.text.paragraph import Paragraph
from docx.text.run import Run

from app.orchestrator.handle_replacement import replace_all, replacement_pattern

Replacements = dict[str, str]
PAGE_MARGIN = 36  # points (half an inch)


class Format(NamedTuple):
    read: Callable[[Path], str]
    write: Callable[[Path, Path, Replacements], None]  # (source, destination, replacements)


def read_text(path: Path) -> str:
    return _format_of(path).read(path)


def write_redacted(path: Path, output_path: Path, replacements: Replacements) -> None:
    """Write a copy of `path` (same file type) with every key of `replacements` replaced."""
    _format_of(path).write(path, output_path, replacements)


def _format_of(path: Path) -> Format:
    try:
        return FORMATS[path.suffix.lower()]
    except KeyError:
        raise ValueError(f"Unsupported file type: {path.suffix}") from None


# ---------------------------------------------------------------- txt, md
def _read_plain(path: Path) -> str:
    return path.read_text(encoding="utf-8", errors="replace")


def _write_plain(path: Path, output_path: Path, replacements: Replacements) -> None:
    output_path.write_text(replace_all(_read_plain(path), replacements), encoding="utf-8")


# ---------------------------------------------------------------- pdf
def _read_pdf(path: Path) -> str:
    with pymupdf.open(path) as pdf:
        return "\n".join(str(page.get_text()) for page in pdf)


class _Placement(NamedTuple):
    """One PII string found on a PDF page, and how the text around it was styled."""

    rect: pymupdf.Rect
    new_value: str
    font: str
    size: float
    color: tuple[float, float, float]
    baseline: float
    room: float  # how wide the replacement may be: the matched text plus the free space after it


def _write_pdf(path: Path, output_path: Path, replacements: Replacements) -> None:
    """Real redaction: apply_redactions() deletes the text underneath, it doesn't just cover it.
    The replacement is then drawn in the same size, weight and colour as the text it replaced."""
    with pymupdf.open(path) as pdf:
        for page in pdf:
            placements = _find_placements(page, replacements)
            for placement in placements:
                page.add_redact_annot(placement.rect, fill=False)  # pyright: ignore[reportArgumentType]  # no box, so backgrounds survive
            page.apply_redactions(graphics=pymupdf.PDF_REDACT_LINE_ART_NONE)  # keep lines and shapes
            for placement in placements:
                _draw_replacement(page, placement)
        pdf.scrub(remove_links=False)  # drop metadata, hidden text, embedded files, JavaScript...
        pdf.save(output_path, garbage=4, deflate=True)


def _find_placements(page: pymupdf.Page, replacements: Replacements) -> list[_Placement]:
    placements: list[_Placement] = []
    words = cast(list[Any], page.get_text("words"))  # (x0, y0, x1, y1, word, ...) for every word on the page
    for pii in sorted(replacements, key=len, reverse=True):  # longest first
        for rect in page.search_for(pii):
            if any(rect in earlier.rect for earlier in placements):  # inside a longer match
                continue
            placements.append(_placement(page, rect, replacements[pii], words))
    return placements


def _placement(page: pymupdf.Page, rect: pymupdf.Rect, new_value: str, words: list[Any]) -> _Placement:
    text = cast(dict[str, Any], page.get_text("dict", clip=rect))
    spans = [
        span
        for block in text["blocks"]
        for line in block.get("lines", [])
        for span in line["spans"]
    ]
    if not spans:  # nothing to copy the style from
        return _Placement(rect, new_value, "helv", 11.0, (0, 0, 0), rect.y1 - rect.height * 0.2, rect.width)
    span = spans[0]
    color = pymupdf.sRGB_to_pdf(span["color"])
    room = _room_after(page, rect, words, span["size"])
    return _Placement(rect, new_value, _builtin_font(span["flags"]), span["size"], color, span["origin"][1], room)


def _room_after(page: pymupdf.Page, rect: pymupdf.Rect, words: list[Any], font_size: float) -> float:
    """Width available from the start of `rect` to the next word on the same line (or the page margin)."""
    same_line = [w[0] for w in words if w[0] >= rect.x1 - 0.5 and min(w[3], rect.y1) - max(w[1], rect.y0) > rect.height / 2]
    limit = min(same_line, default=page.rect.x1 - PAGE_MARGIN)
    return max(rect.width, limit - rect.x0 - font_size * 0.3)  # leave about a space before the next word


def _builtin_font(flags: int) -> str:
    """The PyMuPDF built-in font closest to the original's style flags."""
    bold, serif, monospace = flags & 16, flags & 4, flags & 8
    if monospace:
        return "cobo" if bold else "cour"
    if serif:
        return "tibo" if bold else "tiro"
    return "hebo" if bold else "helv"


def _draw_replacement(page: pymupdf.Page, placement: _Placement) -> None:
    page.insert_text(
        pymupdf.Point(placement.rect.x0, placement.baseline),
        placement.new_value,
        fontname=placement.font,
        fontsize=_fitting_fontsize(placement),
        color=placement.color,
    )


def _fitting_fontsize(placement: _Placement) -> float:
    """The original size, shrunk only as far as needed to fit in the gap (never below 70%,
    which is small but readable; past that the text runs a little long instead)."""
    full_width = pymupdf.get_text_length(placement.new_value, fontname=placement.font, fontsize=placement.size)
    if full_width <= placement.room:
        return placement.size
    return max(placement.size * 0.7, placement.size * placement.room / full_width)


# ---------------------------------------------------------------- docx
def _read_docx(path: Path) -> str:
    return "\n".join("".join(run.text for run in _runs(p)) for p in _paragraphs(Document(str(path))))


def _write_docx(path: Path, output_path: Path, replacements: Replacements) -> None:
    document = Document(str(path))
    pattern = replacement_pattern(replacements) if replacements else None
    for paragraph in _paragraphs(document):
        if pattern:
            _replace_in_paragraph(list(_runs(paragraph)), pattern, replacements)
    properties = document.core_properties  # who wrote and last saved the file
    properties.author = properties.last_modified_by = properties.comments = ""
    document.save(str(output_path))


def _paragraphs(document: DocxDocument) -> Iterator[Paragraph]:
    """Every paragraph in the body, in tables, and in the page headers and footers."""
    yield from _container_paragraphs(document)
    for section in document.sections:
        for part in (section.header, section.footer):
            if not part.is_linked_to_previous:
                yield from _container_paragraphs(part)


def _container_paragraphs(container: DocxDocument | _Cell | _Header | _Footer) -> Iterator[Paragraph]:
    yield from container.paragraphs
    for table in container.tables:
        for row in table.rows:
            for cell in row.cells:
                yield from _container_paragraphs(cell)


def _runs(paragraph: Paragraph) -> Iterator[Run]:
    """The paragraph's runs, including the ones inside hyperlinks."""
    for item in paragraph.iter_inner_content():
        yield from [item] if isinstance(item, Run) else item.runs


def _replace_in_paragraph(runs: list[Run], pattern: re.Pattern[str], replacements: Replacements) -> None:
    """PII can be split across runs ("Jo" + "hn"), so match on the joined text, then edit the runs."""
    text = "".join(run.text for run in runs)
    run_starts = [sum(len(r.text) for r in runs[:i]) for i in range(len(runs))]
    # Last match first: edits only shift text after them, so earlier offsets stay valid.
    for match in reversed(list(pattern.finditer(text))):
        _replace_span(runs, run_starts, match.start(), match.end(), replacements[match.group()])


def _replace_span(runs: list[Run], run_starts: list[int], start: int, end: int, new: str) -> None:
    """Put `new` where the match starts (keeping that run's formatting), cut it from later runs."""
    first = True
    for run, run_start in zip(runs, run_starts, strict=True):
        run_end = run_start + len(run.text)
        if run_end <= start or run_start >= end:
            continue
        cut_from, cut_to = max(start, run_start) - run_start, min(end, run_end) - run_start
        run.text = run.text[:cut_from] + (new if first else "") + run.text[cut_to:]
        first = False


FORMATS = {
    ".txt": Format(_read_plain, _write_plain),
    ".md": Format(_read_plain, _write_plain),
    ".pdf": Format(_read_pdf, _write_pdf),
    ".docx": Format(_read_docx, _write_docx),
}
