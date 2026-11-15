import re

from app.redact import redact_text, replace_text


def build_replacements(hits: list[dict], output_mode: str) -> dict[str, str]:
    """{PII text: what to replace it with}"""
    if output_mode == "replace":
        fakes = replace_text(hits)  # by id, so repeats get the same fake
        return {hit["text"]: fakes[hit["id"]] for hit in hits}
    return {hit["text"]: redact_text(hit["text"]) for hit in hits}


def replacement_pattern(replacements: dict[str, str]) -> re.Pattern[str]:
    # Longest first so "John Smith" beats "John". The lookarounds stop "Al" matching inside "Alexander".
    longest_first = sorted(replacements, key=len, reverse=True)
    return re.compile(r"(?<!\w)(?:" + "|".join(re.escape(pii) for pii in longest_first) + r")(?!\w)")


def replace_all(text: str, replacements: dict[str, str]) -> str:
    if not replacements:
        return text
    return replacement_pattern(replacements).sub(lambda match: replacements[match.group()], text)
