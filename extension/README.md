# PII Upload Filter (Chrome extension, Manifest V3)

Scans files before a web page receives them and lets you redact personal information first.

**Catches uploads from:** `<input type="file">` (including inside shadow DOM), drag-and-drop, and pasted files.
**Inspects:** plain text formats (txt, csv, json, md, html, xml, log, eml, vcf, …) and Office files (.docx, .xlsx, .pptx), all processed locally. Nothing leaves the browser.
**Detects:** emails, phone numbers, US SSNs, payment cards (Luhn-checked), IBANs (mod-97-checked), dates of birth (when labelled), IPv4 addresses. Also clears author names from Office document properties.

## Install (developer mode)
1. Open `chrome://extensions` and turn on **Developer mode**.
2. Click **Load unpacked** and pick this folder.
3. Open a page with an upload box (or serve `test/manual/upload-test.html`: `cd test/manual && python3 -m http.server`) and upload `sample.txt` or `sample.docx`.

For local `file://` pages, turn on "Allow access to file URLs" on the extension's details page.

## How it works
- `src/content.js` runs at `document_start` in every frame and registers capture-phase listeners on `window` for `input`/`change`/`drop`/`paste`, so it runs before the page's own handlers. It stops the event, scans the files, then either:
  - puts the redacted files back on the input (`input.files = dataTransfer.files`) and re-fires `input` + `change`, or
  - re-dispatches a synthetic `drop`/`paste` carrying the redacted files to the original target.
  On cancel, the page never sees the file.
- `src/detectors.js`: regex detectors with validation and overlap resolution. Add new PII types to the `DETECTORS` array, and they show up in the popup automatically.
- `src/office.js`: for Office files it unzips, joins the text runs of each paragraph (so PII split across formatting runs is still found), redacts, and re-zips. `src/zip.js` is a small zip reader/writer built on the browser's native `CompressionStream`, so there are no dependencies.
- `popup/`: settings (ask vs. auto-redact, which detectors, per-site on/off), stored in `chrome.storage.sync`.

Images, audio and video are passed through untouched without interception.

## Tests
```
node --test test/*.test.js
```

## Known limitations / next steps
- **PDFs aren't redacted.** The user is warned that the file wasn't checked. Real PDF redaction needs pdf.js for text extraction plus rewriting the content streams (or rasterizing pages). Bundling pdf.js (and something like pdf-lib) is the natural next step.
- **Scanned images / photos of documents** would need OCR (e.g. Tesseract.js).
- **Names and street addresses** aren't detected, because regex can't reliably find them. A small on-device NER model (e.g. via transformers.js) is the way to add these.
- xlsx numeric cells (e.g. a phone number stored as a number) aren't scanned, because replacing them with text would change the cell type.
- Uploads that never go through a file input, drop or paste (e.g. `showOpenFilePicker()`) aren't intercepted. Neither are sites that check `event.isTrusted` on the re-fired events, which is rare.
- Regex detection will have some false positives and false negatives. Treat this as a safety net, not a guarantee.



FUTURE ENDPOINT:
/api/redact/single (multiple)