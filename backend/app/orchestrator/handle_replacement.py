import re

from app.redact import redact_text, replace_text


def build_replacements(hits: list[dict], output_mode: str) -> dict[str, str]:
    """map every PII string found to the replacement value

    A 'hit' comes from prefilter.find_pii / model_scan.rescan
        see the HIT_KEYS in prefilter.py
    """
    if output_mode == "replace":
        fakes = replace_text(hits)  # {hit id: fake value}, so repeats of a value stay consistent
        return {hit["text"]: fakes[hit["id"]] for hit in hits}
    return {hit["text"]: redact_text(hit["text"]) for hit in hits}


def replacement_pattern(replacements: dict[str, str]) -> re.Pattern[str]:
    """Return a regex matching any PII string
    longest is first so that a full name is preferred over other single names
    """
    longest_first = sorted(replacements, key=len, reverse=True)
    return re.compile(r"(?<!\w)(?:" + "|".join(re.escape(pii) for pii in longest_first) + r")(?!\w)")


def replace_all(text: str, replacements: dict[str, str]) -> str:
    if not replacements:
        return text
    return replacement_pattern(replacements).sub(lambda match: replacements[match.group()], text)
