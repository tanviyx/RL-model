import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';
import { DEFAULT_CFG, MAX_QUEUE, createState, step, qTablePolicy } from './simCore.js';
import { loadDemand, listSources, makeRateFn, poisson, formatClock, recordedRange } from './demand.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---------------- configuration ----------------
// Optional external inference service. When unset the learned Q-table is used.
const RL_SERVICE_URL = process.env.RL_SERVICE_URL || '';
const DEMAND_SCALE = Number(process.env.DEMAND_SCALE || 1);      // calibrate real demand to sim capacity
const SPEEDS = [1, 5, 10, 30, 60];                               // simulated seconds per wall tick

// ---------------- learned policy (Q-table) ----------------
const qTablePath = path.join(__dirname, '../config/q_table.json');
let qTable = null;
try {
  qTable = JSON.parse(fs.readFileSync(qTablePath, 'utf-8'));
  console.log(`trafficSim: Q-table loaded (${qTable.length}x${qTable.length} states).`);
} catch (e) {
  console.error('trafficSim: Failed to load Q-table in server:', e.message);
}
const tablePolicy = qTable ? qTablePolicy(qTable) : () => 0;

// ---------------- real demand (optional) ----------------
const demand = loadDemand(path.join(__dirname, '../config/demand.json'));
// The dataset only covers part of the day; the simulated clock stays inside that window.
const range = demand ? recordedRange(demand) : null;
console.log(
  demand
    ? `trafficSim: demand loaded (${Object.keys(demand.days).length} recorded days, ${formatClock(range.start)}-${formatClock(range.end)}).`
    : 'trafficSim: no demand.json found - using synthetic arrivals.'
);

// Where the simulated clock starts (seconds since midnight). DEMAND_START_HOUR may override it.
const startClock = () => {
  const env = process.env.DEMAND_START_HOUR;
  const wanted = env !== undefined && env !== '' ? Number(env) * 3600 : NaN;
  if (range) return Number.isFinite(wanted) && wanted >= range.start && wanted < range.end ? wanted : range.start;
  return Number.isFinite(wanted) ? wanted : 7 * 3600;
};

class TrafficSimulation {
  constructor(io) {
    this.io = io;
    this.isRunning = false;
    this.tickRate = 800;        // wall-clock ms between updates
    this.intervalId = null;
    this.busy = false;
    this.spawnRate = 0.4;       // only used by the "synthetic" source
    this.speed = 1;
    this.intersection = 1;
    this.cfg = { ...DEFAULT_CFG };
    this.sources = ['synthetic', ...listSources(demand)];

    const wanted = process.env.DEMAND_SOURCE;
    this.setSource(
      wanted && this.sources.includes(wanted) ? wanted : demand ? 'profile' : 'synthetic',
      false
    );
    this.resetState();
  }

  resetState() {
    this.state = createState();
    this.epoch = (this.epoch || 0) + 1; // lets clients know the run was restarted
    this.clock = startClock(); // seconds since midnight
  }

  setSource(source, reset = true) {
    if (!this.sources.includes(source)) return false;
    this.source = source;
    this.rateFn = source === 'synthetic' ? null : makeRateFn(demand, source, DEMAND_SCALE);
    this.cfg.maxQueue = source === 'synthetic' ? MAX_QUEUE.synthetic : MAX_QUEUE.real;
    if (reset) this.reset();
    return true;
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.intervalId = setInterval(() => this.tick(), this.tickRate);
    this.broadcastState();
  }

  pause() {
    this.isRunning = false;
    if (this.intervalId) clearInterval(this.intervalId);
    this.intervalId = null;
    this.broadcastState();
  }

  reset() {
    this.pause();
    this.resetState();
    this.broadcastState();
  }

  // Vehicles arriving during the next simulated second
  arrivals() {
    if (!this.rateFn) {
      // synthetic: fixed chance per second per axis (the original behaviour)
      return {
        ns: Math.random() < this.spawnRate ? 1 : 0,
        ew: Math.random() < this.spawnRate ? 1 : 0,
      };
    }
    const r = this.rateFn(this.clock);
    return { ns: poisson(r.ns), ew: poisson(r.ew) };
  }

  // 0 = keep, 1 = switch
  async decide() {
    const s = this.state;
    if (RL_SERVICE_URL) {
      try {
        const response = await axios.post(`${RL_SERVICE_URL}/get_signal`, {
          traffic: [s.nsQueue, s.nsQueue, s.ewQueue, s.ewQueue],
        }, { timeout: 200 });
        const sig = response.data.signal;
        return (sig === 'EW_GREEN' && s.light === 0) || (sig === 'NS_GREEN' && s.light === 1) ? 1 : 0;
      } catch (e) {
        // fall through to the local Q-table
      }
    }
    return tablePolicy(s);
  }

  async tick() {
    if (this.busy) return;
    this.busy = true;
    try {
      // what happened during the simulated seconds covered by this update
      const ev = { arrNS: 0, arrEW: 0, srvNS: 0, srvEW: 0 };
      for (let i = 0; i < this.speed; i++) {
        const action = await this.decide();
        const r = step(this.state, action, this.arrivals(), this.cfg);
        ev.arrNS += r.acceptedNS;
        ev.arrEW += r.acceptedEW;
        ev.srvNS += r.servedNS;
        ev.srvEW += r.servedEW;
        this.clock += 1;
        // replay the recorded window instead of running into hours that have no data
        if (this.rateFn && range && this.clock >= range.end) this.clock = range.start;
      }
      this.broadcastState(ev);
    } finally {
      this.busy = false;
    }
  }

  snapshot() {
    const s = this.state;
    const rates = this.rateFn ? this.rateFn(this.clock) : null;
    return {
      nsQueue: s.nsQueue,
      ewQueue: s.ewQueue,
      light: s.light,
      cleared: s.cleared,
      reward: s.reward,
      cumulativeReward: s.cumulativeReward,
      isRunning: this.isRunning,
      spawnRate: this.spawnRate,
      lanes: this.cfg.lanes,
      intersection: this.intersection,
      simMode: this.cfg.simMode,
      demandSource: this.source,
      sources: this.sources,
      speed: this.speed,
      simTime: formatClock(this.clock),
      rateNS: rates ? Number(rates.ns.toFixed(3)) : null,
      rateEW: rates ? Number(rates.ew.toFixed(3)) : null,
      epoch: this.epoch,
      lostLeft: s.lostLeft,
      lostTime: this.cfg.lostTime,
      timeInPhase: s.timeInPhase,
      minGreen: this.cfg.minGreen,
      maxQueue: this.cfg.maxQueue,
    };
  }

  // `events` is only set by tick(); every other broadcast carries no new traffic
  broadcastState(events = null) {
    this.io.emit('sim_update', { ...this.snapshot(), events });
  }
}

// Singleton for collaborative dashboard viewing
let globalSim = null;

export const initializeSimulation = (io) => {
  globalSim = new TrafficSimulation(io);

  io.on('connection', (socket) => {
    console.log(`[Socket] User connected to Traffic Sim: ${socket.id}`);

    // Transmit an immediate snapshot to syncing client
    socket.emit('sim_update', globalSim.snapshot());

    socket.on('start_sim', () => globalSim.start());
    socket.on('pause_sim', () => globalSim.pause());
    socket.on('reset_sim', () => globalSim.reset());

    socket.on('set_spawn_rate', (rate) => {
      const r = Number(rate);
      if (!Number.isFinite(r)) return;
      globalSim.spawnRate = Math.min(1, Math.max(0, r));
      globalSim.broadcastState();
    });

    socket.on('set_demand_source', (source) => {
      if (typeof source !== 'string' || !globalSim.setSource(source)) {
        console.warn('[Sim] Rejected demand source:', source);
      }
    });

    socket.on('set_speed', (speed) => {
      const sp = Number(speed);
      if (!SPEEDS.includes(sp)) return;
      globalSim.speed = sp;
      globalSim.broadcastState();
    });

    socket.on('update_config', (config) => {
      console.log('[Sim] Updating configuration:', config);
      const lanes = Number(config?.lanes);
      if (Number.isInteger(lanes) && lanes >= 1 && lanes <= 8) globalSim.cfg.lanes = lanes;
      if (config?.intersection) globalSim.intersection = config.intersection;
      if (config?.simMode === 'single' || config?.simMode === 'intersection') {
        globalSim.cfg.simMode = config.simMode;
      }
      globalSim.broadcastState();
    });

    socket.on('disconnect', () => {
      console.log(`[Socket] User disconnected from Traffic Sim: ${socket.id}`);
    });
  });
};