# PiiShooter (Chrome extension, Manifest V3)

Checks files and pasted text before a web page receives them, and lets you redact personal information first. It uses the same detection as the PiiShooter web app (the backend does the work), and signs in with the same account.

**Catches uploads from:** `<input type="file">` (including inside shadow DOM), drag-and-drop, and pasted files.
**Catches pasted text** in text inputs, textareas and rich editors (contenteditable). It only steps in when the text contains PII.
**Checks:** PDF, Word (.docx), CSV and plain-text files (txt, md, json, html, xml, log, vcf, …). The extension and the web app both get the list from the server (`GET /api/redact/capabilities`), which takes it from `SUPPORTED_EXTENSIONS` in `backend/app/orchestrator/documents.py`.
**Finds:** whatever the backend finds: names, emails, phone numbers, SSNs, cards, bank numbers, IBANs, dates of birth, IP addresses, passwords and usernames. AI mode adds the backend's GLiNER check.

## What leaves the browser
While you're signed in, **uploads are sent to the PiiShooter server** to be checked, and so is pasted text once the local check has flagged it. The server cleans them and sends them back straight away. Nothing is saved, and these files don't show up in your history on the website.

When you're signed out, or the server can't be reached:
- Files aren't checked. You're told so before they upload (turn off **Warn about files that couldn't be checked** to skip that).
- Pasted text is still checked and redacted locally, with the regexes in `src/detectors.js`.

## Install (developer mode)
1. Open `chrome://extensions` and turn on **Developer mode**.
2. Click **Load unpacked** and pick this folder.
3. Start the app (`make dev` in the repo root) and sign in on the website.
4. Open a page with an upload box (or serve `test/manual/upload-test.html`: `cd test/manual && python3 -m http.server`) and upload `sample.txt` or `sample.docx`.

Needs Chrome 140 or newer. For local `file://` pages, turn on "Allow access to file URLs" on the extension's details page.

## Sign-in (linked to the website)
The extension uses the website's account. `src/site-bridge.js` runs only on the site (`SITE_URL` in `src/config.js`, `http://localhost:5173` in dev) and copies the site's login token into `chrome.storage.local`:
- Log in on the site → the extension is signed in. The popup's **Log in** button just opens the site's login page.
- Log out on the site → the extension signs out.
- **Log out** in the popup → the extension signs out, and the bridge also clears the site's token the next time the site is open (it remembers the signed-out token).

Scanning is turned off on the site itself, since the site already redacts files server-side.

When the site moves, update `SITE_URL` in `src/config.js` and the `http://localhost:5173/*` entries in `manifest.json`. The extension calls the API at `SITE_URL/api`.

## How it works
- `src/content.js` runs at `document_start` in every frame and registers capture-phase listeners on `window` for `input`/`change`/`drop`/`paste`, so it runs before the page's own handlers. It stops the event, has the files checked, then either:
  - puts the cleaned files back on the input (`input.files = dataTransfer.files`) and re-fires `input` + `change`, or
  - re-dispatches a synthetic `drop`/`paste` carrying the cleaned files to the original target.
  On cancel, the page never sees the file.
- `src/background.js` (service worker) makes every API call: `POST /api/redact/instant` for files, `POST /api/redact/text` for pasted text, and `GET /api/redact/capabilities` for the entity and file types. Content scripts can't call the API themselves, because their requests follow the page's CORS rules. The worker also keeps the login token out of web pages. Files travel to the worker as base64, because extension messages are JSON.
- **Pasted text:** the paste handler has to decide on the spot whether to block, so the local regexes in `src/detectors.js` make that call. Once a paste is blocked, the server redacts it (falling back to the local result after 5 seconds or if the server is unreachable). The user picks *Paste redacted / Paste original / Cancel* (or it's redacted automatically in auto mode), and a synthetic `paste` carrying the chosen text goes to the original target. If the page doesn't handle it (plain fields), the text is inserted with `execCommand('insertText')` so undo still works.
- `src/settings.js`: the settings and their defaults, shared by the content script and the popup. They live in `chrome.storage.sync`, and the sign-in lives in `chrome.storage.local`.
- `popup/`: account and settings (ask vs. auto-redact, script vs. AI mode, redact vs. replace with fake data, what to look for, pasted-text checks, per-site on/off). The **Look for** list comes from the server when you're signed in.

Images, audio and video are passed through untouched without interception.

## Tests
```
node --test test/*.test.js
```

## Known limitations / next steps
- **Pasted names aren't caught on their own.** The local check decides whether to block a paste, and regex can't find names. If a paste also contains something it does find (an email, say), the server's redaction covers the names too.
- **xlsx, pptx and .eml aren't checked** (they upload with a warning). Emails are left out because their bodies are often base64-encoded, which hides the PII from the detector. Add them to `documents.py` in the backend and both the web app and the extension get them.
- Files over 40 MB aren't checked, because a Chrome extension message is capped at 64 MiB and base64 adds a third.
- The first scan after the server starts can take a few seconds while it loads spaCy. AI mode takes longer still.
- **Scanned images / photos of documents** would need OCR.
- Uploads that never go through a file input, drop or paste (e.g. `showOpenFilePicker()`) aren't intercepted. Neither are sites that check `event.isTrusted` on the re-fired events, which is rare.
