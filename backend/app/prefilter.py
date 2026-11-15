"""Stage 1: find PII with Presidio (regexes + spaCy).

In "replace" mode each hit gets an id like PERSON_1, and the same value gets the same id
everywhere in the text ("John Smith" and "john smith" are both PERSON_1). In "redact" mode
the id is None.
"""
import re

from presidio_analyzer import (
    AnalyzerEngine,
    EntityRecognizer,
    Pattern,
    PatternRecognizer,
    RecognizerResult,
)

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
]

MODES = ("redact", "replace")
STATUSES = ("prefilter_only", "model_only", "confirmed", "rejected")


# Every stage passes hits around in this shape. text[start:end] is the PII.
def make_hit(entity_type, start, end, score, text, hit_id=None,
             status="prefilter_only", sources=("prefilter",)):
    if status not in STATUSES:
        raise ValueError(f"status must be one of {STATUSES}, got {status!r}")
    return {
        "id": hit_id,
        "entity_type": entity_type,
        "start": int(start),
        "end": int(end),
        "score": round(float(score), 3),
        "text": text,
        "status": status,
        "sources": list(sources),
    }


class PasswordRecognizer(EntityRecognizer):
    # "password: X", "pwd = X", "passcode is X" ... group 1 is the password.
    PATTERN = re.compile(
        r"\b(?:password|passwd|pwd|passcode|passphrase)\b\s*(?:is\s+|[:=]\s*)[\"']?(\S+)",
        re.IGNORECASE,
    )

    def __init__(self):
        super().__init__(supported_entities=["PASSWORD"], name="PasswordRecognizer")

    def load(self):
        pass

    def analyze(self, text, entities, nlp_artifacts=None):
        results = []
        for m in self.PATTERN.finditer(text):
            start, end = m.start(1), m.end(1)
            while end > start and text[end - 1] in ".,;:'\")":
                end -= 1
            if end > start:
                results.append(RecognizerResult("PASSWORD", start, end, 0.7))
        return results


class UsernameRecognizer(EntityRecognizer):
    # "username: X", "login is X", "user id = X", "handle: X"
    LABELED = re.compile(
        r"\b(?:user\s?name|user\s?id|login|handle|screen\s?name)\b\s*(?:is\s+|[:=]\s*)[\"']?([\w.\-]+)",
        re.IGNORECASE,
    )
    # "user: X" -- needs ':' or '=' so "the user is happy" doesn't match
    USER_COLON = re.compile(r"\buser\b\s*[:=]\s*[\"']?([\w.\-]+)", re.IGNORECASE)
    # "@handle" -- lookbehind skips emails like bob@gmail.com
    HANDLE = re.compile(r"(?<![\w.])@([A-Za-z0-9_]{2,30})\b")

    def __init__(self):
        super().__init__(supported_entities=["USERNAME"], name="UsernameRecognizer")

    def load(self):
        pass

    def analyze(self, text, entities, nlp_artifacts=None):
        results = []
        for pattern, score in ((self.LABELED, 0.7), (self.USER_COLON, 0.6), (self.HANDLE, 0.5)):
            for m in pattern.finditer(text):
                start, end = m.start(1), m.end(1)
                while end > start and text[end - 1] in ".-":
                    end -= 1
                if end > start:
                    results.append(RecognizerResult("USERNAME", start, end, score))
        return results


def _build_analyzer():
    analyzer = AnalyzerEngine()  # loads the spaCy model + built-in recognizers
    analyzer.registry.add_recognizer(PasswordRecognizer())
    analyzer.registry.add_recognizer(UsernameRecognizer())
    analyzer.registry.add_recognizer(
        PatternRecognizer(
            supported_entity="DATE_OF_BIRTH",
            patterns=[
                Pattern("date", r"\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b", 0.3),
                Pattern("iso_date", r"\b\d{4}-\d{2}-\d{2}\b", 0.3),
            ],
            context=["dob", "birth", "born", "birthday", "date of birth"],
        )
    )
    return analyzer


analyzer = _build_analyzer()


# Types where formatting doesn't matter: "555-123-4567" == "(555) 123 4567"
_DIGIT_TYPES = {"PHONE_NUMBER", "US_SSN", "CREDIT_CARD", "US_BANK_NUMBER", "IBAN_CODE"}
# Types where case matters, so "Hunter2" and "hunter2" get different ids
_CASE_SENSITIVE_TYPES = {"PASSWORD"}


def normalize_value(entity_type, value):
    """Two hits with the same normalized value are the same thing."""
    if entity_type in _DIGIT_TYPES:
        return re.sub(r"[^0-9A-Za-z]", "", value).lower()
    value = " ".join(value.split())
    return value if entity_type in _CASE_SENSITIVE_TYPES else value.lower()


def find_pii(text, entities=None, score_threshold=0.0, mode="redact"):
    """Every PII hit in the text, in order."""
    if mode not in MODES:
        raise ValueError(f"mode must be one of {MODES}, got {mode!r}")
    if not text:
        return []

    results = analyzer.analyze(
        text=text,
        entities=entities or PII_ENTITIES,
        language="en",
        score_threshold=score_threshold,
    )

    ids = {}       # (type, normalized value) -> id
    counters = {}  # type -> last number used
    hits = []
    for r in sorted(results, key=lambda r: (r.start, r.end)):
        value = text[r.start:r.end]
        hit_id = None
        if mode == "replace":
            key = (r.entity_type, normalize_value(r.entity_type, value))
            if key not in ids:
                counters[r.entity_type] = counters.get(r.entity_type, 0) + 1
                ids[key] = f"{r.entity_type}_{counters[r.entity_type]}"
            hit_id = ids[key]
        hits.append(make_hit(r.entity_type, r.start, r.end, r.score, value, hit_id=hit_id))
    return hits


# python -m app.prefilter
if __name__ == "__main__":
    sample = ("Hi, I'm John Smith, email john@x.com, password: Hunter2!, born 04/12/1990. "
              "Please ask JOHN SMITH or Jane Doe; call 555-123-4567 or (555) 123 4567.")
    for mode in MODES:
        hits = find_pii(sample, mode=mode)
        print(f"--- {mode} ---")
        for hit in hits:
            print(hit)
