"""Anonymizer: apply the pipeline's hits to the text and report what changed.

    from anonymizer import anonymize
    result = anonymize(text, hits, mode="replace")   # hits = pipeline.detect(text, mode)

`result` (what the API returns):
    {
        "text":    the anonymized text,
        "mode":    "redact" | "replace",
        "summary": {
            "total":   14,
            "by_type": {"PHONE_NUMBER": 7, "PERSON": 5, ...},   # most first
            "message": "Found 14 PII in your file:\\n7 phone numbers\\n5 names\\n...",
        },
        "changes": [ hit dicts that were applied, each with "replacement" added ],
    }

Counts are per occurrence: a phone number that appears 3 times counts 3 times.
Where hits overlap (e.g. a USERNAME inside a PERSON) only one is applied --
the higher score, then the longer span -- so the counts match the changes made.
"""
import random
import string
from collections import Counter
from datetime import date, timedelta

MODES = ("redact", "replace")


def redact_text(text: str) -> str:
    """
    Redacts sensitive words from the given text.

    Args:
        text (str): The input text to be redacted.

    Returns:
        str: The redacted text with sensitive words replaced by '[REDACTED]'.
    """
    return_text = ''
    for x in range(len(text)-2):
        return_text += '-'
    return_text =  '[' + return_text + ']'
    return return_text
"""
id -
PII_ENTITIES = [
   "PHONE_NUMBER",
   "US_SSN",
   "PERSON",
   "EMAIL_ADDRESS",
   "CREDIT_CARD",
   "US_BANK_NUMBER",
   "IBAN_CODE",
   "DATE_OF_BIRTH",
   "IP_ADDRESS",
   "PASSWORD",
   "USERNAME",


entity_type - type of entity ( e.g., phone number, email, etc.)
start - start of string in text
end - end of string in text
score - dont need to use
text - the text to be replaced
"""

_FIRST_NAMES = ["Alex", "Jordan", "Taylor", "Morgan", "Casey", "Riley", "Jamie", "Avery", "Quinn", "Skyler"]
_LAST_NAMES = ["Smith", "Johnson", "Lee", "Garcia", "Brown", "Miller", "Davis", "Wilson", "Clark", "Lewis"]
_EMAIL_DOMAINS = ["example.com", "example.org", "example.net"]


def _digits(n: int) -> str:
    return "".join(random.choice(string.digits) for _ in range(n))


def _random_username() -> str:
    return f"{random.choice(_FIRST_NAMES).lower()}{_digits(3)}"


def _random_credit_card() -> str:
    # 16 digits that pass the Luhn check, formatted in groups of 4
    body = [4] + [random.randint(0, 9) for _ in range(14)]
    total = 0
    for i, d in enumerate(reversed(body)):
        if i % 2 == 0:
            d *= 2
            if d > 9:
                d -= 9
        total += d
    body.append((10 - total % 10) % 10)
    num = "".join(map(str, body))
    return " ".join(num[i:i + 4] for i in range(0, 16, 4))


def _random_dob() -> str:
    start = date(1950, 1, 1)
    d = start + timedelta(days=random.randint(0, (date(2005, 12, 31) - start).days))
    return d.strftime("%m/%d/%Y")


def _random_password() -> str:
    chars = string.ascii_letters + string.digits + "!@#$%^&*"
    return "".join(random.choice(chars) for _ in range(12))


_GENERATORS = {
    "PHONE_NUMBER": lambda: f"({random.randint(200, 999)}) 555-{_digits(4)}",
    "US_SSN": lambda: f"{random.randint(100, 665)}-{random.randint(10, 99)}-{_digits(4)}",
    "PERSON": lambda: f"{random.choice(_FIRST_NAMES)} {random.choice(_LAST_NAMES)}",
    "EMAIL_ADDRESS": lambda: f"{_random_username()}@{random.choice(_EMAIL_DOMAINS)}",
    "CREDIT_CARD": _random_credit_card,
    "US_BANK_NUMBER": lambda: _digits(random.randint(8, 12)),
    "IBAN_CODE": lambda: f"GB{_digits(2)}XXXX{_digits(14)}",
    "DATE_OF_BIRTH": _random_dob,
    "IP_ADDRESS": lambda: ".".join(str(random.randint(1, 254)) for _ in range(4)),
    "PASSWORD": _random_password,
    "USERNAME": _random_username,
}


def replace_text(text_data: dict | list[dict]) -> dict:
    """
    Generates a random replacement value for each detected entity.

    Args:
        text_data (dict | list[dict]): One entity dict, or a list of them. Each
            dict needs "id", "entity_type", and "text"; other keys are ignored.

    Returns:
        dict: Maps each entity's id to a random value matching its entity type.
            Unknown entity types fall back to redact_text(text).
    """
    entities = [text_data] if isinstance(text_data, dict) else text_data

    replacements = {}
    for entity in entities:
        generator = _GENERATORS.get(entity["entity_type"])
        replacements[entity["id"]] = generator() if generator else redact_text(entity["text"])
    return replacements


# ---------------------------------------------------------------- summary
# entity type -> (singular, plural) for the readable message
_DISPLAY_NAMES = {
    "PHONE_NUMBER": ("phone number", "phone numbers"),
    "US_SSN": ("social security number", "social security numbers"),
    "PERSON": ("name", "names"),
    "EMAIL_ADDRESS": ("email address", "email addresses"),
    "CREDIT_CARD": ("credit card number", "credit card numbers"),
    "US_BANK_NUMBER": ("bank account number", "bank account numbers"),
    "IBAN_CODE": ("IBAN", "IBANs"),
    "DATE_OF_BIRTH": ("date of birth", "dates of birth"),
    "IP_ADDRESS": ("IP address", "IP addresses"),
    "PASSWORD": ("password", "passwords"),
    "USERNAME": ("username", "usernames"),
}


def _display_name(entity_type, count):
    singular, plural = _DISPLAY_NAMES.get(
        entity_type, (entity_type.replace("_", " ").lower(),) * 2
    )
    return singular if count == 1 else plural


def summarize(hits):
    """Counts per entity type (every occurrence) plus a readable message."""
    counts = Counter(h["entity_type"] for h in hits)
    by_type = dict(sorted(counts.items(), key=lambda kv: (-kv[1], kv[0])))
    total = sum(by_type.values())
    if total == 0:
        message = "No PII found in your file."
    else:
        lines = [f"Found {total} PII in your file:"]
        lines += [f"{n} {_display_name(t, n)}" for t, n in by_type.items()]
        message = "\n".join(lines)
    return {"total": total, "by_type": by_type, "message": message}


# ---------------------------------------------------------------- apply
def _resolve_overlaps(hits):
    """Keep one hit per overlapping region: higher score wins, then longer span."""
    chosen = []
    for h in sorted(hits, key=lambda h: (-h.get("score", 0), -(h["end"] - h["start"]), h["start"])):
        if all(h["end"] <= c["start"] or c["end"] <= h["start"] for c in chosen):
            chosen.append(h)
    return sorted(chosen, key=lambda h: h["start"])


def anonymize(text, hits, mode=None):
    """Apply `hits` (from pipeline.detect) to `text` and report what changed.

    mode="redact":  each PII becomes [-----] (same length as the original).
    mode="replace": each PII becomes a fake value of the same type; every hit
                    with the same id gets the same fake value.
    mode=None:      inferred from the hits (ids present -> "replace").
    """
    if mode is None:
        mode = "replace" if any(h.get("id") for h in hits) else "redact"
    if mode not in MODES:
        raise ValueError(f"mode must be one of {MODES}, got {mode!r}")

    applied = _resolve_overlaps(hits)

    # one fake value per id, so repeats of the same value stay consistent
    fakes = replace_text([h for h in applied if h.get("id")]) if mode == "replace" else {}

    out, pos, changes = [], 0, []
    for h in applied:
        if mode == "replace" and h.get("id") in fakes:
            new_value = fakes[h["id"]]
        else:
            new_value = redact_text(h["text"])
        out.append(text[pos:h["start"]])
        out.append(new_value)
        pos = h["end"]
        changes.append({**h, "replacement": new_value})
    out.append(text[pos:])

    return {
        "text": "".join(out),
        "mode": mode,
        "summary": summarize(applied),
        "changes": changes,
    }