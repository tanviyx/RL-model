import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load the Q-table securely on the backend
const qTablePath = path.join(__dirname, '../config/q_table.json');
let qTable = null;
try {
  qTable = JSON.parse(fs.readFileSync(qTablePath, 'utf-8'));
  console.log("trafficSim: Q-table loaded securely.");
} catch (e) {
  console.error("trafficSim: Failed to load Q-table in server:", e);
}

class TrafficSimulation {
  constructor(io) {
    this.io = io;
    this.nsQueue = 0;
    this.ewQueue = 0;
    this.light = 0; // 0=NS, 1=EW
    this.cleared = 0;
    this.reward = 0;
    this.cumulativeReward = 0;
    this.isRunning = false;
    this.tickRate = 800; // Simulated ms per step
    this.intervalId = null;
    this.spawnRate = 0.4;
    this.lanes = 4;
    this.intersection = 1;
    this.timeInPhase = 0;
    this.simMode = 'intersection';
    this.nsWait = [];
    this.ewWait = [];
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
    this.broadcastState();
  }

  reset() {
    this.pause();
    this.nsQueue = 0;
    this.ewQueue = 0;
    this.light = 0;
    this.cleared = 0;
    this.reward = 0;
    this.cumulativeReward = 0;
    this.broadcastState();
  }
  async tick() {
    // 1. Try to get action from FastAPI, fallback to Q-Table
    let action = 0;
    this.timeInPhase++;

    try {
      const response = await axios.post('http://localhost:8000/get_signal', {
        traffic: [this.nsQueue, this.nsQueue, this.ewQueue, this.ewQueue]
      }, { timeout: 200 });

      const modelSignal = response.data.signal;
      if ((modelSignal === "EW_GREEN" && this.light === 0) || 
          (modelSignal === "NS_GREEN" && this.light === 1)) {
        action = 1;
      } else {
        action = 0;
      }
    } catch (e) {
      // Fallback to local Q-Table logic if FastAPI is down
      const stateNs = Math.min(this.nsQueue, 10);
      const stateEw = Math.min(this.ewQueue, 10);
      if (qTable && qTable[stateNs] && qTable[stateNs][stateEw] && qTable[stateNs][stateEw][this.light]) {
        const actions = qTable[stateNs][stateEw][this.light];
        action = (actions[1] > actions[0]) ? 1 : 0;
      }
    }

    // 2. Apply Agent Action
    let switched = false;
    if (action === 1) {
      this.light = 1 - this.light;
      this.timeInPhase = 0;
      switched = true;
    }
    let currentLight = this.light;

    // 3. Clear Traffic (Lanes affect clearing speed)
    let trafficCleared = 0;
    const clearBatch = Math.ceil(this.lanes / 2);
    
    if (currentLight === 0 && this.nsQueue > 0) {
      const toClear = Math.min(this.nsQueue, clearBatch);
      this.nsQueue -= toClear;
      trafficCleared += toClear;
      this.nsWait.splice(0, toClear); // Remove oldest
    }
    if (currentLight === 1 && this.ewQueue > 0) {
      const toClear = Math.min(this.ewQueue, clearBatch);
      this.ewQueue -= toClear;
      trafficCleared += toClear;
      this.ewWait.splice(0, toClear); // Remove oldest
    }
    this.cleared += trafficCleared;

    // 4. Spawn new cars & Increment wait times
    this.nsWait = this.nsWait.map(t => t + 1);
    this.ewWait = this.ewWait.map(t => t + 1);

    if (Math.random() < this.spawnRate) {
      this.nsQueue = Math.min(this.nsQueue + 1, 10);
      this.nsWait.push(0);
    }
    if (this.simMode === 'intersection') {
      if (Math.random() < this.spawnRate) {
        this.ewQueue = Math.min(this.ewQueue + 1, 10);
        this.ewWait.push(0);
      }
    } else {
      this.ewQueue = 0;
      this.ewWait = [];
    }

    // 5. Calculate Reward (Real-world weighted penalty)
    const totalQueue = this.nsQueue + (this.simMode === 'intersection' ? this.ewQueue : 0);
    const totalWait = (this.nsWait.reduce((a, b) => a + b, 0) + this.ewWait.reduce((a, b) => a + b, 0));
    
    // Penalty for queues AND cumulative wait time
    let currentReward = -(totalQueue * 1.5) - (totalWait * 0.2);
    // Bonus for clearing traffic
    currentReward += trafficCleared * 10.0;
    // Penalty for switching
    if (switched) currentReward -= 5.0;

    this.reward = currentReward;
    this.cumulativeReward += currentReward;

    // Broadcast globally to all watchers
    this.broadcastState();
  }

  broadcastState() {
    this.io.emit('sim_update', {
      nsQueue: this.nsQueue,
      ewQueue: this.ewQueue,
      light: this.light,
      cleared: this.cleared,
      reward: this.reward,
      cumulativeReward: this.cumulativeReward,
      isRunning: this.isRunning,
      spawnRate: this.spawnRate,
      lanes: this.lanes,
      intersection: this.intersection,
      simMode: this.simMode
    });
  }
}

// Singleton for collaborative dashboard viewing
let globalSim = null;

export const initializeSimulation = (io) => {
  globalSim = new TrafficSimulation(io);

  io.on('connection', (socket) => {
    console.log(`[Socket] User connected to Traffic Sim: ${socket.id}`);
    
    // Transmit an immediate snapshot to syncing client
    socket.emit('sim_update', {
      nsQueue: globalSim.nsQueue,
      ewQueue: globalSim.ewQueue,
      light: globalSim.light,
      cleared: globalSim.cleared,
      isRunning: globalSim.isRunning
    });

    socket.on('start_sim', () => globalSim.start());
    socket.on('pause_sim', () => globalSim.pause());
    socket.on('reset_sim', () => globalSim.reset());
    socket.on('set_spawn_rate', (rate) => { globalSim.spawnRate = rate; globalSim.broadcastState(); });

    socket.on('update_config', (config) => {
      console.log("[Sim] Updating configuration:", config);
      if (config.lanes) globalSim.lanes = config.lanes;
      if (config.intersection) globalSim.intersection = config.intersection;
      if (config.simMode) globalSim.simMode = config.simMode;
      globalSim.broadcastState();
    });

    socket.on('disconnect', () => {
      console.log(`[Socket] User disconnected from Traffic Sim: ${socket.id}`);
    });
  });
};
