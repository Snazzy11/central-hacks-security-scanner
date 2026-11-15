# PiiShooter (Chrome extension, Manifest V3)

Scans files and pasted text before a web page receives them and lets you redact personal information first. Styled to match the PiiShooter website, and signs in with the same account.

**Catches uploads from:** `<input type="file">` (including inside shadow DOM), drag-and-drop, and pasted files.
**Catches pasted text** in text inputs, textareas and rich editors (contenteditable). It only steps in when the text contains PII.
**Inspects:** plain text formats (txt, csv, json, md, html, xml, log, eml, vcf, …) and Office files (.docx, .xlsx, .pptx), all processed locally. Nothing leaves the browser.
**Detects:** emails, phone numbers, US SSNs, payment cards (Luhn-checked), IBANs (mod-97-checked), dates of birth (when labelled), IPv4 addresses. Also clears author names from Office document properties.

## Install (developer mode)
1. Open `chrome://extensions` and turn on **Developer mode**.
2. Click **Load unpacked** and pick this folder.
3. Open a page with an upload box (or serve `test/manual/upload-test.html`: `cd test/manual && python3 -m http.server`) and upload `sample.txt` or `sample.docx`.

For local `file://` pages, turn on "Allow access to file URLs" on the extension's details page.

## Sign-in (linked to the website)
The extension uses the website's account. `src/site-bridge.js` runs only on the site (`SITE_URL` in `src/config.js`, `http://localhost:5173` in dev) and copies the site's login token into `chrome.storage.local`:
- Log in on the site → the extension is signed in. The popup's **Log in** button just opens the site's login page.
- Log out on the site → the extension signs out.
- **Log out** in the popup → the extension signs out, and the bridge also clears the site's token the next time the site is open (it remembers the signed-out token).

The popup calls `GET /api/auth/me` with the token to show the email and drop expired tokens. Detection works the same whether or not you're signed in. Scanning is turned off on the site itself, since it redacts files server-side.

When the site moves, update `SITE_URL` in `src/config.js` and the `http://localhost:5173/*` entries in `manifest.json`.

## How it works
- `src/content.js` runs at `document_start` in every frame and registers capture-phase listeners on `window` for `input`/`change`/`drop`/`paste`, so it runs before the page's own handlers. It stops the event, scans the files, then either:
  - puts the redacted files back on the input (`input.files = dataTransfer.files`) and re-fires `input` + `change`, or
  - re-dispatches a synthetic `drop`/`paste` carrying the redacted files to the original target.
  On cancel, the page never sees the file.
- Pasted text is checked synchronously with the same detectors. When PII is found the paste is blocked, the user picks *Paste redacted / Paste original / Cancel* (or it's redacted automatically in auto mode), and a synthetic `paste` carrying the chosen text goes to the original target. If the page doesn't handle it (plain fields), the text is inserted with `execCommand('insertText')` so undo still works.
- `src/detectors.js`: regex detectors with validation and overlap resolution. Add new PII types to the `DETECTORS` array, and they show up in the popup automatically.
- `src/office.js`: for Office files it unzips, joins the text runs of each paragraph (so PII split across formatting runs is still found), redacts, and re-zips. `src/zip.js` is a small zip reader/writer built on the browser's native `CompressionStream`, so there are no dependencies.
- `popup/`: account and settings (ask vs. auto-redact, which detectors, pasted-text checks, per-site on/off). Settings live in `chrome.storage.sync`, the sign-in in `chrome.storage.local`.

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