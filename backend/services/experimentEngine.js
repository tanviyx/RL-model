// Headless A/B run: the same traffic goes through a fixed-time signal and through the trained DQN.
// No database and no HTTP in here, so it can be tested on its own (test/engine.test.js).
const SimCore = require('../../frontend/public/js/simulation.js');

const { createSim } = SimCore;
const FINE = 5; // simulated seconds between the samples used for averages

function percentile(sorted, p) {
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
}

const round = (x, d = 2) => Math.round(x * 10 ** d) / 10 ** d;

function makeArm(name, seed, demand, controller) {
  return {
    name,
    sim: createSim(seed, demand, controller, { trackWaits: true }),
    samples: [],
    nextSample: 0,
    nextFine: FINE,
    queueSum: 0, queueN: 0, queueMax: 0, queueMaxM: 0,
    decisions: 0, failed: null,
  };
}

function record(arm, sampleEvery, force = false) {
  const t = arm.sim.time;
  if (t >= arm.nextFine) {                       // fine tick: feeds the averages
    arm.nextFine += FINE;
    const m = arm.sim.monitor();
    arm.queueSum += m.totals.queue; arm.queueN++;
    if (m.totals.queue > arm.queueMax) arm.queueMax = m.totals.queue;
    if (m.totals.queueMaxM > arm.queueMaxM) arm.queueMaxM = m.totals.queueMaxM;
  }
  if (t >= arm.nextSample || force) {            // stored sample: feeds the charts and the history API
    arm.nextSample += sampleEvery;
    const m = arm.sim.monitor(), snap = arm.sim.snapshot(), st = arm.sim.stats();
    arm.samples.push({
      t: round(t, 1),
      queue: m.totals.queue,
      queueByApproach: snap.queues,
      onRoad: snap.onRoad,
      waitNow: round(m.totals.avgWait),            // mean wait of vehicles currently on the approaches
      maxWaitNow: round(m.totals.maxWait),
      avgWait: round(st.completed ? st.waitSum / st.completed : 0),  // mean wait of finished trips so far
      completed: st.completed,
      throughput: Math.round(m.throughput.perHour), // veh/h over the last 5 simulated minutes
      backlog: snap.backlog,
      dropped: st.dropped,
      phase: snap.phase.name,
    });
  }
}

function summarize(arm) {
  const st = arm.sim.stats();
  const waits = (st.waits || []).slice().sort((a, b) => a - b);
  const out = {
    spawned: st.spawned,
    completed: st.completed,
    unfinished: st.spawned - st.completed,
    completedPct: round(st.spawned ? (st.completed / st.spawned) * 100 : 0, 1),
    dropped: st.dropped,
    avgWait: round(st.completed ? st.waitSum / st.completed : 0),
    p95Wait: round(percentile(waits, 0.95)),
    maxWait: round(Math.max(waits.length ? waits[waits.length - 1] : 0, st.maxWaitOnRoad)),
    avgTravel: round(st.completed ? st.travelSum / st.completed : 0),
    avgQueue: round(arm.queueN ? arm.queueSum / arm.queueN : 0),
    maxQueue: arm.queueMax,
    maxQueueMetres: round(arm.queueMaxM, 1),
    throughputPerHour: Math.round(st.completed / (arm.sim.time / 3600)),
  };
  const ai = arm.sim.ai;
  if (ai) {
    out.decisions = ai.n;
    out.switches = ai.switches;
    out.avgGreen = round(ai.n ? ai.greenSum / ai.n : 0, 1);
    out.actionCounts = ai.counts.slice();
  }
  return out;
}

// positive "change" always means the AI is better
function compare(fixed, dqn) {
  const lowerBetter = (a, b) => (a > 0 ? round(((a - b) / a) * 100, 1) : 0);
  const higherBetter = (a, b) => (a > 0 ? round(((b - a) / a) * 100, 1) : 0);
  const rows = [
    ['avgWait', 'Average wait per vehicle (s)', fixed.avgWait, dqn.avgWait, lowerBetter],
    ['p95Wait', '95th percentile wait (s)', fixed.p95Wait, dqn.p95Wait, lowerBetter],
    ['maxWait', 'Longest wait (s)', fixed.maxWait, dqn.maxWait, lowerBetter],
    ['avgTravel', 'Average travel time (s)', fixed.avgTravel, dqn.avgTravel, lowerBetter],
    ['avgQueue', 'Average queue (vehicles)', fixed.avgQueue, dqn.avgQueue, lowerBetter],
    ['maxQueue', 'Worst queue (vehicles)', fixed.maxQueue, dqn.maxQueue, lowerBetter],
    ['completed', 'Vehicles completed', fixed.completed, dqn.completed, higherBetter],
    ['throughputPerHour', 'Throughput (veh/h)', fixed.throughputPerHour, dqn.throughputPerHour, higherBetter],
  ];
  const metrics = rows.map(([key, label, f, d, fn]) => {
    const change = fn(f, d);
    return { key, label, fixed: f, dqn: d, improvementPct: change, winner: Math.abs(change) < 1 ? 'tie' : change > 0 ? 'dqn' : 'fixed' };
  });
  const wins = { dqn: 0, fixed: 0, tie: 0 };
  metrics.forEach((m) => wins[m.winner]++);
  const overall = wins.dqn > wins.fixed ? 'dqn' : wins.fixed > wins.dqn ? 'fixed' : 'tie';
  return { metrics, wins, overall };
}

/**
 * opts: durationSec, demand (veh/h), seed, sampleEvery (sim s)
 *       decide(state) -> Promise<{action, q_values}>   the DQN
 *       onProgress({simTime, fixed:[samples], dqn:[samples]})  called about every 10 simulated seconds
 *       shouldCancel() -> boolean
 *       speed: simulated seconds per real second (0 = as fast as possible)
 */
async function runExperiment(opts) {
  const { durationSec, demand, seed, sampleEvery, decide, onProgress = () => {}, shouldCancel = () => false, speed = 0 } = opts;
  const fixed = makeArm('fixed', seed, demand, 'fixed');
  const dqn = makeArm('dqn', seed, demand, 'dqn');
  const wallStart = Date.now();
  let steps = 0, nextReport = 10;
  record(fixed, sampleEvery); record(dqn, sampleEvery);

  while (fixed.sim.time < durationSec - 1e-6 || dqn.sim.time < durationSec - 1e-6) {
    if (shouldCancel()) return { cancelled: true };

    if (fixed.sim.time < durationSec - 1e-6) { fixed.sim.step(); record(fixed, sampleEvery); }

    if (dqn.sim.time < durationSec - 1e-6) {
      if (dqn.sim.needsDecision()) {
        const state = dqn.sim.aiState();
        const reply = await decide(state);            // simulated time is held until the model answers
        dqn.sim.applyAction(reply.action, reply.q_values);
        dqn.decisions++;
      }
      dqn.sim.step(); record(dqn, sampleEvery);
    }

    const t = Math.min(fixed.sim.time, dqn.sim.time);
    if (t >= nextReport) { nextReport += 10; onProgress({ simTime: t, fixed: fixed.samples, dqn: dqn.samples }); }

    steps++;
    if (speed > 0 && steps % 50 === 0) {              // pace to real time (speed 1 = one simulated second per real second)
      const ahead = t - ((Date.now() - wallStart) / 1000) * speed;
      if (ahead > 0) await new Promise((r) => setTimeout(r, Math.min(ahead / speed, 1) * 1000));
    }
    if (steps % 2000 === 0) await new Promise((r) => setImmediate(r));   // let the web server answer other requests
  }
  record(fixed, sampleEvery, true); record(dqn, sampleEvery, true);
  const sFixed = summarize(fixed), sDqn = summarize(dqn);
  return {
    cancelled: false,
    arms: {
      fixed: { samples: fixed.samples, timings: fixed.sim.stats().timings, summary: sFixed },
      dqn: { samples: dqn.samples, timings: dqn.sim.stats().timings, summary: sDqn },
    },
    comparison: compare(sFixed, sDqn),
  };
}

module.exports = { runExperiment, compare, summarize };
