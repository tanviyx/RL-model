// Step 6.6: read-only traffic information for the logged-in user's stored runs, plus the SUMO fixed-time baseline.
const fs = require('fs');
const path = require('path');
const express = require('express');
const mongoose = require('mongoose');
const Experiment = require('../models/Experiment');
const runner = require('../services/experimentRunner');
const { present } = require('../services/experimentView');
const store = require('../services/runStore');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

// which run: ?experiment=<id>, otherwise the one running now, otherwise the latest finished one
async function pick(req, res) {
  const id = req.query.experiment;
  if (id) {
    if (!mongoose.isValidObjectId(id)) { res.status(400).json({ message: 'Invalid experiment id.' }); return null; }
    const d = await Experiment.findOne({ _id: id, user: req.userId }).lean();
    if (!d) res.status(404).json({ message: 'Experiment not found.' });
    return d || null;
  }
  const d = await Experiment.findOne({ user: req.userId }).sort({ createdAt: -1 }).lean();
  if (!d) res.status(404).json({ message: 'No runs yet. Start one from the Compare page.' });
  return d || null;
}

// Latest reading of both signals
router.get('/live', async (req, res) => {
  const doc = await pick(req, res);
  if (!doc) return;
  const v = present(doc, runner.liveOf(doc._id) ? {} : await store.loadSamples(doc._id, { limit: 1 }));
  const last = (a) => (a && a.length ? a[a.length - 1] : null);
  res.json({ experiment: v.id, status: v.status, progressSec: v.progressSec, durationSec: v.durationSec, fixed: last(v.samples.fixed), dqn: last(v.samples.dqn) });
});

// Time series. ?controller=fixed|dqn  ?from=<sim s>  ?to=<sim s>  ?limit=<max points, default 500>
router.get('/history', async (req, res) => {
  const doc = await pick(req, res);
  if (!doc) return;
  const c = req.query.controller;
  if (c && c !== 'fixed' && c !== 'dqn') return res.status(400).json({ message: 'controller must be fixed or dqn.' });
  const from = req.query.from === undefined ? 0 : Number(req.query.from);
  const to = req.query.to === undefined ? Infinity : Number(req.query.to);
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 500, 1), 2000);
  if (Number.isNaN(from) || Number.isNaN(to)) return res.status(400).json({ message: 'from and to must be numbers (simulated seconds).' });
  const out = { experiment: String(doc._id), sampleEvery: doc.sampleEvery };
  if (runner.liveOf(doc._id)) {
    const l = runner.liveOf(doc._id).samples;
    for (const k of ['fixed', 'dqn']) if (!c || c === k) out[k] = l[k].filter((s) => s.t >= from && s.t <= to).slice(-limit);
  } else Object.assign(out, await store.loadSamples(doc._id, { controller: c, from, to, limit }));
  res.json(out);
});

// Average result over all your finished runs (positive % = the AI is better)
router.get('/summary', async (req, res) => {
  const docs = await Experiment.find({ user: req.userId, status: 'completed' }).select('comparison demand durationSec').lean();
  const acc = {};
  for (const d of docs) for (const m of (d.comparison && d.comparison.metrics) || []) {
    const a = (acc[m.key] = acc[m.key] || { label: m.label, sum: 0, n: 0, dqnWins: 0, fixedWins: 0 });
    a.sum += m.improvementPct; a.n++;
    if (m.winner === 'dqn') a.dqnWins++; else if (m.winner === 'fixed') a.fixedWins++;
  }
  const metrics = Object.entries(acc).map(([key, a]) => ({ key, label: a.label, avgImprovementPct: Math.round((a.sum / a.n) * 10) / 10, dqnWins: a.dqnWins, fixedWins: a.fixedWins, runs: a.n }));
  res.json({ runs: docs.length, metrics });
});

// The SUMO evaluation of the fixed-time plan on the 48 held-out test hours (model/results/baseline_real_eval.csv)
router.get('/baseline', (req, res) => {
  const file = path.join(__dirname, '..', '..', 'model', 'results', 'baseline_real_eval.csv');
  let text;
  try { text = fs.readFileSync(file, 'utf8'); } catch { return res.status(404).json({ message: 'baseline_real_eval.csv not found in model/results.' }); }
  const [head, ...lines] = text.trim().split(/\r?\n/);
  const cols = head.split(',');
  const hours = lines.filter(Boolean).map((l) => { const p = l.split(','); const o = {}; cols.forEach((c, i) => { o[c] = c === 'hour' ? p[i] : Number(p[i]); }); return o; });
  const sum = (k) => hours.reduce((s, h) => s + h[k], 0);
  const gen = sum('veh_generated'), done = sum('veh_completed');
  res.json({
    controller: 'fixed-time (SUMO, 42 s green)', hours: hours.length, vehiclesGenerated: gen, vehiclesCompleted: done,
    avgWaitSec: Math.round((hours.reduce((s, h) => s + h.avg_wait_s * h.veh_completed, 0) / done) * 10) / 10,
    worstWaitSec: Math.max(...hours.map((h) => h.max_wait_s)), avgQueue: Math.round((sum('avg_queue') / hours.length) * 10) / 10,
    worstQueue: Math.max(...hours.map((h) => h.max_queue)), perHour: hours,
  });
});

module.exports = router;
