# PiiShooter: how it works (so far)

PiiShooter takes a document, finds the personal information in it (names, emails, phone numbers,
SSNs, cards, and so on), and gives the document back with that information either **blacked out**
or **swapped for realistic fake data**. It has three parts: a web app, a backend service that does the
detection, and a Chrome extension that intercepts file uploads on other websites.

> **Status legend:** built and tested = ✅, built but not fully verified = 🟡, not built yet = ⬜

---

## The big picture

```
 Web app (React) ──┐
                   ├──►  FastAPI backend ──►  detection pipeline ──►  redacted file
 Chrome extension ─┘      (login, uploads,       (Presidio + optional
   (not wired up yet)      batches, status)        GLiNER AI check)
```

The core promise: **upload a file, get back a safe-to-share version.** Everything else supports that.

---

## 1. The detection pipeline (the interesting part)

A file goes through five steps. Each step is a small, separate piece of code.

```
file → scrapeText → find_pii → rescan (AI mode only) → handle_replacement → cleaned .txt
```

### Step 1: read the file (`scraper.py`) 🟡
Detects the real file type from its bytes (not just the extension) and pulls the text out of
PDF, DOCX, TXT and MD files.

### Step 2: the prefilter (`prefilter.py`) ✅
This is **script mode**: fast, rule-based detection using
[Microsoft Presidio](https://microsoft.github.io/presidio/) plus our own recognizers.

- Presidio handles phone numbers, SSNs, emails, credit cards (checksum-validated), IBANs, IPs and
  names (via a spaCy language model).
- We added our own recognizers for **passwords** ("password: X", "pwd is X"), **usernames**
  ("username: X", "@handle", skipping emails) and **dates of birth**.
- Every finding is a plain dictionary with the same shape everywhere in the code:
  `entity_type`, `start`/`end` character offsets, a confidence `score`, the matched `text`, and an `id`.

### Step 3: the AI check (`model_scan.py`) 🟡
This is **AI mode**. It runs script mode first, then re-checks the results with a local
[GLiNER](https://github.com/urchade/GLiNER) model (`nvidia/gliner-PII`), a small zero-shot entity
recognizer that runs on your own machine. It does three things:

1. **Confirms** findings the model agrees with.
2. **Drops** weak findings the model doesn't back up. Names are the main false-positive risk.
   Emails, cards, IPs and IBANs are trusted because they're format- or checksum-validated.
3. **Adds** PII the rules missed.

Long documents are scanned in overlapping windows, because GLiNER silently ignores everything past its
word limit.

No text is sent to an outside AI service. The AI layer is a local model.

### Step 4: consistent fake data (`prefilter.py` ids, `redact.py`) ✅
In **replace mode**, the same real value always gets the same id (`PERSON_1`, `PERSON_2`, ...). The
match ignores case and spacing, and for phone numbers and SSNs it compares digits only. So
"John Smith" and "JOHN SMITH" become the same fake person everywhere in the document, and
`555-123-4567` and `(555) 123 4567` become the same fake number. The document still reads
coherently.

Fake data is generated per type: Luhn-valid fake card numbers, fake SSNs in an unassigned range,
`example.com` emails, `555` phone numbers, and so on.

In **redact mode**, each finding becomes a mask of the same length, like `[----------]`.

### Step 5: splice it back (`orchestrator/handle_replacement.py`) ✅
Detectors can disagree and report overlapping spans. We merge overlaps into one span first, so no part of
the PII is left behind. Then we replace from the end of the text backwards, so earlier character offsets
stay valid.

### The two toggles
| | Script mode | AI mode |
| --- | --- | --- |
| Detection | Presidio rules + spaCy | Script mode, then a local GLiNER check on top |

| | Redact mode | Replace mode |
| --- | --- | --- |
| Output | `[-----]` masks | Consistent fake values |

Any detection mode combines with any output mode. The user picks both on the upload page.

### Measuring it (`evaluate.py`) 🟡
An evaluation script scores the pipeline against the public `ai4privacy/pii-masking-300k` dataset.
It uses **F2** (recall counts twice as much as precision), because missing PII is worse than
over-redacting. It reports row-level, strict per-type, and "any-type" scores. *Run it and put the
real numbers in the presentation. This writeup doesn't quote any.*

---

## 2. The backend (FastAPI + SQLite) ✅

Standard FastAPI app. The parts worth explaining:

### Upload → process → poll → download
This is the whole product loop:

1. `POST /api/redact/multiple` receives up to 20 files (50 MB total). Files are streamed to disk in
   1 MB chunks and hashed (SHA-256) as they stream. If one file in the batch is bad, the whole
   batch is rolled back.
2. The request returns **immediately** (HTTP 202) with a `batch_id` and each file marked `processing`.
3. A **background task** runs the pipeline on each file and commits after each one, so progress is
   visible as it happens.
4. The client polls `GET /api/redact/batches/{batch_id}` until every file is `completed` or `failed`.
5. `GET /api/redact/{id}/download` returns the redacted file.

Why background processing? AI mode loads a model and can be slow. Holding an HTTP request open would
time out, and the browser extension needs a way to "wait for the files to be returned" anyway.
Polling a batch id is simple and works for both the web app and the extension.

### Original files are deleted
As soon as processing finishes, **the original upload is deleted from disk**, whether it succeeded or
failed. Only the redacted copy remains.

### Accounts and security
- Email and password accounts. Passwords are hashed with **Argon2**. Login returns a **JWT**.
- **Every API route requires a login**, enforced once at the router level so a new route can't
  forget it. Only health, login and signup are open.
- Users can only see their own files and batches. Asking for someone else's returns 404 rather than 403,
  so IDs don't leak what exists.
- A default dev account is seeded on startup (`admin@example.com`). It's configurable and can be
  switched off.

### Small design choices
- **Database:** SQLite through SQLAlchemy. A small startup helper adds new columns to existing
  databases, so schema changes don't need migrations during the hackathon.
- **Modes are stored on each file's row**, so the pipeline reads exactly what the user selected.
- **Heavy models load lazily:** spaCy and GLiNER only load when the first file is processed, so
  the API starts instantly.

---

## 3. The web app (React + Mantine) ✅

- **Home page** that explains the product and has the extension link (a placeholder for now) and the
  privacy statement.
- **Separate login and signup pages**, and a route guard on everything else.
- **Redaction page:**
  - drag-and-drop with a live counter ("3 of 20 files · 12 MB of 50 MB") and a progress bar,
  - the Script/AI and Redact/Replace toggles,
  - after upload, a results list that polls the batch and shows a spinner, then a **Download** button
    per file.
- The theme is Mantine `lime.6`, set in one file.

---

## 4. The browser extension 🟡

The extension already exists and works on its own:

- It intercepts file uploads on **any website** (file inputs, drag-and-drop, paste), before the page
  sees the file.
- It scans with its own **local regex detectors** (emails, phones, SSNs, Luhn-checked cards,
  mod-97-checked IBANs, and more), including Office files (it unzips, redacts the text, and re-zips).
- Today it works **entirely in the browser; nothing leaves the machine**.

**It is not connected to the backend yet.** The plan is for it to offer to send the file to the
PiiShooter service, wait for the batch to finish, and swap the cleaned file into the page. The backend side
of that already exists (batch ids and polling). The missing pieces are extension login (it can't use the
web app's stored token), CORS for the extension's origin, and a decision about when it uses the
local scan versus the full service.

---

## 5. Honest status and known gaps

| Area | Status |
| --- | --- |
| Accounts, auth, every route protected | ✅ |
| Upload, batches, background processing, status polling | ✅ |
| Script mode + redact/replace end to end (tested) | ✅ |
| AI mode end to end | 🟡 code is wired, but not run here |
| Original files deleted after processing | ✅ |
| **Redacted files are still kept** after download | ⬜ conflicts with the privacy promise |
| **Output is always `.txt`**; PDF/DOCX come back as text | ⬜ needs per-format writers |
| Extension ↔ backend integration | ⬜ |
| Jobs interrupted by a server restart stay `processing` forever | ⬜ |
| DOCX text extraction glues paragraphs together | ⬜ may hurt detection |

### The privacy promise needs backing
The home page says we **never keep your data, never train on it, and never sell it.** Today the
redacted copy stays on disk, and the database keeps filenames and file hashes. Before we say
"never keep" in a submission, we should either delete the redacted file after download (or after a short
time limit) or reword the claim to match. If AI mode ever calls an outside provider, that provider's
retention and training terms matter too. Today the AI layer is a local model, which is a good
point to make.

---

## Ideas for the presentation

**Strong stories to tell**
1. **Two-layer detection.** Fast rules first, then a local AI check that both removes false
   positives and catches misses. We tuned for recall (F2) on purpose.
2. **Consistent fake data.** The replaced document still makes sense: the same person is always the
   same fake person. This is the feature people remember.
3. **Local-first privacy.** No third-party AI API. The extension scans in the browser, and the AI check runs on our own server.
4. **Catching the leak at the source.** The extension stops sensitive files before a site ever receives them.

**Good live-demo flow:** upload a messy document in the web app → toggle AI + Replace → watch the
status spinner → download → show before and after side by side.

**Numbers to collect before presenting:** the evaluation scores (precision, recall, F2) for script
mode versus AI mode, and processing time per file.
