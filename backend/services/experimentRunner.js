// Starts experiments in the background and keeps live progress in memory so the page can poll it cheaply.
const Experiment = require('../models/Experiment');
const model = require('./modelClient');
const { runExperiment } = require('./experimentEngine');
const store = require('./runStore');

const live = new Map();      // experimentId -> { simTime, samples: {fixed, dqn}, cancel: bool, userId }
const MAX_PARALLEL = 2;

const DURATIONS = { 5: 300, 30: 1800, 60: 3600 };   // minutes -> simulated seconds
const SPEEDS = [0, 1, 10, 60];                      // 0 = as fast as possible

const sampleEveryFor = (sec) => Math.max(5, Math.round(sec / 120 / 5) * 5);   // about 120 points per chart

function liveOf(id) { return live.get(String(id)); }
function runningFor(userId) { for (const l of live.values()) if (String(l.userId) === String(userId)) return true; return false; }
function activeCount() { return live.size; }

async function start({ userId, minutes, demand, seed, speed }) {
  const info = await model.health();
  if (!info) { const e = new Error('The AI model service is not running. In the model folder run: python serve.py'); e.status = 503; throw e; }
  const durationSec = DURATIONS[minutes];
  const doc = await Experiment.create({
    user: userId, durationSec, demand, seed, speed, sampleEvery: sampleEveryFor(durationSec), status: 'running',
    model: { name: info.model, episode: info.episode, backend: info.backend },
  });
  const id = String(doc._id);
  const entry = { userId: String(userId), simTime: 0, samples: { fixed: [], dqn: [] }, cancel: false };
  live.set(id, entry);
  execute(id, doc, entry).catch((err) => console.error('[experiment] unexpected', err));   // not awaited: runs in the background
  return doc;
}

async function execute(id, doc, entry) {
  let lastSave = 0;
  try {
    const result = await runExperiment({
      durationSec: doc.durationSec, demand: doc.demand, seed: doc.seed, sampleEvery: doc.sampleEvery, speed: doc.speed,
      decide: (state) => model.decide(state),
      shouldCancel: () => entry.cancel,
      onProgress: ({ simTime, fixed, dqn }) => {
        entry.simTime = simTime; entry.samples = { fixed: fixed.slice(), dqn: dqn.slice() };
        if (Date.now() - lastSave > 3000) { lastSave = Date.now(); Experiment.updateOne({ _id: id }, { $set: { progressSec: simTime } }).catch(() => {}); }
      },
    });
    if (result.cancelled) {
      await Experiment.updateOne({ _id: id }, { $set: { status: 'cancelled', progressSec: entry.simTime, finishedAt: new Date() } });
    } else {
      // time series first, then the run itself is marked completed: a "completed" run always has its data
      await store.saveRun(doc._id, doc.user, result.arms);
      await Experiment.updateOne({ _id: id }, { $set: { status: 'completed', progressSec: doc.durationSec,
        arms: { fixed: { summary: result.arms.fixed.summary }, dqn: { summary: result.arms.dqn.summary } },
        comparison: result.comparison, finishedAt: new Date() } });
    }
  } catch (err) {
    console.error('[experiment] failed:', err.message);
    await Experiment.updateOne({ _id: id }, { $set: { status: 'failed', error: String(err.message || err).slice(0, 300), progressSec: entry.simTime, finishedAt: new Date() } }).catch(() => {});
  } finally {
    live.delete(id);
  }
}

function cancel(id) { const l = live.get(String(id)); if (!l) return false; l.cancel = true; return true; }

// After a server restart, runs that were "running" can never finish: mark them failed.
async function failStale() {
  await Experiment.updateMany({ status: 'running' }, { $set: { status: 'failed', error: 'Server restarted while the run was in progress.', finishedAt: new Date() } });
}

module.exports = { start, cancel, liveOf, runningFor, activeCount, failStale, DURATIONS, SPEEDS, MAX_PARALLEL };
