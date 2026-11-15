
(function (root) {
  'use strict';
  const SITE_URL = 'http://localhost:5173';
  root.PIIConfig = {
    SITE_URL,
    // The site serves the API under /api (Vite proxies it to FastAPI in dev).
    API_URL: `${SITE_URL}/api`,
    // localStorage key the website keeps its login token under (frontend/src/lib/api.ts).
    SITE_TOKEN_KEY: 'token',
  };
})(globalThis);
