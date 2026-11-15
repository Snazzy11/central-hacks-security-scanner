// Where the PiiShooter website runs. The extension signs in through it and calls its API.
// When the site moves (e.g. to production), change SITE_URL here and the matching
// "http://localhost:5173/*" entries in manifest.json (host_permissions, content_scripts).
(function (root) {
  'use strict';
  root.PIIConfig = {
    SITE_URL: 'http://localhost:5173',
    // localStorage key the website keeps its login token under (frontend/src/lib/api.ts).
    SITE_TOKEN_KEY: 'token',
  };
})(globalThis);
