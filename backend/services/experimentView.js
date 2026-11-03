// Turns a stored experiment into what the API returns, using in-memory progress while it is still running.
const runner = require('./experimentRunner');

function present(doc, stored) {   // stored: { fixed, dqn } samples from the database, or undefined for summaries only
  const l = runner.liveOf(doc._id);
  const out = {
    id: String(doc._id), status: doc.status, durationSec: doc.durationSec, demand: doc.demand, seed: doc.seed,
    speed: doc.speed, sampleEvery: doc.sampleEvery, model: doc.model, error: doc.error,
    progressSec: l ? l.simTime : doc.progressSec, startedAt: doc.startedAt, finishedAt: doc.finishedAt,
    comparison: doc.comparison || null,
  };
  const fixed = (doc.arms && doc.arms.fixed) || {}, dqn = (doc.arms && doc.arms.dqn) || {};
  out.summary = { fixed: fixed.summary || null, dqn: dqn.summary || null };
  if (stored) out.samples = { fixed: l ? l.samples.fixed : stored.fixed || [], dqn: l ? l.samples.dqn : stored.dqn || [] };
  return out;
}

module.exports = { present };
