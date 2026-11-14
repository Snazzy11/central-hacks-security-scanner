// Intercepts files handed to the page (file picker, drag-and-drop, paste),
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
      toast(`PII Upload Filter redacted ${total} item${total === 1 ? '' : 's'} from ${withPII.map((r) => r.file.name).join(', ')}`);
    } else {
      choice = await showDialog(results);
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
    }).catch((err) => console.error('[PII Upload Filter]', err))
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
    }).catch((err) => console.error('[PII Upload Filter]', err));
  }

  window.addEventListener('drop', (e) => interceptTransfer(e, (ev) => ev.dataTransfer, (ev, dt) => new DragEvent('drop', {
    bubbles: true, cancelable: true, composed: true, dataTransfer: dt,
    clientX: ev.clientX, clientY: ev.clientY, screenX: ev.screenX, screenY: ev.screenY,
    ctrlKey: ev.ctrlKey, shiftKey: ev.shiftKey, altKey: ev.altKey, metaKey: ev.metaKey,
  })), true);

  window.addEventListener('paste', (e) => interceptTransfer(e, (ev) => ev.clipboardData, (ev, dt) => new ClipboardEvent('paste', {
    bubbles: true, cancelable: true, composed: true, clipboardData: dt,
  })), true);

  // ---- UI -----------------------------------------------------------------

  const STYLE = `
    :host { all: initial; }
    .backdrop { position: fixed; inset: 0; background: rgba(15,23,42,.45); display: flex;
      align-items: center; justify-content: center; z-index: 2147483647;
      font: 14px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif; color: #0f172a; }
    .dialog { background: #fff; border-radius: 12px; width: min(520px, calc(100vw - 32px));
      max-height: calc(100vh - 48px); overflow: auto; box-shadow: 0 20px 50px rgba(0,0,0,.3); }
    header { padding: 18px 20px 6px; }
    h2 { margin: 0 0 4px; font-size: 17px; }
    .sub { color: #475569; font-size: 13px; }
    ul.files { list-style: none; margin: 8px 0 0; padding: 0 20px; }
    li.file { border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 12px; margin: 8px 0; }
    .name { font-weight: 600; word-break: break-all; }
    .status { font-size: 13px; margin-top: 2px; }
    .pii { color: #b91c1c; } .warn { color: #a16207; } .ok { color: #15803d; }
    ul.items { margin: 6px 0 0; padding-left: 18px; font-size: 12.5px; color: #334155; }
    code { font: 12px ui-monospace, Menlo, monospace; background: #f1f5f9; padding: 1px 4px; border-radius: 4px; }
    footer { display: flex; gap: 8px; justify-content: flex-end; padding: 14px 20px 18px; flex-wrap: wrap; }
    button { font: inherit; border-radius: 8px; padding: 8px 14px; cursor: pointer; border: 1px solid #cbd5e1; background: #fff; color: #0f172a; }
    button:hover { background: #f8fafc; }
    button.primary { background: #1d4ed8; border-color: #1d4ed8; color: #fff; }
    button.primary:hover { background: #1e40af; }
    button:focus-visible { outline: 2px solid #60a5fa; outline-offset: 2px; }
    .toast { position: fixed; right: 16px; bottom: 16px; z-index: 2147483647; background: #0f172a; color: #fff;
      padding: 10px 14px; border-radius: 8px; font: 13px system-ui, sans-serif; max-width: 360px; box-shadow: 0 8px 24px rgba(0,0,0,.25); }
  `;

  function mount() {
    const host = document.createElement('pii-upload-filter');
    const shadow = host.attachShadow({ mode: 'closed' });
    const style = document.createElement('style');
    style.textContent = STYLE;
    shadow.appendChild(style);
    (document.body || document.documentElement).appendChild(host);
    return { host, shadow };
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

  function showDialog(results) {
    return new Promise((resolve) => {
      const { host, shadow } = mount();
      const anyPII = results.some((r) => r.status === 'pii');
      const list = el('ul', { class: 'files' });
      for (const r of results) {
        const li = el('li', { class: 'file' }, el('div', { class: 'name' }, r.file.name));
        if (r.status === 'pii') {
          li.append(el('div', { class: 'status pii' }, `Found ${summarize(r.findings)}`));
          const items = el('ul', { class: 'items' });
          r.findings.slice(0, 6).forEach((f) => items.append(
            el('li', {}, `${LABELS[f.type] || f.type}: `, el('code', {}, D.maskForDisplay(f.value)))));
          if (r.findings.length > 6) items.append(el('li', {}, `…and ${r.findings.length - 6} more`));
          li.append(items);
        } else if (r.status === 'unsupported') {
          li.append(el('div', { class: 'status warn' }, `Not checked: ${r.reason}. It will upload as-is.`));
        } else {
          li.append(el('div', { class: 'status ok' }, 'No personal information found'));
        }
        list.append(li);
      }

      const cancel = el('button', {}, 'Cancel upload');
      const original = el('button', {}, anyPII ? 'Upload original' : 'Upload anyway');
      const redact = el('button', { class: 'primary' }, 'Redact & upload');
      const footer = el('footer', {}, cancel, original);
      if (anyPII) footer.append(redact);

      const dialog = el('div', { class: 'dialog', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'pii-title' },
        el('header', {},
          el('h2', { id: 'pii-title' }, anyPII ? 'Personal information found in your upload' : 'Some files couldn’t be checked'),
          el('div', { class: 'sub' }, `You're uploading to ${location.hostname || 'this page'}.`)),
        list, footer);
      const backdrop = el('div', { class: 'backdrop' }, dialog);
      shadow.append(backdrop);

      const done = (choice) => {
        window.removeEventListener('keydown', onKey, true);
        host.remove();
        resolve(choice);
      };
      const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); done('cancel'); } };
      window.addEventListener('keydown', onKey, true);
      cancel.addEventListener('click', () => done('cancel'));
      original.addEventListener('click', () => done('original'));
      redact.addEventListener('click', () => done('redact'));
      (anyPII ? redact : original).focus();
    });
  }

  function toast(message) {
    const { host, shadow } = mount();
    shadow.append(el('div', { class: 'toast', role: 'status' }, message));
    setTimeout(() => host.remove(), 5000);
  }
})();
