(async function () {
  'use strict';
  const D = globalThis.PIIDetectors;
  const Settings = globalThis.PIISettings;
  const { SITE_URL } = globalThis.PIIConfig;
  const $ = (id) => document.getElementById(id);

  // Same wording as the web app's redaction page, where it applies.
  const HINTS = {
    mode: {
      ask: 'Shows what was found and lets you choose before anything is uploaded or pasted.',
      auto: 'Redacts straight away and shows a short notice.',
    },
    detectionMode: {
      script: 'Fast, scripted detection of PII.',
      ai: 'Runs script mode, then an AI layer that catches more PII. Takes much longer.',
    },
    outputMode: {
      redact: 'Blanks out PII.',
      replace: 'Swaps PII for fake data, consistent for each person, phone number, etc.',
    },
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

  const settings = await Settings.load();
  const save = () => Settings.save(settings);

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

  for (const group of document.querySelectorAll('.seg')) {
    const key = group.dataset.setting;
    const buttons = group.querySelectorAll('button');
    const render = () => {
      buttons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.value === settings[key])));
      document.querySelector(`[data-hint-for="${key}"]`).textContent = HINTS[key][settings[key]];
    };
    buttons.forEach((b) => b.addEventListener('click', () => { settings[key] = b.dataset.value; render(); save(); }));
    render();
  }

  for (const key of ['checkPaste', 'warnUnsupported']) {
    const box = $(key);
    box.checked = settings[key];
    box.addEventListener('change', () => { settings[key] = box.checked; save(); });
  }

  // ---- What to look for -----------------------------------------------------

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

  /** The server's entity types when signed in (that's what checks files); our own detectors' otherwise. */
  async function entityTypes(signedIn) {
    if (signedIn) {
      const reply = await chrome.runtime.sendMessage({ type: 'getCapabilities' }).catch(() => null);
      if (reply?.ok) return reply.data.entities;
    }
    return D.DETECTORS.map(({ id, label }) => ({ id, label }));
  }

  async function renderDetectors(signedIn) {
    const switches = (await entityTypes(signedIn)).map(({ id, label }) => makeSwitch(
      label,
      !settings.disabledTypes.includes(id),
      (on) => {
        settings.disabledTypes = settings.disabledTypes.filter((type) => type !== id);
        if (!on) settings.disabledTypes.push(id);
        save();
      },
    ));
    $('detectors').replaceChildren(...switches);
  }
  await renderDetectors(auth);
  chrome.storage.onChanged.addListener((changes, area) => {
    const signedInChanged = area === 'local' && changes.auth && !changes.auth.oldValue !== !changes.auth.newValue;
    if (signedInChanged) void renderDetectors(changes.auth.newValue);
  });
})();
