(async function () {
  'use strict';
  const D = globalThis.PIIDetectors;
  const { SITE_URL } = globalThis.PIIConfig;
  const $ = (id) => document.getElementById(id);

  const DEFAULTS = {
    mode: 'ask', enabled: { ...D.DEFAULT_ENABLED }, stripMetadata: true, warnUnsupported: true,
    checkPaste: true, disabledSites: [],
  };
  const MODE_HINTS = {
    ask: 'Shows what was found and lets you choose before anything is uploaded or pasted.',
    auto: 'Redacts straight away and shows a short notice.',
  };

  const openTab = (path) => chrome.tabs.create({ url: SITE_URL + path });
  const link = (id, path) => $(id).addEventListener('click', (e) => { e.preventDefault(); openTab(path); });
  link('openSite', '/');
  link('signIn', '/login');
  link('signUp', '/signup');
  link('installGuide', '/extension');

  // ---- Account (shared with the website, see src/site-bridge.js) ----------

  function renderAccount(auth) {
    $('signedOut').hidden = !!auth;
    $('signedIn').hidden = !auth;
    if (auth) {
      $('email').textContent = auth.email || 'Signed in';
      $('avatar').textContent = (auth.email || '?')[0].toUpperCase();
    }
  }

  /** Confirm the token still works and pick up the email. Keeps the session on network errors. */
  async function refreshAccount(auth) {
    if (!auth) return;
    try {
      const res = await fetch(`${SITE_URL}/api/auth/me`, { headers: { Authorization: `Bearer ${auth.token}` } });
      if (res.status === 401) {
        await chrome.storage.local.remove('auth');
      } else if (res.ok) {
        const me = await res.json();
        if (me.email !== auth.email) await chrome.storage.local.set({ auth: { ...auth, email: me.email } });
      }
    } catch (_) { /* site not reachable right now */ }
  }

  $('signOut').addEventListener('click', async () => {
    const { auth } = await chrome.storage.local.get('auth');
    // Remembering the token lets the site bridge sign the website out as well.
    await chrome.storage.local.set({ signedOutToken: auth?.token ?? null });
    await chrome.storage.local.remove('auth');
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.auth) renderAccount(changes.auth.newValue);
  });

  const { auth } = await chrome.storage.local.get('auth');
  renderAccount(auth);
  void refreshAccount(auth);

  // ---- Settings -----------------------------------------------------------

  const { settings: stored } = await chrome.storage.sync.get('settings');
  const settings = { ...DEFAULTS, ...(stored || {}), enabled: { ...DEFAULTS.enabled, ...((stored && stored.enabled) || {}) } };
  const save = () => chrome.storage.sync.set({ settings });

  let host = '';
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const url = new URL(tab.url);
    if (/^https?:$/.test(url.protocol)) host = url.hostname;
  } catch (_) { /* no URL access for some pages */ }
  const siteBox = $('siteEnabled');
  if (host) {
    $('host').textContent = host;
    siteBox.checked = !settings.disabledSites.includes(host);
    siteBox.addEventListener('change', () => {
      settings.disabledSites = settings.disabledSites.filter((h) => h !== host);
      if (!siteBox.checked) settings.disabledSites.push(host);
      save();
    });
  } else {
    $('siteRow').hidden = true;
  }

  const modeButtons = document.querySelectorAll('.seg button');
  const renderMode = () => {
    modeButtons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === settings.mode)));
    $('modeHint').textContent = MODE_HINTS[settings.mode];
  };
  modeButtons.forEach((b) => b.addEventListener('click', () => { settings.mode = b.dataset.mode; renderMode(); save(); }));
  renderMode();

  const makeSwitch = (text, checked, onChange) => {
    const label = document.createElement('label');
    label.className = 'switch';
    const name = document.createElement('span');
    name.textContent = text;
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = checked;
    box.addEventListener('change', () => onChange(box.checked));
    const track = document.createElement('span');
    track.className = 'track';
    label.append(name, box, track);
    return label;
  };
  for (const det of D.DETECTORS) {
    $('detectors').append(makeSwitch(det.label, settings.enabled[det.id] !== false, (on) => {
      settings.enabled[det.id] = on;
      save();
    }));
  }

  for (const key of ['checkPaste', 'stripMetadata', 'warnUnsupported']) {
    const box = $(key);
    box.checked = settings[key];
    box.addEventListener('change', () => { settings[key] = box.checked; save(); });
  }
})();
