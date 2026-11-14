(async function () {
  'use strict';
  const D = globalThis.PIIDetectors;
  const DEFAULTS = { mode: 'ask', enabled: { ...D.DEFAULT_ENABLED }, stripMetadata: true, warnUnsupported: true, disabledSites: [] };

  const { settings: stored } = await chrome.storage.sync.get('settings');
  const settings = { ...DEFAULTS, ...(stored || {}), enabled: { ...DEFAULTS.enabled, ...((stored && stored.enabled) || {}) } };
  const save = () => chrome.storage.sync.set({ settings });

  // Current site
  let host = '';
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    host = new URL(tab.url).hostname;
  } catch (_) { /* no URL access for some pages */ }
  const siteBox = document.getElementById('siteEnabled');
  if (host) {
    document.getElementById('host').textContent = host;
    siteBox.checked = !settings.disabledSites.includes(host);
    siteBox.addEventListener('change', () => {
      settings.disabledSites = settings.disabledSites.filter((h) => h !== host);
      if (!siteBox.checked) settings.disabledSites.push(host);
      save();
    });
  } else {
    document.getElementById('siteRow').hidden = true;
  }

  const mode = document.getElementById('mode');
  mode.value = settings.mode;
  mode.addEventListener('change', () => { settings.mode = mode.value; save(); });

  const container = document.getElementById('detectors');
  for (const det of D.DETECTORS) {
    const label = document.createElement('label');
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = settings.enabled[det.id] !== false;
    box.addEventListener('change', () => { settings.enabled[det.id] = box.checked; save(); });
    label.append(box, det.label);
    container.append(label);
  }

  for (const key of ['stripMetadata', 'warnUnsupported']) {
    const box = document.getElementById(key);
    box.checked = settings[key];
    box.addEventListener('change', () => { settings[key] = box.checked; save(); });
  }
})();
