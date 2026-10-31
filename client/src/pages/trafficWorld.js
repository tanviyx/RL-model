// Visual world for the traffic simulation: cars, their movement, and how they
// follow what the server simulation says happened.
//
// The server (simCore.js) is the source of truth. Each `sim_update` carries
//   events.arrNS / arrEW  vehicles that joined a queue
//   events.srvNS / srvEW  vehicles the server let through
// A car is spawned for every arrival, and a waiting car is only released when
// the server has served a vehicle on that axis. Cars never move backwards.

// ---------------- geometry ----------------
export const W = 800, H = 800;
export const ROAD_W = 144;
export const CX = W / 2, CY = H / 2;
export const NS_L = CX - ROAD_W / 2, NS_R = CX + ROAD_W / 2;
export const EW_T = CY - ROAD_W / 2, EW_B = CY + ROAD_W / 2;
export const PAVE = 22;   // pavement width beside the roads
export const CROSS = 24;  // crosswalk depth
export const CAR_W = 22, CAR_H = 38, CAR_GAP = 8;

export const DIRS = ['NS', 'SN', 'EW', 'WE'];          // NS = southbound, SN = northbound, EW = eastbound, WE = westbound
export const AXIS = { NS: 'NS', SN: 'NS', EW: 'EW', WE: 'EW' };
export const AXIS_DIRS = { NS: ['NS', 'SN'], EW: ['EW', 'WE'] };
export const SIGN = { NS: 1, SN: -1, EW: 1, WE: -1 }; // +1: position grows as the car moves forward

// Where the FRONT of a stopped car sits (the white stop line)
export const STOP_POS = {
  NS: EW_T - CROSS - 8,
  SN: EW_B + CROSS + 8,
  EW: NS_L - CROSS - 8,
  WE: NS_R + CROSS + 8,
};
const START_POS = { NS: -CAR_H, SN: H + CAR_H, EW: -CAR_H, WE: W + CAR_H };
const END_POS = { NS: H + CAR_H * 2, SN: -CAR_H * 2, EW: W + CAR_H * 2, WE: -CAR_H * 2 };

/** Centre line of a lane. Left-hand traffic on both roads (as in India). lane 0 is next to the centre line. */
export function laneCenter(dir, lane, n) {
  const off = (lane + 0.5) * (ROAD_W / 2 / n);
  switch (dir) {
    case 'NS': return CX + off; // southbound, east half
    case 'SN': return CX - off; // northbound, west half
    case 'EW': return CY - off; // eastbound, north half
    default:   return CY + off; // westbound, south half
  }
}

// ---------------- tuning ----------------
const ACCEL = 170;        // px/s^2
const COMFORT_DECEL = 260; // px/s^2, used to plan stops
const MAX_BRAKE = 900;    // px/s^2, hard limit
const SPEED_SCALE = { 1: 1, 5: 1.25, 10: 1.5, 30: 1.8, 60: 2 }; // cars move a bit quicker at high sim speed
const RELEASE_GAP_MS = 110;  // time between two cars being released on the same axis
const CREDIT_TTL_MS = 3500;  // a "you may go" from the server expires if no car can use it
const MAX_CREDIT = 12;
const MAX_BACKLOG = 24;      // arrivals waiting for room at the edge of the map
const APPROACH_RELEASE = 90; // a car this close to the stop line can be released
const PALETTE = ['#d9534f', '#4aa3a0', '#e0b44c', '#5b7fa6', '#c9794a', '#8a6bb0', '#6fae7a', '#c7c9cf', '#b85c7a', '#4f6d8f'];

// ---------------- world ----------------
export function makeWorld(rand = Math.random) {
  return {
    rand,
    cars: [],
    credit: { NS: [], EW: [] },   // timestamps of vehicles the server served but no car has used yet
    backlog: { NS: 0, EW: 0 },    // accepted arrivals not yet drawn
    flip: { NS: 0, EW: 0 },
    lastRelease: { NS: -1e9, EW: -1e9 },
    light: 0, lostLeft: 0, lostTime: 3,
    running: false, speed: 1, lanes: 4, mode: 'intersection',
    epoch: null, dirty: true, uid: 0,
  };
}

export function clearWorld(w) {
  w.cars = [];
  w.credit = { NS: [], EW: [] };
  w.backlog = { NS: 0, EW: 0 };
  w.dirty = true;
}

/** Take in a `sim_update` payload from the server. */
export function applyUpdate(w, d, now) {
  let fresh = w.epoch === null;
  if (w.epoch !== null && (d.epoch ?? 0) !== w.epoch) { clearWorld(w); fresh = true; }
  w.epoch = d.epoch ?? 0;

  const lanes = d.lanes || 4;
  if (lanes !== w.lanes) { w.lanes = lanes; clearWorld(w); fresh = true; }

  w.light = d.light ?? 0;
  w.lostLeft = d.lostLeft ?? 0;
  w.lostTime = d.lostTime ?? 3;
  w.running = !!d.isRunning;
  w.speed = d.speed || 1;
  w.mode = d.simMode || 'intersection';

  if (w.mode === 'single') {
    w.cars = w.cars.filter((c) => AXIS[c.dir] === 'NS');
    w.credit.EW = [];
    w.backlog.EW = 0;
  }

  if (fresh) {
    // joined mid-run (or the map was cleared): show the vehicles that are already queued
    w.backlog.NS = Math.min(MAX_BACKLOG, d.nsQueue || 0);
    w.backlog.EW = w.mode === 'single' ? 0 : Math.min(MAX_BACKLOG, d.ewQueue || 0);
  } else if (d.events && w.running) {
    const e = d.events;
    w.backlog.NS = Math.min(MAX_BACKLOG, w.backlog.NS + (e.arrNS | 0));
    w.backlog.EW = w.mode === 'single' ? 0 : Math.min(MAX_BACKLOG, w.backlog.EW + (e.arrEW | 0));
    addCredit(w.credit.NS, e.srvNS | 0, now);
    if (w.mode !== 'single') addCredit(w.credit.EW, e.srvEW | 0, now);
  }
  w.dirty = true;
}

function addCredit(list, n, now) {
  for (let i = 0; i < n; i++) list.push(now);
  if (list.length > MAX_CREDIT) list.splice(0, list.length - MAX_CREDIT);
}

// ---------------- helpers ----------------
const frontOf = (c) => c.pos + SIGN[c.dir] * CAR_H / 2;
const backOf = (c) => c.pos - SIGN[c.dir] * CAR_H / 2;
const distToLine = (c) => SIGN[c.dir] * (STOP_POS[c.dir] - frontOf(c)); // > 0: still before the line

/**
 * Has `axis` got a released car that has not fully cleared the junction yet?
 * That covers cars inside the box AND cars already released and about to enter it.
 */
export function boxCommittedBy(w, axis) {
  const [lo, hi] = axis === 'NS' ? [EW_T, EW_B] : [NS_L, NS_R];
  return w.cars.some((c) => {
    if (AXIS[c.dir] !== axis || !c.released) return false;
    const sign = SIGN[c.dir];
    const exit = sign > 0 ? hi : lo;
    return sign * (backOf(c) - exit) <= 4; // rear bumper has not passed the far edge yet
  });
}

function trySpawn(w, axis, scale) {
  const pair = AXIS_DIRS[axis];
  const order = w.flip[axis] ? [pair[1], pair[0]] : pair;
  w.flip[axis] ^= 1;
  for (const dir of order) {
    const sign = SIGN[dir];
    const lanes = Array.from({ length: w.lanes }, (_, l) => ({
      l,
      n: w.cars.filter((c) => c.dir === dir && c.lane === l && !c.released).length,
      r: w.rand(),
    })).sort((p, q) => p.n - q.n || p.r - q.r);
    for (const { l } of lanes) {
      const clear = w.cars.every((c) => c.dir !== dir || c.lane !== l || sign * (c.pos - START_POS[dir]) > CAR_H + CAR_GAP + 6);
      if (!clear) continue;
      const vmax = (125 + w.rand() * 45) * scale;
      w.cars.push({
        id: w.uid++, dir, lane: l, pos: START_POS[dir], v: vmax, vmax,
        color: PALETTE[w.uid % PALETTE.length], released: false, braking: false,
      });
      w.backlog[axis]--;
      return;
    }
  }
}

function release(w, axis, now) {
  const credit = w.credit[axis];
  while (credit.length && now - credit[0] > CREDIT_TTL_MS) credit.shift();
  if (!credit.length) return;
  if (w.light !== (axis === 'NS' ? 0 : 1) || w.lostLeft > 0) return; // only while this axis is really green
  if (now - w.lastRelease[axis] < RELEASE_GAP_MS) return;
  if (boxCommittedBy(w, axis === 'NS' ? 'EW' : 'NS')) return;         // never into cross traffic

  // the unreleased car closest to the line (it is always the front of its lane)
  let best = null, bestD = APPROACH_RELEASE;
  for (const c of w.cars) {
    if (AXIS[c.dir] !== axis || c.released) continue;
    const d = distToLine(c);
    if (d <= bestD) { best = c; bestD = d; }
  }
  if (best) {
    best.released = true;
    credit.shift();
    w.lastRelease[axis] = now;
  }
}

/**
 * Advance the world by dt seconds. Returns true when something on screen changed.
 * `now` is a millisecond clock (performance.now() in the browser).
 */
export function stepWorld(w, dt, now) {
  let changed = w.dirty;
  w.dirty = false;
  if (!w.running) return changed;

  const scale = SPEED_SCALE[w.speed] ?? 1;
  const axes = w.mode === 'single' ? ['NS'] : ['NS', 'EW'];

  for (const axis of axes) {
    if (w.backlog[axis] > 0) trySpawn(w, axis, scale);
    release(w, axis, now);
  }

  for (const axis of axes) {
    for (const dir of AXIS_DIRS[axis]) {
      const sign = SIGN[dir];
      for (let lane = 0; lane < w.lanes; lane++) {
        // leader first
        const list = w.cars.filter((c) => c.dir === dir && c.lane === lane).sort((a, b) => sign * (b.pos - a.pos));
        let leader = null;
        for (const c of list) {
          let gap = Infinity;
          if (!c.released) gap = Math.max(0, distToLine(c));
          if (leader) gap = Math.min(gap, Math.max(0, sign * (backOf(leader) - frontOf(c)) - CAR_GAP));

          const allowed = gap === Infinity ? c.vmax : Math.min(c.vmax, Math.sqrt(2 * COMFORT_DECEL * gap));
          const prev = c.v;
          c.v = c.v < allowed ? Math.min(allowed, c.v + ACCEL * dt) : Math.max(allowed, c.v - MAX_BRAKE * dt);
          let move = Math.min(c.v * dt, gap);
          if (gap < 0.3) { c.v = 0; move = Math.min(move, gap); }
          c.pos += sign * move;                     // always forward, never back
          c.braking = c.v < prev - 0.5 || (!c.released && c.v < 8);
          leader = c;
        }
      }
    }
  }

  const before = w.cars.length;
  w.cars = w.cars.filter((c) => SIGN[c.dir] * (c.pos - END_POS[c.dir]) <= 0);
  return changed || w.cars.length > 0 || before > 0;
}

/** Light state for one axis: 'green' | 'amber' | 'red'. During lost time the incoming side stays red. */
export function lampState(axisIdx, s) {
  const lost = (s.lostLeft || 0) > 0;
  if (s.light === axisIdx) return lost ? 'red' : 'green';
  return lost && s.lostLeft >= (s.lostTime || 3) - 1 ? 'amber' : 'red';
}
