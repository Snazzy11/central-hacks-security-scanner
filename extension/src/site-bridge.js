// Runs only on the PiiShooter website. Keeps the extension's sign-in in step with the site's:
// log in on the site and the extension is signed in; log out on either side and both are.
// Content scripts share the page's localStorage, which is where the site keeps its token.
(function () {
  'use strict';
  const { SITE_TOKEN_KEY } = globalThis.PIIConfig;
  let lastSeen;

  async function sync() {
    const siteToken = localStorage.getItem(SITE_TOKEN_KEY);
    if (siteToken === lastSeen) return;
    lastSeen = siteToken;

    const { auth, signedOutToken } = await chrome.storage.local.get(['auth', 'signedOutToken']);
    if (siteToken && siteToken === signedOutToken) {
      // Signed out from the extension popup: sign the site out too.
      localStorage.removeItem(SITE_TOKEN_KEY);
      location.reload();
    } else if (siteToken && auth?.token !== siteToken) {
      await chrome.storage.local.set({ auth: { token: siteToken } });
      await chrome.storage.local.remove('signedOutToken');
    } else if (!siteToken && auth) {
      await chrome.storage.local.remove('auth');
    }
  }

  // The site writes localStorage from this same tab, which fires no `storage` event,
  // so check on a short timer while the tab is visible, plus on the usual triggers.
  setInterval(() => { if (!document.hidden) void sync(); }, 1000);
  window.addEventListener('storage', (e) => { if (e.key === SITE_TOKEN_KEY) void sync(); });
  document.addEventListener('visibilitychange', () => void sync());
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.signedOutToken) { lastSeen = undefined; void sync(); }
  });
  void sync();
})();
