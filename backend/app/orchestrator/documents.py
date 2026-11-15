"""Reading and writing each file type.

The detector only ever sees text, but the output must stay the same kind of file. So each
format's reader and writer live together and work on the same text: whatever the reader showed
the detector is what the writer looks for when it replaces things in the original file.

Public API:
    read_text(path)                                   -> the file's text, for the detector
    write_redacted(path, output_path, replacements)   -> same type of file, with each
                                                         {original text: new text} replaced

Supported: .pdf, .docx, .csv, and the plain-text types in PLAIN_TEXT_EXTENSIONS
"""

import codecs
import csv
import io
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

Replacements = dict[str, str]  # {original text: replacement}


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



def _read_plain(path: Path) -> str:
    return path.read_text(encoding="utf-8", errors="replace")


def _write_plain(path: Path, output_path: Path, replacements: Replacements) -> None:
    output_path.write_text(replace_all(_read_plain(path), replacements), encoding="utf-8")


# ================================================================ pdf
# How it works:
#   1. Lay out the page's text as one string, one character at a time, remembering where each
#      character is drawn. Line breaks and runs of spaces become a single " ", so PII that
#      wraps onto the next line ("John" / "Smith") still matches "John Smith".
#   2. Find each PII string in that text -- exact, case-sensitive matches only.
#   3. Redact every character of each match (this deletes the text, not just covers it), then
#      draw the replacement where the match starts, in the original's size, weight and colour.
#      If the match wraps onto more lines, those parts are just removed.

PAGE_MARGIN = 36  # points (half an inch): replacements never run past this
MIN_FONT_SCALE = 0.7  # a replacement may shrink to 70% of the original size to fit, no smaller


def _read_pdf(path: Path) -> str:
    with pymupdf.open(path) as pdf:
        return "\n".join(str(page.get_text()) for page in pdf)


class _Char(NamedTuple):
    """One character of the page text, and where and how it is drawn."""

    text: str
    rect: pymupdf.Rect | None  # None for the " " that stands in for a line break
    line: int  # which line of the page it's on
    span: dict[str, Any]  # the text run it belongs to: font, size, colour, ...
    baseline: float


class _Placement(NamedTuple):
    """One PII match on a page, and how to draw its replacement."""

    rects: list[pymupdf.Rect]  # one per line the match covers; the replacement goes in the first
    new_value: str
    font: str
    size: float
    color: tuple[float, float, float]
    baseline: float
    room: float  # how wide the replacement may be: the matched text plus the free space after it


def _write_pdf(path: Path, output_path: Path, replacements: Replacements) -> None:
    with pymupdf.open(path) as pdf:
        for page in pdf:
            placements = _find_placements(page, replacements)
            if not placements:
                continue
            for placement in placements:
                for rect in placement.rects:
                    page.add_redact_annot(rect, fill=False)  # pyright: ignore[reportArgumentType]  # no box, so backgrounds survive
            page.apply_redactions(graphics=pymupdf.PDF_REDACT_LINE_ART_NONE)  # keep lines and shapes
            for placement in placements:
                _draw_replacement(page, placement)
        pdf.scrub(remove_links=False)  # drop metadata, hidden text, embedded files, JavaScript...
        pdf.save(output_path, garbage=4, deflate=True)


def _page_chars(page: pymupdf.Page) -> list[_Char]:
    """Every character on the page in reading order, with each line break and each run of
    whitespace collapsed to a single " "."""
    chars: list[_Char] = []
    blocks = cast(dict[str, Any], page.get_text("rawdict"))["blocks"]
    lines = [line for block in blocks for line in block.get("lines", [])]
    for line_number, line in enumerate(lines):
        if not line["spans"]:
            continue
        if chars and chars[-1].text != " ":  # the line break before this line
            chars.append(_Char(" ", None, line_number, line["spans"][0], 0.0))
        for span in line["spans"]:
            for char in span["chars"]:
                text = " " if char["c"].isspace() else char["c"]
                if text == " " and (not chars or chars[-1].text == " "):
                    continue  # collapse repeated whitespace
                chars.append(_Char(text, pymupdf.Rect(char["bbox"]), line_number, span, char["origin"][1]))
    return chars


def _find_placements(page: pymupdf.Page, replacements: Replacements) -> list[_Placement]:
    chars = _page_chars(page)
    page_text = "".join(char.text for char in chars)
    taken = [False] * len(chars)  # characters already covered by an earlier (longer) match
    placements: list[_Placement] = []

    for pii in sorted(replacements, key=len, reverse=True):  # longest first
        needle = " ".join(pii.split())  # same whitespace rule as the page text
        if not needle:
            continue
        start = page_text.find(needle)
        while start != -1:
            end = start + len(needle)
            if not any(taken[start:end]):
                taken[start:end] = [True] * len(needle)
                placements.append(_placement(page, chars, start, end, replacements[pii]))
            start = page_text.find(needle, start + 1)
    return placements


def _placement(page: pymupdf.Page, chars: list[_Char], start: int, end: int, new_value: str) -> _Placement:
    matched = [char for char in chars[start:end] if char.rect is not None]

    rect_per_line: dict[int, pymupdf.Rect] = {}  # in reading order
    for char in matched:
        if char.line in rect_per_line:
            rect_per_line[char.line].include_rect(char.rect)
        else:
            rect_per_line[char.line] = pymupdf.Rect(char.rect)
    rects = list(rect_per_line.values())

    first = matched[0]  # the replacement copies this character's style
    size = first.span["size"]
    return _Placement(
        rects=rects,
        new_value=new_value,
        font=_builtin_font(first.span["flags"]),
        size=size,
        color=pymupdf.sRGB_to_pdf(first.span["color"]),
        baseline=first.baseline,
        room=_room_after(page, chars, end, rects[0], first.line, size),
    )


def _room_after(page: pymupdf.Page, chars: list[_Char], end: int, rect: pymupdf.Rect,
                line: int, font_size: float) -> float:
    """Width available from the start of `rect` to the next character on the same line
    (or to the page margin, if nothing follows on that line)."""
    limit = page.rect.x1 - PAGE_MARGIN
    for char in chars[end:]:
        if char.line != line:
            break
        if char.rect is not None and char.text != " ":
            limit = char.rect.x0
            break
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
        pymupdf.Point(placement.rects[0].x0, placement.baseline),
        placement.new_value,
        fontname=placement.font,
        fontsize=_fitting_fontsize(placement),
        color=placement.color,
    )


def _fitting_fontsize(placement: _Placement) -> float:
    """The original size, shrunk only as far as needed to fit in the room (never below
    MIN_FONT_SCALE; past that the text runs a little long instead)."""
    full_width = pymupdf.get_text_length(placement.new_value, fontname=placement.font, fontsize=placement.size)
    if full_width <= placement.room:
        return placement.size
    return max(placement.size * MIN_FONT_SCALE, placement.size * placement.room / full_width)


# docx
def _read_docx(path: Path) -> str:
    document = Document(str(path))
    return "\n".join(_paragraph_text(list(_runs(p))) for p in _paragraphs(document))


def _write_docx(path: Path, output_path: Path, replacements: Replacements) -> None:
    document = Document(str(path))
    if replacements:
        pattern = replacement_pattern(replacements)
        for paragraph in _paragraphs(document):
            _replace_in_paragraph(list(_runs(paragraph)), pattern, replacements)
    _clear_author_info(document)
    document.save(str(output_path))


def _clear_author_info(document: DocxDocument) -> None:
    """Remove who wrote and last saved the file."""
    properties = document.core_properties
    properties.author = properties.last_modified_by = properties.comments = ""


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


def _paragraph_text(runs: list[Run]) -> str:
    return "".join(run.text for run in runs)


def _replace_in_paragraph(runs: list[Run], pattern: re.Pattern[str], replacements: Replacements) -> None:
    """PII can be split across runs ("Jo" + "hn"), so match on the joined text, then edit the runs."""
    run_starts: list[int] = []
    position = 0
    for run in runs:
        run_starts.append(position)
        position += len(run.text)

    # Last match first: an edit only shifts the text after it, so earlier offsets stay valid.
    for match in reversed(list(pattern.finditer(_paragraph_text(runs)))):
        _replace_span(runs, run_starts, match.start(), match.end(), replacements[match.group()])


def _replace_span(runs: list[Run], run_starts: list[int], start: int, end: int, new: str) -> None:
    """Put `new` where the match starts (keeping that run's formatting) and cut the rest of the
    match out of the runs it continues into."""
    is_first_run = True
    for run, run_start in zip(runs, run_starts, strict=True):
        run_end = run_start + len(run.text)
        if run_end <= start or run_start >= end:  # this run isn't part of the match
            continue
        cut_from = max(start, run_start) - run_start
        cut_to = min(end, run_end) - run_start
        run.text = run.text[:cut_from] + (new if is_first_run else "") + run.text[cut_to:]
        is_first_run = False


#csv
# The detector sees one line per cell, labelled with its column, and a blank line between rows:
#
#     First Name: John
#     Last Name: Smith
#
# One cell per line stops the detector from matching across cells ("John Smith" spread over two
# cells), which the writer could never find, because it replaces text inside each cell.
# The label is the column's header if csv.Sniffer thinks the file has a header row, otherwise
# "Column A", "Column B", ... Either way every cell is scanned, header cells included: with a
# header they come first, one per line; without one the header row is just another row.

CSV_DELIMITERS = ",;\t|"
CSV_SNIFF_CHARS = 64 * 1024  # how much of the file csv.Sniffer looks at
CSV_FALLBACK_ENCODINGS = ("cp1252", "latin-1")  # tried if the file isn't UTF-8; latin-1 never fails


class _CsvFile(NamedTuple):
    rows: list[list[str]]
    header: list[str] | None  # None if csv.Sniffer found no header row
    dialect: type[csv.Dialect]  # delimiter, quoting, ...
    encoding: str
    line_ending: str


def _read_csv(path: Path) -> str:
    csv_file = _load_csv(path)
    row_texts = []
    data_rows = csv_file.rows
    if csv_file.header:
        # Still scan the header cells: csv.Sniffer can mistake a data row for a header.
        header_cells = [cell for cell in csv_file.header if cell.strip()]
        if header_cells:
            row_texts.append("\n".join(header_cells))
        data_rows = csv_file.rows[1:]
    for row in data_rows:
        cells = [f"{_column_label(csv_file.header, i)}: {cell}" for i, cell in enumerate(row) if cell.strip()]
        if cells:
            row_texts.append("\n".join(cells))
    return "\n\n".join(row_texts)


def _write_csv(path: Path, output_path: Path, replacements: Replacements) -> None:
    csv_file = _load_csv(path)
    rows = csv_file.rows
    if replacements:
        pattern = replacement_pattern(replacements)
        rows = [[pattern.sub(lambda match: replacements[match.group()], cell) for cell in row] for row in rows]
    with output_path.open("w", encoding=csv_file.encoding, newline="") as file:
        writer = csv.writer(file, csv_file.dialect, lineterminator=csv_file.line_ending)
        writer.writerows(rows)


def _load_csv(path: Path) -> _CsvFile:
    """Parse the file the same way for reading and writing."""
    text, encoding = _decode(path.read_bytes())
    sample = text[:CSV_SNIFF_CHARS]
    sniffer = csv.Sniffer()
    try:
        dialect = sniffer.sniff(sample, delimiters=CSV_DELIMITERS)
    except csv.Error:  # e.g. a single column, or an empty file
        dialect = csv.excel
    try:
        has_header = sniffer.has_header(sample)
    except csv.Error:
        has_header = False

    rows = list(csv.reader(io.StringIO(text, newline=""), dialect))
    header = rows[0] if has_header and rows else None
    line_ending = "\r\n" if "\r\n" in text else "\n"
    return _CsvFile(rows, header, dialect, encoding, line_ending)


def _decode(raw: bytes) -> tuple[str, str]:
    """The file's text and its encoding, so the output can be written in the same encoding."""
    utf8 = "utf-8-sig" if raw.startswith(codecs.BOM_UTF8) else "utf-8"  # keep Excel's BOM if it had one
    for encoding in (utf8, *CSV_FALLBACK_ENCODINGS):
        try:
            return raw.decode(encoding), encoding
        except UnicodeDecodeError:
            continue
    raise AssertionError("unreachable: latin-1 decodes any bytes")


def _column_label(header: list[str] | None, index: int) -> str:
    if header and index < len(header) and header[index].strip():
        return header[index].strip()
    return f"Column {_column_letters(index)}"


def _column_letters(index: int) -> str:
    """0 -> A, 25 -> Z, 26 -> AA, like spreadsheet columns."""
    letters = ""
    index += 1
    while index:
        index, remainder = divmod(index - 1, 26)
        letters = chr(ord("A") + remainder) + letters
    return letters


# These are mainly text files that are safe to search and replace as a whole without some structure that replacement would break.
PLAIN_TEXT_EXTENSIONS = (
    ".txt", ".md", ".log", ".json", ".jsonl", ".xml", ".html", ".htm",
    ".yaml", ".yml", ".ini", ".vcf", ".sql", ".tex",
)

FORMATS = {
    **{extension: Format(_read_plain, _write_plain) for extension in PLAIN_TEXT_EXTENSIONS},
    ".pdf": Format(_read_pdf, _write_pdf),
    ".docx": Format(_read_docx, _write_docx),
    ".csv": Format(_read_csv, _write_csv),
}
SUPPORTED_EXTENSIONS = frozenset(FORMATS)
