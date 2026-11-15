// Intercepts files handed to the page (file picker, drag-and-drop, paste) and pasted text,
// scans them for PII, and lets the user redact before the page sees them.
(function () {
  'use strict';
  if (window.__piiUploadFilter) return;
  window.__piiUploadFilter = true;

  const D = globalThis.PIIDetectors;
  const S = globalThis.PIIScanner;

  const DEFAULT_SETTINGS = {
    mode: 'ask',               // 'ask' = show dialog, 'auto' = redact silently and show a notice
    enabled: { ...D.DEFAULT_ENABLED },
    stripMetadata: true,       // clear author names from Office document properties
    warnUnsupported: true,     // tell the user when a document (e.g. PDF) couldn't be checked
    checkPaste: true,          // also check text pasted into inputs and editors
    disabledSites: [],
  };
  const LABELS = Object.fromEntries(D.DETECTORS.map((d) => [d.id, d.label]));
  LABELS.METADATA = 'Author name (document properties)';

  let settings = DEFAULT_SETTINGS;
  const ready = chrome.storage.sync.get('settings').then(({ settings: s }) => {
    settings = mergeSettings(s);
  }).catch(() => {});
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && changes.settings) settings = mergeSettings(changes.settings.newValue);
  });
  function mergeSettings(s) {
    return { ...DEFAULT_SETTINGS, ...(s || {}), enabled: { ...DEFAULT_SETTINGS.enabled, ...((s && s.enabled) || {}) } };
  }
  const siteDisabled = () => settings.disabledSites.includes(location.hostname);

  // Media files are passed straight through; everything else gets inspected.
  const isMedia = (f) => /^(image|video|audio)\//.test(f.type);
  const needsInspection = (files) => !siteDisabled() && files.some((f) => !isMedia(f));

  /** Returns the files to hand to the page, or null if the upload was cancelled. */
  async function processFiles(files) {
    await ready;
    if (siteDisabled()) return files;
    const results = await Promise.all(files.map((f) => (isMedia(f)
      ? { file: f, status: 'clean', findings: [] }
      : S.scanFile(f, settings))));
    const withPII = results.filter((r) => r.status === 'pii');
    const unchecked = settings.warnUnsupported ? results.filter((r) => r.status === 'unsupported') : [];
    if (!withPII.length && !unchecked.length) return files;

    let choice;
    if (settings.mode === 'auto' && !unchecked.length) {
      choice = 'redact';
      const total = withPII.reduce((n, r) => n + r.findings.length, 0);
      toast(`PiiShooter redacted ${total} item${total === 1 ? '' : 's'} from ${withPII.map((r) => r.file.name).join(', ')}`);
    } else {
      choice = await showFileDialog(results);
    }
    if (choice === 'cancel') return null;
    if (choice === 'original') return files;
    return Promise.all(results.map((r) => (r.status === 'pii' ? r.redact() : r.file)));
  }

  // ---- Interception -------------------------------------------------------

  const ours = new WeakSet();   // events we dispatched ourselves
  const busy = new WeakSet();   // file inputs currently being processed
  const watchedRoots = new WeakSet();

  function dispatchOurs(target, ev) {
    ours.add(ev);
    target.dispatchEvent(ev);
  }

  // <input type="file">: Chrome fires `input` then `change`. We swallow both,
  // scan, then put the (possibly redacted) files back and re-fire them.
  function onFileInput(e) {
    if (ours.has(e)) return;
    const el = e.composedPath()[0];
    if (!(el instanceof HTMLInputElement) || el.type !== 'file') return;
    if (busy.has(el)) { e.stopImmediatePropagation(); return; }
    const files = Array.from(el.files || []);
    if (!files.length || !needsInspection(files)) return;

    e.stopImmediatePropagation();
    busy.add(el);
    // `change` isn't composed, so it won't reach window from inside a shadow root.
    const root = el.getRootNode();
    if (root instanceof ShadowRoot && !watchedRoots.has(root)) {
      watchedRoots.add(root);
      root.addEventListener('change', onFileInput, true);
      root.addEventListener('input', onFileInput, true);
    }

    processFiles(files).then((result) => {
      if (result === null) { el.value = ''; return; }
      const dt = new DataTransfer();
      result.forEach((f) => dt.items.add(f));
      el.files = dt.files;
      dispatchOurs(el, new Event('input', { bubbles: true, composed: true }));
      dispatchOurs(el, new Event('change', { bubbles: true }));
    }).catch((err) => console.error('[PiiShooter]', err))
      .finally(() => busy.delete(el));
  }
  window.addEventListener('input', onFileInput, true);
  window.addEventListener('change', onFileInput, true);

  // Drag-and-drop and paste: swallow the event, scan, then re-dispatch a copy
  // carrying the processed files to the original target.
  function interceptTransfer(e, getTransfer, makeEvent) {
    if (ours.has(e)) return;
    const transfer = getTransfer(e);
    const files = Array.from((transfer && transfer.files) || []);
    if (!files.length || !needsInspection(files)) return;

    e.preventDefault();
    e.stopImmediatePropagation();
    const target = e.composedPath()[0];
    processFiles(files).then((result) => {
      if (result === null) return;
      const dt = new DataTransfer();
      result.forEach((f) => dt.items.add(f));
      dispatchOurs(target, makeEvent(e, dt));
    }).catch((err) => console.error('[PiiShooter]', err));
  }

  window.addEventListener('drop', (e) => interceptTransfer(e, (ev) => ev.dataTransfer, (ev, dt) => new DragEvent('drop', {
    bubbles: true, cancelable: true, composed: true, dataTransfer: dt,
    clientX: ev.clientX, clientY: ev.clientY, screenX: ev.screenX, screenY: ev.screenY,
    ctrlKey: ev.ctrlKey, shiftKey: ev.shiftKey, altKey: ev.altKey, metaKey: ev.metaKey,
  })), true);

  window.addEventListener('paste', (e) => {
    if (ours.has(e)) return;
    if (e.clipboardData && e.clipboardData.files.length) {
      interceptTransfer(e, (ev) => ev.clipboardData, (ev, dt) => new ClipboardEvent('paste', {
        bubbles: true, cancelable: true, composed: true, clipboardData: dt,
      }));
    } else {
      interceptTextPaste(e);
    }
  }, true);

  // ---- Pasted text ----------------------------------------------------------
  // Text pastes are checked synchronously (findPII is plain regex), so the paste is only
  // blocked when something was actually found. The page then gets a synthetic paste with the
  // chosen text; if nothing on the page handles it, we insert the text like a normal paste.

  const TEXT_INPUT = /^(text|search|email|url|tel|password)$/;
  function isEditable(node) {
    if (node instanceof HTMLTextAreaElement) return !node.readOnly && !node.disabled;
    if (node instanceof HTMLInputElement) return TEXT_INPUT.test(node.type) && !node.readOnly && !node.disabled;
    return node instanceof HTMLElement && node.isContentEditable;
  }

  /** Remember where the caret was, so the paste lands there after the dialog takes focus. */
  function saveCaret(target) {
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
      let start = null;
      let end = null;
      try { start = target.selectionStart; end = target.selectionEnd; } catch (_) { /* e.g. type=email */ }
      return () => {
        target.focus();
        try { if (start !== null) target.setSelectionRange(start, end); } catch (_) { /* unsupported type */ }
      };
    }
    let editingHost = target;
    while (editingHost.parentElement && editingHost.parentElement.isContentEditable) editingHost = editingHost.parentElement;
    const sel = getSelection();
    const range = sel && sel.rangeCount ? sel.getRangeAt(0).cloneRange() : null;
    return () => {
      editingHost.focus();
      if (!range) return;
      const s = getSelection();
      s.removeAllRanges();
      s.addRange(range);
    };
  }

  function interceptTextPaste(e) {
    if (!settings.checkPaste || siteDisabled() || !e.clipboardData) return;
    const target = e.composedPath()[0];
    if (!isEditable(target)) return;
    const text = e.clipboardData.getData('text/plain');
    if (!text) return;
    const findings = D.findPII(text, settings.enabled);
    if (!findings.length) return;

    e.preventDefault();
    e.stopImmediatePropagation();
    // clipboardData can't be read after the event, so copy every format now (for "paste original").
    const original = e.clipboardData.types
      .filter((t) => t !== 'Files')
      .map((t) => [t, e.clipboardData.getData(t)]);
    const redacted = D.redactText(text, findings);
    const restoreCaret = saveCaret(target);

    let decision;
    if (settings.mode === 'auto') {
      toast(`PiiShooter redacted ${findings.length} item${findings.length === 1 ? '' : 's'} from your paste`);
      decision = Promise.resolve('redact');
    } else {
      decision = showPasteDialog(findings, redacted);
    }
    decision.then((choice) => {
      restoreCaret();
      if (choice === 'cancel') return;
      const formats = choice === 'redact' ? [['text/plain', redacted]] : original;
      deliverPaste(target, formats, choice === 'redact' ? redacted : text);
    }).catch((err) => console.error('[PiiShooter]', err));
  }

  function deliverPaste(target, formats, plain) {
    const dt = new DataTransfer();
    for (const [type, data] of formats) dt.setData(type, data);
    const ev = new ClipboardEvent('paste', { bubbles: true, cancelable: true, composed: true, clipboardData: dt });
    dispatchOurs(target, ev);
    // Rich editors handle paste themselves and call preventDefault. Plain fields don't,
    // and a synthetic paste has no default action, so insert the text (keeps undo working).
    if (!ev.defaultPrevented && !document.execCommand('insertText', false, plain)
      && (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) {
      target.setRangeText(plain, target.selectionStart ?? 0, target.selectionEnd ?? 0, 'end');
      target.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertFromPaste', data: plain }));
    }
  }

  // ---- UI -----------------------------------------------------------------
  // Same look as the PiiShooter website (Mantine defaults, lime primary), light and dark.

  const STYLE = `
    :host { all: initial; }
    .root {
      --primary: #82c91e; --primary-hover: #74b816; --on-primary: #000;
      --body: #fff; --text: #000; --dimmed: #868e96; --border: #dee2e6; --surface: #f8f9fa;
      --button: #fff; --button-hover: #f8f9fa; --button-border: #ced4da;
      --red: #e03131; --red-bg: #fff5f5; --orange: #e8590c; --green: #2f9e44;
      --radius: 8px; --shadow: 0 1px 3px rgba(0,0,0,.05), 0 20px 25px -5px rgba(0,0,0,.05), 0 10px 10px -5px rgba(0,0,0,.04);
      font: 14px/1.45 Barlow, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color: var(--text);
    }
    @media (prefers-color-scheme: dark) {
      .root {
        --body: #242424; --text: #c9c9c9; --dimmed: #828282; --border: #424242; --surface: #2e2e2e;
        --button: #2e2e2e; --button-hover: #3b3b3b; --button-border: #424242;
        --red: #ff8787; --red-bg: rgba(250,82,82,.12); --orange: #ffa94d; --green: #69db7c;
        --shadow: 0 20px 40px rgba(0,0,0,.5);
      }
    }
    .backdrop { position: fixed; inset: 0; background: rgba(0,0,0,.6); display: flex;
      align-items: center; justify-content: center; z-index: 2147483647; }
    .dialog { background: var(--body); border: 1px solid var(--border); border-radius: 12px; width: min(520px, calc(100vw - 32px));
      max-height: calc(100vh - 48px); overflow: auto; box-shadow: var(--shadow); }
    header { padding: 18px 20px 4px; }
    .brand { font-size: 13px; font-weight: 800; color: var(--dimmed); margin-bottom: 8px; }
    .brand b { color: var(--primary); font-weight: 800; }
    h2 { margin: 0 0 2px; font-size: 18px; font-weight: 700; }
    .sub { color: var(--dimmed); font-size: 13px; }
    .body { padding: 4px 20px 0; }
    ul.files { list-style: none; margin: 0; padding: 0; }
    .item { border: 1px solid var(--border); border-radius: var(--radius); padding: 10px 12px; margin: 10px 0; }
    .name { font-weight: 600; word-break: break-all; }
    .status { font-size: 13px; margin-top: 2px; }
    .pii { color: var(--red); } .warn { color: var(--orange); } .ok { color: var(--green); }
    ul.items { margin: 6px 0 0; padding-left: 18px; font-size: 13px; color: var(--dimmed); }
    code { font: 12px ui-monospace, Menlo, monospace; background: var(--surface); color: var(--text); padding: 1px 5px; border-radius: 4px; }
    .preview { font: 12px/1.5 ui-monospace, Menlo, monospace; background: var(--surface); border-radius: var(--radius);
      padding: 8px 10px; margin-top: 8px; white-space: pre-wrap; word-break: break-word; max-height: 140px; overflow: auto; }
    .preview mark { background: var(--red-bg); color: var(--red); border-radius: 3px; padding: 0 2px; }
    footer { display: flex; gap: 8px; justify-content: flex-end; padding: 14px 20px 18px; flex-wrap: wrap; }
    button { font: inherit; font-size: 14px; font-weight: 600; height: 36px; border-radius: var(--radius); padding: 0 16px; cursor: pointer;
      border: 1px solid var(--button-border); background: var(--button); color: var(--text); }
    button:hover { background: var(--button-hover); }
    button.primary { background: var(--primary); border-color: var(--primary); color: var(--on-primary); }
    button.primary:hover { background: var(--primary-hover); border-color: var(--primary-hover); }
    button:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }
    .toast { position: fixed; right: 16px; bottom: 16px; z-index: 2147483647; display: flex; gap: 10px; align-items: flex-start;
      background: var(--body); color: var(--text); border: 1px solid var(--border); border-radius: var(--radius);
      padding: 12px 14px; max-width: 360px; box-shadow: var(--shadow); font-size: 14px; }
    .toast::before { content: ""; flex: none; width: 4px; align-self: stretch; border-radius: 4px; background: var(--primary); }
  `;

  function mount() {
    const host = document.createElement('piishooter-dialog');
    const shadow = host.attachShadow({ mode: 'closed' });
    const style = document.createElement('style');
    style.textContent = STYLE;
    const root = document.createElement('div');
    root.className = 'root';
    shadow.append(style, root);
    (document.body || document.documentElement).appendChild(host);
    return { host, root };
  }

  function el(tag, attrs = {}, ...children) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    for (const c of children) n.append(c);
    return n;
  }

  function summarize(findings) {
    const counts = {};
    for (const f of findings) counts[f.type] = (counts[f.type] || 0) + 1;
    return Object.entries(counts).map(([t, n]) => `${n} × ${LABELS[t] || t}`).join(', ');
  }

  function findingList(findings) {
    const items = el('ul', { class: 'items' });
    findings.slice(0, 6).forEach((f) => items.append(
      el('li', {}, `${LABELS[f.type] || f.type}: `, el('code', {}, D.maskForDisplay(f.value)))));
    if (findings.length > 6) items.append(el('li', {}, `…and ${findings.length - 6} more`));
    return items;
  }

  /**
   * Modal dialog. `buttons` is [[choice, label, primary?], ...]; the last one gets focus.
   * Resolves with the chosen value, or 'cancel' on Escape.
   */
  function openDialog({ title, sub, body, buttons }) {
    return new Promise((resolve) => {
      const { host, root } = mount();
      const footer = el('footer');
      const btns = buttons.map(([choice, label, primary]) => {
        const b = el('button', primary ? { class: 'primary' } : {}, label);
        b.addEventListener('click', () => done(choice));
        footer.append(b);
        return b;
      });
      const dialog = el('div', { class: 'dialog', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'pii-title' },
        el('header', {},
          el('div', { class: 'brand' }, el('b', {}, 'pii'), '{shooter}'),
          el('h2', { id: 'pii-title' }, title),
          el('div', { class: 'sub' }, sub)),
        el('div', { class: 'body' }, body),
        footer);
      root.append(el('div', { class: 'backdrop' }, dialog));

      function done(choice) {
        window.removeEventListener('keydown', onKey, true);
        host.remove();
        resolve(choice);
      }
      function onKey(e) { if (e.key === 'Escape') { e.stopPropagation(); done('cancel'); } }
      window.addEventListener('keydown', onKey, true);
      btns[btns.length - 1].focus();
    });
  }

  function showFileDialog(results) {
    const anyPII = results.some((r) => r.status === 'pii');
    const list = el('ul', { class: 'files' });
    for (const r of results) {
      const li = el('li', { class: 'item' }, el('div', { class: 'name' }, r.file.name));
      if (r.status === 'pii') {
        li.append(el('div', { class: 'status pii' }, `Found ${summarize(r.findings)}`), findingList(r.findings));
      } else if (r.status === 'unsupported') {
        li.append(el('div', { class: 'status warn' }, `Not checked: ${r.reason}. It will upload as-is.`));
      } else {
        li.append(el('div', { class: 'status ok' }, 'No personal information found'));
      }
      list.append(li);
    }
    const buttons = [['cancel', 'Cancel upload'], ['original', anyPII ? 'Upload original' : 'Upload anyway', !anyPII]];
    if (anyPII) buttons.push(['redact', 'Redact & upload', true]);
    return openDialog({
      title: anyPII ? 'Personal information found in your upload' : 'Some files couldn’t be checked',
      sub: `You're uploading to ${location.hostname || 'this page'}.`,
      body: list,
      buttons,
    });
  }

  function showPasteDialog(findings, redacted) {
    // Preview of what will be pasted, with each redaction highlighted. Long text is cut short.
    const preview = el('div', { class: 'preview' });
    const shown = redacted.length > 600 ? `${redacted.slice(0, 600)}…` : redacted;
    shown.split(/(\[REDACTED:[A-Z_]+\])/).forEach((part, i) => preview.append(i % 2 ? el('mark', {}, part) : part));
    const box = el('div', { class: 'item' },
      el('div', { class: 'status pii' }, `Found ${summarize(findings)}`),
      findingList(findings),
      preview);
    return openDialog({
      title: 'Personal information in your paste',
      sub: `You're pasting into ${location.hostname || 'this page'}. The highlighted parts will be removed.`,
      body: box,
      buttons: [['cancel', 'Cancel'], ['original', 'Paste original'], ['redact', 'Paste redacted', true]],
    });
  }

  function toast(message) {
    const { host, root } = mount();
    root.append(el('div', { class: 'toast', role: 'status' }, message));
    setTimeout(() => host.remove(), 5000);
  }
})();
