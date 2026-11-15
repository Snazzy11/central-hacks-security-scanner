import re

from app.redact import redact_text, replace_text


def build_replacements(hits: list[dict], output_mode: str) -> dict[str, str]:
    """Map every PII string we found to the value that should replace it.

    Hits come from prefilter.find_pii / model_scan.rescan (see HIT_KEYS in prefilter.py),
    found with the same `output_mode` ("redact" or "replace") passed here.
    """
    if output_mode == "replace":
        fakes = replace_text(hits)  # {hit id: fake value}, so repeats of a value stay consistent
        return {hit["text"]: fakes[hit["id"]] for hit in hits}
    return {hit["text"]: redact_text(hit["text"]) for hit in hits}


def replacement_pattern(replacements: dict[str, str]) -> re.Pattern[str]:
    """One regex matching any PII string. Longest first, so "John Smith" wins over "John".
    A match can't touch a letter or digit, so a short hit like "Al" never edits "Alexander"."""
    longest_first = sorted(replacements, key=len, reverse=True)
    return re.compile(r"(?<!\w)(?:" + "|".join(re.escape(pii) for pii in longest_first) + r")(?!\w)")


def replace_all(text: str, replacements: dict[str, str]) -> str:
    if not replacements:
        return text
    return replacement_pattern(replacements).sub(lambda match: replacements[match.group()], text)
