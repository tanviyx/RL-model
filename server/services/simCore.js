// Pure simulation dynamics, shared by the live simulation (trafficSim.js)
// and the offline tools (tools/trainQTable.mjs, tools/evaluate.mjs), so what
// you evaluate is exactly what the website runs.
//
// One step = one simulated second.

export const DEFAULT_CFG = {
  lanes: 4,
  simMode: "intersection", // "intersection" | "single"
  maxQueue: 10,            // arrivals beyond this are dropped (and counted)
  minGreen: 5,             // ticks a phase must last before a switch is honoured
  lostTime: 3,             // seconds after a switch in which nobody is served (yellow / all-red)
  switchPenalty: 5,
  clearBonus: 10,
  queueWeight: 1.5,
  waitWeight: 0.2,
};

// Queue capacity: the original synthetic mode kept 10; real demand needs more room.
export const MAX_QUEUE = { synthetic: 10, real: 40 };

export const createState = () => ({
  nsQueue: 0,
  ewQueue: 0,
  light: 0, // 0 = NS green, 1 = EW green
  timeInPhase: 0,
  lostLeft: 0,   // seconds of lost time still to run after a switch
  nsWait: [],
  ewWait: [],
  cleared: 0,
  reward: 0,
  cumulativeReward: 0,
  // evaluation metrics
  steps: 0,
  arrived: 0,
  dropped: 0,
  delaySum: 0, // total seconds waited by vehicles that have been served
  queueSum: 0, // sum over steps of total queue length
});

const sum = (arr) => arr.reduce((a, b) => a + b, 0);

/**
 * Advance the simulation one step.
 * @param state     object from createState() (mutated)
 * @param action    0 = keep current phase, 1 = request a switch
 * @param arrivals  { ns, ew } vehicles arriving this step
 * @param cfg       see DEFAULT_CFG
 */
export function step(state, action, arrivals, cfg = DEFAULT_CFG) {
  const intersection = cfg.simMode === "intersection";
  state.steps++;
  state.timeInPhase++;

  // 1. Apply the action (a switch is ignored until minGreen has elapsed)
  let switched = false;
  if (action === 1 && state.timeInPhase > cfg.minGreen) {
    state.light = 1 - state.light;
    state.timeInPhase = 0;
    switched = true;
  }

  // 2. Serve the green approach (not during the lost time that follows a switch)
  if (switched) state.lostLeft = cfg.lostTime;
  let serving = true;
  if (state.lostLeft > 0) {
    serving = false;
    state.lostLeft--;
  }
  const clearBatch = Math.ceil(cfg.lanes / 2);
  let trafficCleared = 0;
  if (serving && state.light === 0 && state.nsQueue > 0) {
    const n = Math.min(state.nsQueue, clearBatch);
    state.nsQueue -= n;
    trafficCleared += n;
    state.delaySum += sum(state.nsWait.splice(0, n));
  }
  if (serving && state.light === 1 && state.ewQueue > 0) {
    const n = Math.min(state.ewQueue, clearBatch);
    state.ewQueue -= n;
    trafficCleared += n;
    state.delaySum += sum(state.ewWait.splice(0, n));
  }
  state.cleared += trafficCleared;

  // 3. Everyone still waiting ages by one second
  for (let i = 0; i < state.nsWait.length; i++) state.nsWait[i]++;
  for (let i = 0; i < state.ewWait.length; i++) state.ewWait[i]++;

  // 4. New arrivals (dropped if the queue is full)
  const nsArr = arrivals.ns | 0;
  const ewArr = intersection ? arrivals.ew | 0 : 0;
  state.arrived += nsArr + ewArr;
  for (let i = 0; i < nsArr; i++) {
    if (state.nsQueue < cfg.maxQueue) {
      state.nsQueue++;
      state.nsWait.push(0);
    } else state.dropped++;
  }
  for (let i = 0; i < ewArr; i++) {
    if (state.ewQueue < cfg.maxQueue) {
      state.ewQueue++;
      state.ewWait.push(0);
    } else state.dropped++;
  }
  if (!intersection) {
    state.ewQueue = 0;
    state.ewWait = [];
  }

  // 5. Reward
  const totalQueue = state.nsQueue + (intersection ? state.ewQueue : 0);
  const totalWait = sum(state.nsWait) + sum(state.ewWait);
  let reward = -(totalQueue * cfg.queueWeight) - totalWait * cfg.waitWeight;
  reward += trafficCleared * cfg.clearBonus;
  if (switched) reward -= cfg.switchPenalty;

  state.reward = reward;
  state.cumulativeReward += reward;
  state.queueSum += totalQueue;

  return { switched, cleared: trafficCleared };
}

/** Summary metrics for a finished run. Vehicles still queued count too, so a policy can't look good by leaving cars unserved. */
export function summarize(state) {
  const residualWait = sum(state.nsWait) + sum(state.ewWait);
  const stillQueued = state.nsWait.length + state.ewWait.length;
  const vehicles = state.cleared + stillQueued;
  return {
    avgDelay: vehicles ? (state.delaySum + residualWait) / vehicles : 0, // seconds per vehicle
    avgQueue: state.steps ? state.queueSum / state.steps : 0,
    throughput: state.cleared,
    dropped: state.dropped,
    arrived: state.arrived,
    reward: state.cumulativeReward,
  };
}

// ---------------- policies: state -> action (0 keep, 1 switch) ----------------

/** Switch every `cycle` seconds regardless of traffic. */
export const fixedTimePolicy = (cycle) => (s) => (s.timeInPhase >= cycle ? 1 : 0);

/** Simple heuristic baseline: switch when the red side is clearly longer. */
export const longestQueuePolicy = (margin = 2) => (s) => {
  const cur = s.light === 0 ? s.nsQueue : s.ewQueue;
  const other = s.light === 0 ? s.ewQueue : s.nsQueue;
  return other > cur + margin ? 1 : 0;
};

/** Greedy policy from a learned table: q[ns][ew][light] = [qKeep, qSwitch]. */
export const qTablePolicy = (q) => {
  const cap = q.length - 1;
  return (s) => {
    const a = q[Math.min(s.nsQueue, cap)]?.[Math.min(s.ewQueue, cap)]?.[s.light];
    return a && a[1] > a[0] ? 1 : 0;
  };
};