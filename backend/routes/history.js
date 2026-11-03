// Step 6.7: historical information read back from MongoDB for the dashboard.
const express = require('express');
const mongoose = require('mongoose');
const User = require('../models/User');
const Experiment = require('../models/Experiment');
const store = require('../services/runStore');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

const r1 = (x) => Math.round(x * 10) / 10;
const mean = (a) => (a.length ? r1(a.reduce((s, x) => s + x, 0) / a.length) : null);
const metricOf = (d, key) => ((d.comparison && d.comparison.metrics) || []).find((m) => m.key === key);

// Everything the dashboard's top section needs in one call
router.get('/overview', async (req, res) => {
  const [user, all] = await Promise.all([
    User.findById(req.userId).lean(),
    Experiment.find({ user: req.userId }).sort({ createdAt: 1 }).lean(),
  ]);
  if (!user) return res.status(401).json({ message: 'Please log in.' });
  const done = all.filter((d) => d.status === 'completed');

  const improvement = (docs, key) => mean(docs.map((d) => (metricOf(d, key) || {}).improvementPct).filter((x) => typeof x === 'number'));
  const group = (label, docs) => ({ label, runs: docs.length, avgWaitImprovementPct: improvement(docs, 'avgWait'), avgQueueImprovementPct: improvement(docs, 'avgQueue') });

  res.json({
    user: { name: user.name, email: user.email, avatar: user.avatar || null, memberSince: user.createdAt, lastLoginAt: user.lastLoginAt || null, loginCount: user.loginCount || 0 },
    totals: {
      runs: all.length, completed: done.length,
      simulatedMinutes: Math.round(done.reduce((s, d) => s + d.durationSec, 0) / 60),
      vehiclesPerSignal: done.reduce((s, d) => s + ((d.arms && d.arms.fixed && d.arms.fixed.summary && d.arms.fixed.summary.spawned) || 0), 0),
    },
    averageImprovementPct: {                         // positive = AI better
      avgWait: improvement(done, 'avgWait'), p95Wait: improvement(done, 'p95Wait'),
      avgQueue: improvement(done, 'avgQueue'), throughputPerHour: improvement(done, 'throughputPerHour'),
    },
    byDuration: [300, 1800, 3600].map((s) => group(s / 60 + ' min', done.filter((d) => d.durationSec === s))),
    byTraffic: [
      group('Light (under 1000 veh/h)', done.filter((d) => d.demand < 1000)),
      group('Medium (1000–1999)', done.filter((d) => d.demand >= 1000 && d.demand < 2000)),
      group('Heavy (2000 and above)', done.filter((d) => d.demand >= 2000)),
    ],
    trend: done.slice(-20).map((d) => {
      const f = (d.arms.fixed || {}).summary || {}, a = (d.arms.dqn || {}).summary || {};
      return { id: String(d._id), date: d.startedAt, durationSec: d.durationSec, demand: d.demand,
               fixedWait: f.avgWait, dqnWait: a.avgWait, fixedQueue: f.avgQueue, dqnQueue: a.avgQueue };
    }),
  });
});

// Signal timings of one run (default: your latest finished run), with a short statistical summary per signal
router.get('/timings', async (req, res) => {
  const c = req.query.controller;
  if (c && c !== 'fixed' && c !== 'dqn') return res.status(400).json({ message: 'controller must be fixed or dqn.' });
  let doc;
  if (req.query.experiment) {
    if (!mongoose.isValidObjectId(req.query.experiment)) return res.status(400).json({ message: 'Invalid experiment id.' });
    doc = await Experiment.findOne({ _id: req.query.experiment, user: req.userId }).lean();
  } else {
    const list = await Experiment.find({ user: req.userId, status: 'completed' }).sort({ createdAt: -1 }).limit(1).lean();
    doc = list[0];
  }
  if (!doc) return res.status(404).json({ message: 'No finished run found.' });
  const rows = await store.loadTimings(doc._id, c);
  const stats = {};
  for (const k of ['fixed', 'dqn']) {
    const r = rows.filter((x) => x.controller === k);
    if (!r.length) continue;
    const hist = {}; r.forEach((x) => { hist[x.green] = (hist[x.green] || 0) + 1; });
    stats[k] = { greens: r.length, avgGreen: mean(r.map((x) => x.green)), northSouthShare: r.filter((x) => x.phase === 0).length / r.length,
                 greenHistogram: hist, phaseKept: r.filter((x) => x.changed === false).length };
  }
  res.json({ experiment: String(doc._id), durationSec: doc.durationSec, demand: doc.demand, stats, timings: rows });
});

module.exports = router;
