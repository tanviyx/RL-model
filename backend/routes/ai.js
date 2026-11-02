// Step 6.5: bridge between the browser and the Python DQN service (model/serve.py).
// Only logged-in users can use it, and the Python service is never exposed to the internet.
const express = require('express');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
const BASE = process.env.AI_SERVICE_URL || 'http://127.0.0.1:5001';
const STATE_SIZE = 35;

async function callModel(path, options) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 3000);
  try {
    const res = await fetch(BASE + path, { ...options, signal: ctrl.signal });
    return { ok: res.ok, status: res.status, data: await res.json().catch(() => ({})) };
  } finally {
    clearTimeout(timer);
  }
}

// Is the model service running, and which checkpoint does it serve?
router.get('/status', requireAuth, async (req, res) => {
  try {
    const r = await callModel('/health');
    res.json({ online: r.ok, ...r.data });
  } catch {
    res.json({ online: false });
  }
});

// Send the current traffic state (35 numbers), get back the recommended signal action.
router.post('/decide', requireAuth, async (req, res) => {
  const state = req.body && req.body.state;
  if (!Array.isArray(state) || state.length !== STATE_SIZE || !state.every((x) => typeof x === 'number' && Number.isFinite(x)))
    return res.status(400).json({ message: `state must be an array of ${STATE_SIZE} numbers` });
  try {
    const r = await callModel('/predict', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ state }),
    });
    if (!r.ok) return res.status(502).json({ message: r.data.message || 'The AI model rejected the request.' });
    res.json(r.data);
  } catch {
    res.status(503).json({ message: 'The AI model service is not running. In the model folder run: python serve.py' });
  }
});

module.exports = router;
