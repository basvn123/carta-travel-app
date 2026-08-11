// Calls to the local review API. Vite proxies /api to 127.0.0.1:8011, so the
// browser only ever talks to its own origin and there is no CORS surface.

async function call(path, options = {}) {
  const res = await fetch(path, {
    headers: { 'content-type': 'application/json' },
    ...options,
  });
  const text = await res.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = { detail: text }; }
  if (!res.ok) {
    const detail = (body && body.detail) || `${res.status} ${res.statusText}`;
    throw new Error(typeof detail === 'string' ? detail : JSON.stringify(detail));
  }
  return body;
}

const qs = (params) => {
  const q = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== '' && v !== null && v !== undefined) q.set(k, v);
  });
  return q.toString();
};

export const getHealth = () => call('/api/health');
export const getQueue = (params) => call(`/api/queue?${qs(params)}`);
export const getTrip = (id) => call(`/api/trips/${id}`);
export const getPortal = (id) => call(`/api/trips/${id}/portal`);

export const saveEdits = (id, body) => call(`/api/trips/${id}`, {
  method: 'PATCH', body: JSON.stringify(body),
});

export const decide = (id, body) => call(`/api/trips/${id}/decision`, {
  method: 'POST', body: JSON.stringify(body),
});
