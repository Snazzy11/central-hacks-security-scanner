import random
import string
from datetime import date, timedelta


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
