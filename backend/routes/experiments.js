// Step 6.6: run the same traffic through the fixed-time signal and the trained DQN, store both, compare.
const express = require('express');
const mongoose = require('mongoose');
const Experiment = require('../models/Experiment');
const runner = require('../services/experimentRunner');
const { present } = require('../services/experimentView');
const store = require('../services/runStore');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

const isInt = (x) => typeof x === 'number' && Number.isInteger(x);

async function mine(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) { res.status(400).json({ message: 'Invalid experiment id.' }); return null; }
  const doc = await Experiment.findOne({ _id: req.params.id, user: req.userId }).lean();
  if (!doc) { res.status(404).json({ message: 'Experiment not found.' }); return null; }
  return doc;
}

// Start a run. body: { minutes: 5 | 30 | 60, demand?: 200..3600 veh/h, seed?: integer, speed?: 0 | 1 | 10 | 60 }
router.post('/', async (req, res) => {
  const b = req.body || {};
  const minutes = Number(b.minutes), demand = b.demand === undefined ? 1200 : Number(b.demand);
  const seed = b.seed === undefined ? 1 : Number(b.seed), speed = b.speed === undefined ? 0 : Number(b.speed);
  if (!runner.DURATIONS[minutes]) return res.status(400).json({ message: 'minutes must be 5, 30 or 60.' });
  if (!isInt(demand) || demand < 200 || demand > 3600) return res.status(400).json({ message: 'demand must be a whole number from 200 to 3600 vehicles per hour.' });
  if (!isInt(seed) || seed < 0 || seed > 1000000) return res.status(400).json({ message: 'seed must be a whole number from 0 to 1000000.' });
  if (!runner.SPEEDS.includes(speed)) return res.status(400).json({ message: 'speed must be one of ' + runner.SPEEDS.join(', ') + ' (0 = as fast as possible).' });
  if (runner.runningFor(req.userId)) return res.status(409).json({ message: 'You already have a run in progress. Wait for it or cancel it first.' });
  if (runner.activeCount() >= runner.MAX_PARALLEL) return res.status(429).json({ message: 'The server is busy with other runs. Try again in a minute.' });
  try {
    const doc = await runner.start({ userId: req.userId, minutes, demand, seed, speed });
    res.status(202).json({ id: String(doc._id), status: 'running' });
  } catch (err) {
    res.status(err.status || 500).json({ message: err.status ? err.message : 'Could not start the run.' });
  }
});

// Your past runs (summaries only, newest first)
router.get('/', async (req, res) => {
  const docs = await Experiment.find({ user: req.userId }).sort({ createdAt: -1 }).limit(50)
    .lean();
  res.json(docs.map((d) => present(d)));
});

// One run. While it is running this returns live progress and the samples so far.
router.get('/:id', async (req, res) => {
  const doc = await mine(req, res);
  if (doc) res.json(present(doc, runner.liveOf(doc._id) ? {} : await store.loadSamples(doc._id)));
});

router.post('/:id/cancel', async (req, res) => {
  const doc = await mine(req, res);
  if (!doc) return;
  if (!runner.cancel(doc._id)) return res.status(409).json({ message: 'This run is not running.' });
  res.json({ status: 'cancelling' });
});

router.delete('/:id', async (req, res) => {
  const doc = await mine(req, res);
  if (!doc) return;
  if (runner.liveOf(doc._id)) return res.status(409).json({ message: 'Cancel the run before deleting it.' });
  await store.removeRun(doc._id);
  await Experiment.deleteOne({ _id: doc._id, user: req.userId });
  res.json({ deleted: true });
});

// Both signals' samples in one CSV (for Excel / your report)
router.get('/:id/export.csv', async (req, res) => {
  const doc = await mine(req, res);
  if (!doc) return;
  const cols = ['t', 'queue', 'onRoad', 'waitNow', 'maxWaitNow', 'avgWait', 'completed', 'throughput', 'backlog', 'dropped', 'phase'];
  const rows = [['controller', ...cols].join(',')];
  const data = await store.loadSamples(doc._id);
  for (const c of ['fixed', 'dqn']) for (const s of data[c]) rows.push([c, ...cols.map((k) => JSON.stringify(s[k] ?? ''))].join(','));
  res.set('Content-Type', 'text/csv').set('Content-Disposition', `attachment; filename="experiment-${doc._id}.csv"`).send(rows.join('\n'));
});

module.exports = router;
