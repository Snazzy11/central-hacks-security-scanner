// The user's settings, shared by the content script and the popup. Kept in chrome.storage.sync,
// so they follow the user to other computers.
(function (root) {
  'use strict';

  const DEFAULTS = {
    mode: 'ask',               // 'ask' = show what was found and let the user choose, 'auto' = redact and show a notice
    detectionMode: 'script',   // 'script' = pattern matching, 'ai' = also run the server's AI model (slower)
    outputMode: 'redact',      // 'redact' = blank the PII out, 'replace' = swap in fake data of the same kind
    disabledTypes: [],         // entity types not to look for, e.g. 'IP_ADDRESS'
    checkPaste: true,
    warnUnsupported: true,     // tell the user when a file couldn't be checked
    disabledSites: [],         // hostnames
  };

  async function load() {
    const { settings } = await chrome.storage.sync.get('settings');
    return { ...DEFAULTS, ...settings };
  }

  function save(settings) {
    return chrome.storage.sync.set({ settings });
  }

  function onChange(callback) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'sync' && changes.settings) callback({ ...DEFAULTS, ...changes.settings.newValue });
    });
  }

  root.PIISettings = { DEFAULTS, load, save, onChange };
})(globalThis);
