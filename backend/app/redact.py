"""What each piece of PII gets turned into, plus the per-type counts for the results page."""
import random
import string
from collections import Counter
from datetime import date, timedelta


def redact_text(text: str) -> str:
    """'John Smith' -> '[--------]', same length as the original."""
    return "[" + "-" * (len(text) - 2) + "]"


FIRST_NAMES = ["Alex", "Jordan", "Taylor", "Morgan", "Casey", "Riley", "Jamie", "Avery", "Quinn", "Skyler"]
LAST_NAMES = ["Smith", "Johnson", "Lee", "Garcia", "Brown", "Miller", "Davis", "Wilson", "Clark", "Lewis"]
EMAIL_DOMAINS = ["example.com", "example.org", "example.net"]


def digits(n: int) -> str:
    return "".join(random.choice(string.digits) for _ in range(n))


def fake_username() -> str:
    return random.choice(FIRST_NAMES).lower() + digits(3)


def fake_credit_card() -> str:
    # 16 digits that pass the Luhn check, in groups of 4
    body = [4] + [random.randint(0, 9) for _ in range(14)]
    total = 0
    for i, d in enumerate(reversed(body)):
        if i % 2 == 0:
            d *= 2
            if d > 9:
                d -= 9
        total += d
    body.append((10 - total % 10) % 10)
    number = "".join(map(str, body))
    return " ".join(number[i:i + 4] for i in range(0, 16, 4))


def fake_dob() -> str:
    start = date(1950, 1, 1)
    day = start + timedelta(days=random.randint(0, (date(2005, 12, 31) - start).days))
    return day.strftime("%m/%d/%Y")


def fake_password() -> str:
    chars = string.ascii_letters + string.digits + "!@#$%^&*"
    return "".join(random.choice(chars) for _ in range(12))


FAKES = {
    "PHONE_NUMBER": lambda: f"({random.randint(200, 999)}) 555-{digits(4)}",
    "US_SSN": lambda: f"{random.randint(100, 665)}-{random.randint(10, 99)}-{digits(4)}",
    "PERSON": lambda: f"{random.choice(FIRST_NAMES)} {random.choice(LAST_NAMES)}",
    "EMAIL_ADDRESS": lambda: f"{fake_username()}@{random.choice(EMAIL_DOMAINS)}",
    "CREDIT_CARD": fake_credit_card,
    "US_BANK_NUMBER": lambda: digits(random.randint(8, 12)),
    "IBAN_CODE": lambda: f"GB{digits(2)}XXXX{digits(14)}",
    "DATE_OF_BIRTH": fake_dob,
    "IP_ADDRESS": lambda: ".".join(str(random.randint(1, 254)) for _ in range(4)),
    "PASSWORD": fake_password,
    "USERNAME": fake_username,
}


def replace_text(hits: dict | list[dict]) -> dict:
    """{hit id: fake value}. Unknown types just get redacted."""
    if isinstance(hits, dict):
        hits = [hits]
    fakes = {}
    for hit in hits:
        make_fake = FAKES.get(hit["entity_type"])
        fakes[hit["id"]] = make_fake() if make_fake else redact_text(hit["text"])
    return fakes


# for the summary message, e.g. "3 phone numbers"
NAMES = {
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


def type_name(entity_type, count):
    fallback = entity_type.replace("_", " ").lower()
    one, many = NAMES.get(entity_type, (fallback, fallback))
    return one if count == 1 else many


def summarize(hits):
    """Count every occurrence of each type, most common first."""
    counts = Counter(hit["entity_type"] for hit in hits)
    by_type = dict(sorted(counts.items(), key=lambda item: (-item[1], item[0])))
    total = sum(by_type.values())

    if total == 0:
        message = "No PII found in your file."
    else:
        lines = [f"Found {total} PII in your file:"]
        lines += [f"{n} {type_name(t, n)}" for t, n in by_type.items()]
        message = "\n".join(lines)
    return {"total": total, "by_type": by_type, "message": message}


def resolve_overlaps(hits):
    """When hits overlap, keep the higher score, then the longer one."""
    kept = []
    for hit in sorted(hits, key=lambda h: (-h.get("score", 0), -(h["end"] - h["start"]), h["start"])):
        if all(hit["end"] <= k["start"] or k["end"] <= hit["start"] for k in kept):
            kept.append(hit)
    return sorted(kept, key=lambda h: h["start"])
