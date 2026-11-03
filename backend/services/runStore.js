// Reads and writes the time-series collections of a run (samples and signal timings).
const TrafficSample = require('../models/TrafficSample');
const SignalTiming = require('../models/SignalTiming');

const CONTROLLERS = ['fixed', 'dqn'];

// Called once when a run finishes: two insertMany calls, nothing is half-written during the run.
async function saveRun(experimentId, userId, arms) {
  const samples = [], timings = [];
  for (const c of CONTROLLERS) {
    for (const s of arms[c].samples) samples.push({ ...s, experiment: experimentId, user: userId, controller: c });
    (arms[c].timings || []).forEach((t, i) => timings.push({ ...t, n: i + 1, experiment: experimentId, user: userId, controller: c }));
  }
  await TrafficSample.insertMany(samples, { ordered: false });
  await SignalTiming.insertMany(timings, { ordered: false });
}

// { fixed: [...], dqn: [...] } sorted by time. Optional filters: controller, from, to, limit (latest points kept).
async function loadSamples(experimentId, { controller, from = 0, to = Infinity, limit = 2000 } = {}) {
  const out = {};
  for (const c of CONTROLLERS) {
    if (controller && controller !== c) continue;
    const t = { $gte: from }; if (Number.isFinite(to)) t.$lte = to;
    const rows = await TrafficSample.find({ experiment: experimentId, controller: c, t }).sort({ t: 1 }).select('-_id -experiment -user -controller').lean();
    out[c] = rows.slice(-limit);
  }
  return out;
}

async function loadTimings(experimentId, controller) {
  const q = { experiment: experimentId }; if (controller) q.controller = controller;
  return SignalTiming.find(q).sort({ controller: 1, n: 1 }).select('-_id -experiment -user -__v').lean();
}

async function removeRun(experimentId) {
  await TrafficSample.deleteMany({ experiment: experimentId });
  await SignalTiming.deleteMany({ experiment: experimentId });
}

module.exports = { saveRun, loadSamples, loadTimings, removeRun };
