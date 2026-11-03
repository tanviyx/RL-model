// Talks to the Python DQN service (model/serve.py). Used by routes/ai.js and by the experiment runner.
const BASE = process.env.AI_SERVICE_URL || 'http://127.0.0.1:5001';
const STATE_SIZE = 35;

async function callModel(path, options, timeoutMs = 3000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(BASE + path, { ...options, signal: ctrl.signal });
    return { ok: res.ok, status: res.status, data: await res.json().catch(() => ({})) };
  } finally {
    clearTimeout(timer);
  }
}

// Returns the model's /health reply, or null when the service is not reachable.
async function health() {
  try {
    const r = await callModel('/health');
    return r.ok ? r.data : null;
  } catch {
    return null;
  }
}

// state: array of 35 numbers -> { action, phase, green_seconds, q_values, ... }. Throws on any failure.
async function decide(state) {
  const r = await callModel('/predict', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ state }),
  });
  if (!r.ok) throw new Error(r.data.message || `AI model rejected the request (${r.status})`);
  return r.data;
}

module.exports = { callModel, health, decide, STATE_SIZE };
