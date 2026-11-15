"""Stage 2 (AI mode): double-check the prefilter's hits with GLiNER (nvidia/gliner-PII).

Confirms hits the model agrees with, drops weak ones it doesn't, and adds anything the
prefilter missed. In "replace" mode existing ids are kept and new values continue the
numbering. The model downloads from Hugging Face the first time.
"""
import re

import torch
from gliner import GLiNER

from app.prefilter import MODES, make_hit, normalize_value

MODEL_NAME = "nvidia/gliner-PII"
MODEL_THRESHOLD = 0.4  # min GLiNER score for a span to count

# GLiNER label -> our entity type. It's zero-shot, so more labels can be added.
LABEL_MAP = {
    "first_name": "PERSON",
    "last_name": "PERSON",
    "phone_number": "PHONE_NUMBER",
    "ssn": "US_SSN",
    "email": "EMAIL_ADDRESS",
    "credit_debit_card": "CREDIT_CARD",
    "account_number": "US_BANK_NUMBER",
    "iban": "IBAN_CODE",
    "date_of_birth": "DATE_OF_BIRTH",
    "ipv4": "IP_ADDRESS",
    "ipv6": "IP_ADDRESS",
    "password": "PASSWORD",
    "user_name": "USERNAME",
}

# If the model doesn't back up a prefilter hit: trusted types are kept anyway (Presidio
# already checked their format), PERSON is dropped, and anything else stays if its score
# is high enough.
TRUSTED_TYPES = {"EMAIL_ADDRESS", "CREDIT_CARD", "IP_ADDRESS", "IBAN_CODE"}
REQUIRE_CONFIRMATION = {"PERSON"}
KEEP_UNCONFIRMED_SCORE = 0.6

# GLiNER silently ignores anything past its max length, so long texts go in overlapping chunks
WINDOW_OVERLAP_WORDS = 50


def _load_model():
    model = GLiNER.from_pretrained(MODEL_NAME)
    device = "cuda" if torch.cuda.is_available() else "cpu"
    model = model.to(device)
    model.eval()
    return model


model = _load_model()
_MAX_WORDS = max(100, int(getattr(model.config, "max_len", 384)) - 20)


def _windows(text):
    """(start, end) character ranges of at most _MAX_WORDS words each, overlapping."""
    words = [m.span() for m in re.finditer(r"\S+", text)]
    if len(words) <= _MAX_WORDS:
        return [(0, len(text))]
    step = _MAX_WORDS - min(WINDOW_OVERLAP_WORDS, _MAX_WORDS // 4)
    out = []
    for i in range(0, len(words), step):
        chunk = words[i:i + _MAX_WORDS]
        out.append((chunk[0][0], chunk[-1][1]))
        if i + _MAX_WORDS >= len(words):
            break
    return out


def model_spans(text, threshold=MODEL_THRESHOLD):
    """[(start, end, entity_type, score), ...]"""
    labels = list(LABEL_MAP)
    best = {}
    for ws, we in _windows(text):
        for e in model.predict_entities(text[ws:we], labels, threshold=threshold):
            etype = LABEL_MAP.get(e["label"])
            if etype is None:
                continue
            key = (e["start"] + ws, e["end"] + ws, etype)
            best[key] = max(best.get(key, 0.0), float(e["score"]))

    # the chunks overlap, so drop spans inside a longer one of the same type
    keys = sorted(best, key=lambda k: (k[0], -(k[1] - k[0])))
    kept = []
    for s, e, t in keys:
        if not any(t == kt and ks <= s and e <= ke for ks, ke, kt in kept):
            kept.append((s, e, t))
    return [(s, e, t, best[(s, e, t)]) for s, e, t in kept]


def _overlaps(a_start, a_end, b_start, b_end):
    return a_start < b_end and b_start < a_end


def rescan(text, hits, mode="redact", threshold=MODEL_THRESHOLD, keep_rejected=False):
    """Check the prefilter's hits against the model. keep_rejected is for debugging."""
    if mode not in MODES:
        raise ValueError(f"mode must be one of {MODES}, got {mode!r}")
    if not text:
        return []

    spans = model_spans(text, threshold)
    used = set()  # indexes of model spans that confirmed a prefilter hit
    out = []

    # 1. Re-check every prefilter hit
    for h in hits:
        matches = [
            i for i, (s, e, t, _) in enumerate(spans)
            if t == h["entity_type"] and _overlaps(s, e, h["start"], h["end"])
        ]
        hit = dict(h)
        if matches:
            used.update(matches)
            hit["status"] = "confirmed"
            hit["sources"] = ["prefilter", "model"]
            hit["score"] = round(max([h["score"]] + [spans[i][3] for i in matches]), 3)
        else:
            t = h["entity_type"]
            keep = t in TRUSTED_TYPES or (
                t not in REQUIRE_CONFIRMATION and h["score"] >= KEEP_UNCONFIRMED_SCORE
            )
            hit["status"] = "prefilter_only" if keep else "rejected"
            hit["sources"] = ["prefilter"]
        out.append(hit)

    # 2. Add what the prefilter missed
    for i, (s, e, t, score) in enumerate(spans):
        if i in used:
            continue
        out.append(make_hit(t, s, e, score, text[s:e],
                            status="model_only", sources=["model"]))

    out.sort(key=lambda h: (h["start"], h["end"]))
    _assign_ids(out, mode)

    if not keep_rejected:
        out = [h for h in out if h["status"] != "rejected"]
    return out


def _assign_ids(hits, mode):
    """Fill in ids, keeping the prefilter's and numbering new values after them."""
    if mode == "redact":
        for h in hits:
            h["id"] = None
        return

    ids, counters = {}, {}
    # register the ids the prefilter already assigned
    for h in hits:
        if h.get("id") and h["status"] != "rejected":
            ids.setdefault((h["entity_type"], normalize_value(h["entity_type"], h["text"])), h["id"])
            m = re.search(r"_(\d+)$", h["id"])
            if m:
                counters[h["entity_type"]] = max(counters.get(h["entity_type"], 0), int(m.group(1)))

    for h in hits:
        if h["status"] == "rejected":
            h["id"] = None
            continue
        key = (h["entity_type"], normalize_value(h["entity_type"], h["text"]))
        if key not in ids:
            counters[h["entity_type"]] = counters.get(h["entity_type"], 0) + 1
            ids[key] = f"{h['entity_type']}_{counters[h['entity_type']]}"
        h["id"] = ids[key]
