"""Evaluate the prefilter alone and the full pipeline against ai4privacy gold labels.

Run:  python evaluate.py   (from the folder that holds prefilter.py)

Scores reported
---------------
Recall matters more than precision for this scanner, so the headline number
is F-beta with BETA = 2 (F2): recall counts 2x as much as precision.

1. Row-level:   does the text contain targeted PII? (yes/no, like a gate)
2. Span, strict: per entity type -- the right PII, with the right type.
3. Span, any-type: did we flag real PII at all, whatever type we called it?
   A phone-number hit on a passport number counts as correct here. For a
   scanner whose job is to catch sensitive text, this is closer to what matters.

Only entity types the dataset actually labels are scored. Types it never
labels (US_BANK_NUMBER, CREDIT_CARD, IBAN_CODE) can't be checked here, so
their hit counts are listed separately instead of counting as errors.
"""
import ast
import json
from collections import Counter, defaultdict

import pandas as pd
from model_scan import  rescan
from prefilter import PII_ENTITIES, find_pii, DEFAULT_MODE

BETA = 2.0  # >1 weights recall more. 2 = recall counts twice as much.

# ai4privacy label -> our entity type. Labels not listed here (IDCARD,
# PASSPORT, CITY, ...) are not targeted, but still count as "real PII" for
# the any-type score.
LABEL_MAP = {
    "GIVENNAME1": "PERSON",
    "GIVENNAME2": "PERSON",
    "LASTNAME1": "PERSON",
    "LASTNAME2": "PERSON",
    "LASTNAME3": "PERSON",
    "TEL": "PHONE_NUMBER",
    "SOCIALNUMBER": "US_SSN",
    "EMAIL": "EMAIL_ADDRESS",
    "BOD": "DATE_OF_BIRTH",
    "IP": "IP_ADDRESS",
    "PASS": "PASSWORD",
    "USERNAME": "USERNAME",
}

def detect(text, mode=DEFAULT_MODE):
    hits = find_pii(text, mode=mode)            # stage 1: fast rules + spaCy
    hits = rescan(text, hits, mode=mode)        # stage 2: re-check + catch misses
    return hits


def parse_mask(mask):
    """privacy_mask can come through as a list/array of dicts or as a string."""
    if isinstance(mask, str):
        try:
            return json.loads(mask)
        except json.JSONDecodeError:
            return ast.literal_eval(mask)
    return list(mask)


def overlaps(a, b):
    return a[0] < b[1] and b[0] < a[1]


def scores(tp_pred, n_pred, tp_gold, n_gold, beta=BETA):
    """precision, recall, F1, F-beta (rounded)."""
    p = tp_pred / n_pred if n_pred else 0.0
    r = tp_gold / n_gold if n_gold else 0.0
    f1 = 2 * p * r / (p + r) if p + r else 0.0
    b2 = beta * beta
    fb = (1 + b2) * p * r / (b2 * p + r) if (b2 * p + r) else 0.0
    return round(p, 3), round(r, 3), round(f1, 3), round(fb, 3)


def evaluate(df, detector=None, entities=PII_ENTITIES, n=500, seed=42,
             language="English", beta=BETA):
    """Run `detector` (default: prefilter.find_pii) over a sample of df.

    `detector(text)` must return hit dicts with "start", "end", "entity_type".
    Returns a dict with: rows, entities (DataFrame), unscorable (dict),
    errors (DataFrame), fp_breakdown (DataFrame).
    """
    detector = detector or find_pii
    if language is not None:
        df = df[df["language"] == language]
    if n is not None and n < len(df):
        df = df.sample(n=n, random_state=seed)

    scorable = set(LABEL_MAP.values()) & set(entities)
    fb_name = f"f{beta:g}"

    strict = defaultdict(lambda: Counter())          # per type: pred, pred_hit, gold, gold_hit
    anytype = Counter()                              # pred, pred_hit, gold, gold_hit
    unscorable = Counter()
    rows = Counter()
    errors = []

    for row in df.itertuples():
        text = row.source_text
        all_gold = [(int(m["start"]), int(m["end"]), m["label"]) for m in parse_mask(row.privacy_mask)]
        gold = [(s, e, LABEL_MAP[l]) for s, e, l in all_gold if LABEL_MAP.get(l) in scorable]

        preds_all = [(h["start"], h["end"], h["entity_type"])
                     for h in detector(text) if h["entity_type"] in entities]
        preds = []
        for p in preds_all:
            if p[2] in scorable:
                preds.append(p)
            else:
                unscorable[p[2]] += 1

        # --- predictions: strict + any-type precision
        for p in preds:
            strict[p[2]]["pred"] += 1
            ok_strict = any(p[2] == g[2] and overlaps(p, g) for g in gold)
            if ok_strict:
                strict[p[2]]["pred_hit"] += 1
        for p in preds:  # unscorable types can't be judged, so they're left out of precision
            hit_labels = [l for s, e, l in all_gold if overlaps(p, (s, e))]
            anytype["pred"] += 1
            if hit_labels:
                anytype["pred_hit"] += 1
            if not any(p[2] == g[2] and overlaps(p, g) for g in gold):
                errors.append({"row": row.Index, "kind": "FP", "entity": p[2],
                               "span": text[p[0]:p[1]],
                               "overlaps_gold": ",".join(sorted(set(hit_labels))) or "(none)",
                               "text": text})

        # --- gold: strict + any-type recall
        for g in gold:
            strict[g[2]]["gold"] += 1
            anytype["gold"] += 1
            if any(p[2] == g[2] and overlaps(p, g) for p in preds):
                strict[g[2]]["gold_hit"] += 1
            else:
                found_as = sorted({p[2] for p in preds_all if overlaps(p, g)})
                errors.append({"row": row.Index, "kind": "FN", "entity": g[2],
                               "span": text[g[0]:g[1]],
                               "overlaps_gold": ("found as " + ",".join(found_as)) if found_as else "(missed)",
                               "text": text})
            if any(overlaps(p, g) for p in preds_all):
                anytype["gold_hit"] += 1

        # --- row level
        has_gold, has_pred = bool(gold), bool(preds_all)
        rows["TP"] += has_gold and has_pred
        rows["FP"] += (not has_gold) and has_pred
        rows["FN"] += has_gold and (not has_pred)
        rows["TN"] += (not has_gold) and (not has_pred)

    # ---- assemble
    p, r, f1, fb = scores(rows["TP"], rows["TP"] + rows["FP"], rows["TP"], rows["TP"] + rows["FN"], beta)
    row_metrics = {"rows": len(df), **{k: rows[k] for k in ("TP", "FP", "FN", "TN")},
                   "precision": p, "recall": r, "f1": f1, fb_name: fb}

    table = []
    for ent in sorted(strict):
        c = strict[ent]
        p, r, f1, fb = scores(c["pred_hit"], c["pred"], c["gold_hit"], c["gold"], beta)
        table.append({"entity": ent, "gold": c["gold"], "predicted": c["pred"],
                      "precision": p, "recall": r, "f1": f1, fb_name: fb})
    tot = Counter()
    for c in strict.values():
        tot.update(c)
    p, r, f1, fb = scores(tot["pred_hit"], tot["pred"], tot["gold_hit"], tot["gold"], beta)
    table.append({"entity": "ALL strict", "gold": tot["gold"], "predicted": tot["pred"],
                  "precision": p, "recall": r, "f1": f1, fb_name: fb})
    p, r, f1, fb = scores(anytype["pred_hit"], anytype["pred"], anytype["gold_hit"], anytype["gold"], beta)
    table.append({"entity": "ALL any-type", "gold": anytype["gold"], "predicted": anytype["pred"],
                  "precision": p, "recall": r, "f1": f1, fb_name: fb})

    errors = pd.DataFrame(errors, columns=["row", "kind", "entity", "span", "overlaps_gold", "text"])
    fp = errors[errors["kind"] == "FP"]
    fp_breakdown = (fp.groupby(["entity", "overlaps_gold"]).size()
                    .rename("count").reset_index().sort_values("count", ascending=False))

    return {"rows": row_metrics, "entities": pd.DataFrame(table),
            "unscorable": dict(unscorable), "errors": errors, "fp_breakdown": fp_breakdown}


def label_counts(df, n=2000):
    """Which gold labels actually appear in the data (to sanity-check LABEL_MAP)."""
    return pd.Series(
        [m["label"] for mask in df["privacy_mask"].head(n) for m in parse_mask(mask)]
    ).value_counts()


def print_report(name, res):
    print(f"===== {name} =====")
    print("Row-level (contains PII?):", res["rows"])
    print(res["entities"].to_string(index=False))
    if res["unscorable"]:
        print("Not scorable (dataset has no labels for these):", res["unscorable"])
    print("\nTop false positives -- what they actually overlapped in the gold labels:")
    print(res["fp_breakdown"].head(12).to_string(index=False), "\n")


if __name__ == "__main__":
    import sys

    from db.data import dataset  # same dataset import prefilter.py used before

    train_data = dataset["train"].to_pandas()
    test_data = dataset["validation"].to_pandas()
    pd.set_option("display.width", 140)

    print("Gold labels in the data:\n", label_counts(train_data), "\n")

    detectors = [("prefilter", find_pii)]
    if "--prefilter-only" not in sys.argv:
          # loads the GLiNER model
        detectors.append(("pipeline", detect))

    # Tune on train, report validation as the real score.
    # Same seed -> every detector is scored on the same rows.
    summary = []
    for split, df in [("train", train_data), ("validation", test_data)]:
        for det_name, det in detectors:
            res = evaluate(df, detector=det, n=500)
            print_report(f"{split} / {det_name}", res)
            res["errors"].to_csv(f"errors_{split}_{det_name}.csv", index=False)
            ent = res["entities"].set_index("entity")
            fb = f"f{BETA:g}"
            summary.append({"split": split, "detector": det_name,
                            f"row {fb}": res["rows"][fb],
                            f"strict {fb}": ent.loc["ALL strict", fb],
                            f"any-type {fb}": ent.loc["ALL any-type", fb],
                            "any-type recall": ent.loc["ALL any-type", "recall"]})

    print("===== summary (higher is better) =====")
    print(pd.DataFrame(summary).to_string(index=False))