const mongoose = require('mongoose');

// One reading of one signal at one moment: the historical traffic data behind every chart.
// Written once when a run finishes (about 120 per signal per run), never edited.
const schema = new mongoose.Schema({
  experiment: { type: mongoose.Schema.Types.ObjectId, ref: 'Experiment', required: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  controller: { type: String, enum: ['fixed', 'dqn'], required: true },
  t: { type: Number, required: true },               // simulated seconds since the run started
  queue: Number, queueByApproach: [Number],          // N, S, E, W
  onRoad: Number, waitNow: Number, maxWaitNow: Number, avgWait: Number,
  completed: Number, throughput: Number, backlog: Number, dropped: Number, phase: String,
}, { versionKey: false });

schema.index({ experiment: 1, controller: 1, t: 1 });   // charts and history ranges
schema.index({ user: 1, experiment: 1 });                // everything of one user

module.exports = mongoose.model('TrafficSample', schema);
