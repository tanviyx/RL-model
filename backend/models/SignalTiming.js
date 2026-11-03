const mongoose = require('mongoose');

// One green period of one signal: which direction got green, for how long, and what the queues looked like
// when it started. For the AI each record is one model decision; for the fixed plan it is one planned green.
const schema = new mongoose.Schema({
  experiment: { type: mongoose.Schema.Types.ObjectId, ref: 'Experiment', required: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  controller: { type: String, enum: ['fixed', 'dqn'], required: true },
  n: { type: Number, required: true },               // order within the run
  t: { type: Number, required: true },               // simulated second when this green began
  phase: { type: Number, enum: [0, 1], required: true }, // 0 = North/South green, 1 = East/West green
  green: { type: Number, required: true },           // seconds of green (fixed: 42; AI: 10, 20, 30 or 40)
  queues: [Number],                                  // queue per approach N, S, E, W at that moment
  action: Number,                                    // AI only: chosen action 0..7
  changed: Boolean,                                  // AI only: false = same phase kept (green extended)
  q: [Number],                                       // AI only: the 8 Q-values behind the decision
}, { versionKey: false });

schema.index({ experiment: 1, controller: 1, n: 1 });
schema.index({ user: 1, experiment: 1 });

module.exports = mongoose.model('SignalTiming', schema);
