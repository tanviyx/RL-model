const mongoose = require('mongoose');

// Only run settings, the summary metrics and the comparison live here.
// The time series are in the trafficsamples collection and the signal timings in signaltimings.
const armSchema = new mongoose.Schema({ summary: { type: mongoose.Schema.Types.Mixed } }, { _id: false });

const experimentSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    durationSec: { type: Number, required: true },   // simulated time: 300, 1800 or 3600
    demand: { type: Number, required: true },        // vehicles per hour, same for both signals
    seed: { type: Number, required: true },          // same seed = same vehicles for both signals
    sampleEvery: { type: Number, required: true },
    speed: { type: Number, default: 0 },             // simulated seconds per real second, 0 = as fast as possible
    status: { type: String, enum: ['running', 'completed', 'failed', 'cancelled'], default: 'running', index: true },
    progressSec: { type: Number, default: 0 },
    error: String,
    model: { type: mongoose.Schema.Types.Mixed },    // checkpoint that made the AI decisions
    arms: { fixed: armSchema, dqn: armSchema },
    comparison: { type: mongoose.Schema.Types.Mixed },
    startedAt: { type: Date, default: Date.now },
    finishedAt: Date,
  },
  { timestamps: true }
);

experimentSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model('Experiment', experimentSchema);
