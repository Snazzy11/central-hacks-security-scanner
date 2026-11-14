"""PII prefilter: run Presidio over a single string and report what it finds.

Detection only -- replacing/redacting the text happens later in the pipeline,
using the ids returned here.

Usage:
    from prefilter import find_pii, contains_pii

    hits = find_pii(text, mode="replace")   # each hit has an "id" like "PERSON_1"
    hits = find_pii(text, mode="redact")    # each hit has "id": None
    contains_pii("hello world")             # -> False

In "replace" mode the same value gets the same id everywhere in one document
("John Smith" ... "john smith" -> PERSON_1 both times). IDs restart at 1 for
each call, so they are consistent within one document, not across documents.

The analyzer is built once, the first time this module is imported. Each call
after that reuses it.
"""
import re

from presidio_analyzer import (
    AnalyzerEngine,
    EntityRecognizer,
    Pattern,
    PatternRecognizer,
    RecognizerResult,
)

# Entity types the prefilter looks for.
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

DEFAULT_SCORE_THRESHOLD = 0.0

MODES = ("redact", "replace")

# ---------------------------------------------------------------- hit format
# Every stage (prefilter, model_scan, pipeline) returns a list of these dicts:
#
#   {
#     "id":          "PERSON_1" in replace mode, None in redact mode
#     "entity_type": "PERSON", "PHONE_NUMBER", ...
#     "start":       char offset where the PII starts in the text
#     "end":         char offset just after it ends (text[start:end] is the PII)
#     "score":       confidence, 0-1
#     "text":        the matched PII string
#     "status":      "prefilter_only" | "model_only" | "confirmed" (| "rejected" when debugging)
#     "sources":     which stages found it, e.g. ["prefilter", "model"]
#   }
HIT_KEYS = ("id", "entity_type", "start", "end", "score", "text", "status", "sources")
STATUSES = ("prefilter_only", "model_only", "confirmed", "rejected")


def make_hit(entity_type, start, end, score, text, hit_id=None,
             status="prefilter_only", sources=("prefilter",)):
    """Build one hit dict. All stages use this, so the format can't drift."""
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
DEFAULT_MODE = "redact"


# ---------------------------------------------------------------- recognizers
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


# ------------------------------------------------------------------ helpers
# Types where formatting doesn't matter: "555-123-4567" == "(555) 123 4567"
_DIGIT_TYPES = {"PHONE_NUMBER", "US_SSN", "CREDIT_CARD", "US_BANK_NUMBER", "IBAN_CODE"}
# Types where case matters, so "Hunter2" and "hunter2" get different ids
_CASE_SENSITIVE_TYPES = {"PASSWORD"}


def normalize_value(entity_type, value):
    """Key used to decide whether two hits are 'the same' value."""
    if entity_type in _DIGIT_TYPES:
        return re.sub(r"[^0-9A-Za-z]", "", value).lower()
    value = " ".join(value.split())  # collapse whitespace / line breaks
    return value if entity_type in _CASE_SENSITIVE_TYPES else value.lower()


# ------------------------------------------------------------------ public API
def find_pii(text, entities=None, score_threshold=DEFAULT_SCORE_THRESHOLD, mode=DEFAULT_MODE):
    """Return every PII hit in `text`, in order of position, as a list of
    hit dicts (see HIT_KEYS above), each with status "prefilter_only".

    mode="replace": "id" is e.g. "PERSON_1". The same value (ignoring case and
                    spacing; digits only for phone/SSN/card/bank numbers) gets
                    the same id every time it appears in this text.
    mode="redact":  "id" is None.
    """
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

    ids = {}       # (entity_type, normalized value) -> id
    counters = {}  # entity_type -> last number used
    hits = []
    for r in sorted(results, key=lambda r: (r.start, r.end)):
        start, end, etype, score = r.start, r.end, r.entity_type, r.score
        value = text[start:end]
        hit_id = None
        if mode == "replace":
            key = (etype, normalize_value(etype, value))
            if key not in ids:
                counters[etype] = counters.get(etype, 0) + 1
                ids[key] = f"{etype}_{counters[etype]}"
            hit_id = ids[key]
        hits.append(make_hit(etype, start, end, score, value, hit_id=hit_id))
    return hits


def contains_pii(text, entities=None, score_threshold=DEFAULT_SCORE_THRESHOLD):
    """True if the text contains any PII. Use this for a yes/no gate."""
    return bool(find_pii(text, entities, score_threshold))


if __name__ == "__main__":
    sample = ("Hi, I'm John Smith, email john@x.com, password: Hunter2!, born 04/12/1990. "
              "Please ask JOHN SMITH or Jane Doe; call 555-123-4567 or (555) 123 4567.")
    for mode in MODES:
        hits = find_pii(sample, mode=mode)
        print(f"--- {mode} ---")
        for hit in hits:
            print(hit)