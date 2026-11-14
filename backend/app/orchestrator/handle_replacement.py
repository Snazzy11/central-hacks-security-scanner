from app.redact import redact_text, replace_text


def handle_replacement(text: str, hits: list[dict], output_mode: str) -> str:
    """Return `text` with every hit redacted or replaced.

    Hits come from prefilter.find_pii / model_scan.rescan (see HIT_KEYS in prefilter.py),
    found with the same `output_mode` ("redact" or "replace") passed here.
    """
    spans = _merge_overlaps(hits)

    if output_mode == "replace":
        fakes = replace_text(spans)  # {hit id: fake value}, so repeats of a value stay consistent
        new_values = [fakes[span["id"]] for span in spans]
    else:
        new_values = [redact_text(text[span["start"]:span["end"]]) for span in spans]

    # Splice from the end so earlier offsets stay valid.
    for span, new_value in reversed(list(zip(spans, new_values, strict=True))):
        text = text[:span["start"]] + new_value + text[span["end"]:]
    return text


def _merge_overlaps(hits: list[dict]) -> list[dict]:
    """Combine hits that overlap into one, so no part of the PII is left behind."""
    merged: list[dict] = []
    for hit in sorted(hits, key=lambda h: (h["start"], h["end"])):
        if merged and hit["start"] < merged[-1]["end"]:
            merged[-1] = {**merged[-1], "end": max(merged[-1]["end"], hit["end"])}
        else:
            merged.append(hit)
    return merged
