// Calls the PiiShooter API on behalf of the content scripts. They can't call it themselves: a
// content script's requests follow the CORS rules of whatever page it runs on. This worker isn't
// bound by those (host_permissions covers the API), and it keeps the login token away from pages.
//
// Every message gets back { ok: true, data } or { ok: false, reason }, where `reason` is short and
// readable, because the content script shows it to the user ("Not checked: <reason>").
importScripts('config.js');

const { API_URL } = globalThis.PIIConfig;

const handlers = { scanFile, scanText, getCapabilities };

chrome.runtime.onMessage.addListener((message, _sender, reply) => {
  const handler = handlers[message.type];
  if (!handler) return false;
  handler(message).then(
    (data) => reply({ ok: true, data }),
    (error) => reply({ ok: false, reason: error.message }),
  );
  return true; // the reply comes later
});

/** Clean a file. The content script sends it as base64 because messages are JSON. */
async function scanFile({ name, mimeType, base64, settings }) {
  const form = new FormData();
  form.append('file', new Blob([Uint8Array.fromBase64(base64)], { type: mimeType }), name);
  form.append('detection_mode', settings.detectionMode);
  form.append('output_mode', settings.outputMode);
  for (const entity of await enabledEntities(settings)) form.append('entities', entity);
  return callApi('/redact/instant', { method: 'POST', body: form });
}

async function scanText({ text, settings }) {
  return callApi('/redact/text', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text,
      detection_mode: settings.detectionMode,
      output_mode: settings.outputMode,
      entities: await enabledEntities(settings),
    }),
  });
}

// The entity types and file types the server supports. They only change when the server is
// updated, so they're fetched once per worker start. They're also saved to storage, where the
// popup and content scripts read the labels and file types without having to ask.
let capabilities = null;

async function getCapabilities() {
  if (!capabilities) {
    capabilities = await callApi('/redact/capabilities');
    await chrome.storage.local.set({ capabilities });
  }
  return capabilities;
}

/** Settings store what the user turned off; the API wants what to look for. */
async function enabledEntities(settings) {
  const { entities } = await getCapabilities();
  return entities.map((entity) => entity.id).filter((id) => !settings.disabledTypes.includes(id));
}

async function callApi(path, init = {}) {
  const { auth } = await chrome.storage.local.get('auth');
  if (!auth) throw new Error('you’re not signed in to PiiShooter');

  let response;
  try {
    response = await fetch(API_URL + path, {
      ...init,
      headers: { ...init.headers, Authorization: `Bearer ${auth.token}` },
    });
  } catch {
    throw new Error('the PiiShooter server couldn’t be reached');
  }

  if (response.status === 401) {
    await chrome.storage.local.remove('auth');
    throw new Error('your PiiShooter sign-in has expired');
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    // FastAPI puts a readable message in `detail` for the errors we raise ourselves.
    throw new Error(typeof body.detail === 'string' ? body.detail : `the server answered ${response.status}`);
  }
  return body;
}
