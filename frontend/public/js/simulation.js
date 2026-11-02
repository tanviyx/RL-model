'use strict';
/* SmartSignal - Step 6.3 traffic simulation.
   Part 1 (SimCore): the traffic model. No browser code, so it can be tested in Node.
   Part 2 (UI): canvas drawing, controls, statistics. Runs only in the browser. */

const SimCore = (() => {
  // ---- constants (metres, seconds) ----
  const LW = 3.5;            // lane width
  const BOX = 7;             // half size of the intersection box (2 lanes x 3.5 m per direction)
  const STOP = 10.5;         // stop line distance from the centre
  const EDGE = 62;           // where vehicles enter / leave the map
  const VMAX = 13.9;         // 50 km/h
  const ACC = 2.6, BRK = 4.5, COMF = 3.0, EMERG = 9;
  const LEN = 4.5, MIN_GAP = 1.5;
  const DT = 0.1;            // simulation step
  const WINDOW = 300;        // throughput is measured over the last 300 simulated seconds
  const LANE_LEN = EDGE - BOX; // length of each approach lane (map edge to the box), 55 m
  const DENS_LOW = 30, DENS_HIGH = 80; // vehicles per km per lane
  const AI_DURATIONS = [10, 20, 30, 40];   // green times the DQN can choose (same as sumo_env.py)
  const AI_LANE_CAP = 250 / 7.5;           // vehicles in a full 250 m SUMO lane: the scale the model was trained on
  const GREEN = 42, YELLOW = 3; // same fixed-time plan as the SUMO baseline
  const ALL_RED = 1;            // extra 1 s with every signal red so the box clears (visual model only)

  const APPS = [
    { name: 'North', short: 'N', d: [0, 1] },   // vehicles from the north head south (screen y points down)
    { name: 'South', short: 'S', d: [0, -1] },
    { name: 'East', short: 'E', d: [-1, 0] },
    { name: 'West', short: 'W', d: [1, 0] },
  ];
  const SHARE = [0.34, 0.29, 0.20, 0.17];     // approach split used in the project
  const OPP = [1, 0, 3, 2];
  const GROUP = ['NS', 'NS', 'EW', 'EW'];
  const PHASES = [
    { g: 'NS', s: 'G', d: GREEN }, { g: 'NS', s: 'Y', d: YELLOW }, { g: '-', s: 'R', d: ALL_RED },
    { g: 'EW', s: 'G', d: GREEN }, { g: 'EW', s: 'Y', d: YELLOW }, { g: '-', s: 'R', d: ALL_RED },
  ];
  const RANK = { S: 0, R: 1, L: 2 };           // straight and right have priority over left

  const right = (d) => [-d[1], d[0]];
  const left = (d) => [d[1], -d[0]];
  const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
  const mul = (a, k) => [a[0] * k, a[1] * k];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1];

  function mulberry32(a) {
    return () => {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---- paths: approach lane -> through the box -> exit lane ----
  const PATHS = {};
  function buildPath(a, lane, turn) {
    const d = APPS[a].d, r = right(d);
    const offIn = lane === 0 ? 1.5 * LW : 0.5 * LW;      // lane 0 = kerb lane, lane 1 = inner lane
    let d2, outLane;
    if (turn === 'S') { d2 = d; outLane = lane; }
    else if (turn === 'R') { d2 = r; outLane = 0; }
    else { d2 = left(d); outLane = 1; }
    const r2 = right(d2), offOut = outLane === 0 ? 1.5 * LW : 0.5 * LW;
    const P0 = add(mul(d, -EDGE), mul(r, offIn));
    const Pin = add(mul(d, -BOX), mul(r, offIn));
    const Pout = add(mul(d2, BOX), mul(r2, offOut));
    const Pend = add(mul(d2, EDGE), mul(r2, offOut));
    const pts = [P0, Pin];
    if (turn === 'S') pts.push(Pout);
    else {
      const C = add(Pin, mul(d, dot([Pout[0] - Pin[0], Pout[1] - Pin[1]], d)));
      const N = 14;
      for (let i = 1; i <= N; i++) {
        const t = i / N, u = 1 - t;
        pts.push([u * u * Pin[0] + 2 * u * t * C[0] + t * t * Pout[0], u * u * Pin[1] + 2 * u * t * C[1] + t * t * Pout[1]]);
      }
    }
    const outIdx = pts.length - 1;
    pts.push(Pend);
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    return { pts, cum, total: cum[cum.length - 1], sStop: EDGE - STOP, sIn: cum[1], sOut: cum[outIdx],
             outKey: d2[0] + ',' + d2[1] + ':' + outLane };
  }
  for (let a = 0; a < 4; a++) for (const lane of [0, 1]) for (const turn of ['S', 'R', 'L']) {
    if (turn === 'R' && lane === 1) continue;
    if (turn === 'L' && lane === 0) continue;
    PATHS[a + ':' + lane + ':' + turn] = buildPath(a, lane, turn);
  }
  // straight traffic may use either lane; right turns only the kerb lane; left turns only the inner lane

  function posAt(p, s) {
    s = Math.max(0, Math.min(p.total - 1e-6, s));
    let i = 1;
    while (i < p.cum.length - 1 && p.cum[i] < s) i++;
    const a = p.pts[i - 1], b = p.pts[i], seg = p.cum[i] - p.cum[i - 1];
    const f = seg > 0 ? (s - p.cum[i - 1]) / seg : 0;
    return { x: a[0] + (b[0] - a[0]) * f, y: a[1] + (b[1] - a[1]) * f,
             hx: seg > 0 ? (b[0] - a[0]) / seg : 0, hy: seg > 0 ? (b[1] - a[1]) / seg : 1 };
  }

  // ---- the simulation ----
  function createSim(seed = 1, demand = 1200, controller = 'fixed') {
    const rng = mulberry32(seed);
    const expo = (rate) => -Math.log(1 - rng()) / rate;
    const rate = (a) => (demand / 3600) * SHARE[a];
    const S = { t: 0, vs: [], nextId: 1, phaseIdx: 0, phaseT: 0, completed: 0, waitSum: 0, travelSum: 0,
                backlog: [0, 0, 0, 0], dropped: 0, spawned: 0, crossLog: [[], [], [], []], doneLog: [], hist: [], nextSample: 5, next: [0, 1, 2, 3].map((a) => expo(rate(a))) };

    // 'dqn' mode: the signal is run by the trained model. 'fixed' mode: the 42 s / 3 s plan.
    const ai = controller === 'dqn' ? {
      phase: 0, stage: 'green', stageT: 0, stageDur: 0, timeInPhase: 0, due: true,   // due: a decision is needed now
      pendingPhase: 0, pendingGreen: 0, decisions: [], counts: new Array(8).fill(0), switches: 0, greenSum: 0, n: 0,
    } : null;

    const signal = (a) => {
      if (ai) {
        const mine = (GROUP[a] === 'NS') === (ai.phase === 0);
        return ai.stage === 'green' ? (mine ? 'G' : 'R') : ai.stage === 'yellow' ? (mine ? 'Y' : 'R') : 'R';
      }
      const p = PHASES[S.phaseIdx]; return GROUP[a] === p.g ? p.s : 'R';
    };
    const inZone = (v) => Math.abs(v.x) <= BOX + 4 && Math.abs(v.y) <= BOX + 4;

    function trySpawn(a) {
      const x = rng();
      const turn = x < 0.70 ? 'S' : x < 0.85 ? 'R' : 'L';
      let lane;
      if (turn === 'R') lane = 0;
      else if (turn === 'L') lane = 1;
      else {
        const cnt = [0, 0];
        for (const u of S.vs) if (u.app === a && u.s < u.path.sStop) cnt[u.lane]++;
        lane = cnt[0] < cnt[1] ? 0 : cnt[1] < cnt[0] ? 1 : (rng() < 0.5 ? 0 : 1);
      }
      for (const u of S.vs) if (u.app === a && u.lane === lane && u.path.sIn > u.s && u.s < LEN + MIN_GAP + 2) return false;
      const path = PATHS[a + ':' + lane + ':' + turn];
      S.vs.push({ id: S.nextId++, app: a, lane, turn, rank: RANK[turn], path, outKey: path.outKey,
                  s: 0, v: VMAX * 0.6, prevV: VMAX * 0.6, wait: 0, stuck: 0, born: S.t, crossed: false, x: 0, y: 0, hx: 0, hy: 1 });
      S.spawned++;
      return true;
    }

    function speedFor(v, dt) {
      const p = v.path;
      let dFree = Infinity;
      // 1. traffic signal
      if (v.s < p.sStop) {
        const dist = p.sStop - v.s, sg = signal(v.app);
        if (sg === 'R') dFree = Math.min(dFree, dist - 0.5);          // stop 0.5 m before the line
        else if (sg === 'Y' && (v.v * v.v) / (2 * COMF) <= dist) {
          // a left-turner that has waited a while at the line may complete its turn on yellow (as drivers do)
          const sneak = v.turn === 'L' && v.s > p.sStop - 3 && v.wait > 5;
          if (!sneak) dFree = Math.min(dFree, dist - 0.5);
        }
      }
      // 2. left turns wait for a gap in oncoming traffic (not during yellow, so the box clears)
      if (v.turn === 'L' && v.s < p.sIn - 0.3 && signal(v.app) === 'G') {
        const T = Math.max(0.8, 2.0 - v.wait / 12);
        let blocked = false;
        for (const u of S.vs) {
          if (u.app !== OPP[v.app] || u.turn === 'L' || u.s >= u.path.sOut) continue;
          if (u.s < u.path.sStop && signal(u.app) === 'R') continue;   // oncoming vehicle is held by its red light
          if ((u.path.sIn - u.s) < 4 + u.v * T) { blocked = true; break; }
        }
        if (blocked) dFree = Math.min(dFree, (v.s < p.sStop ? p.sStop : p.sIn - 0.3) - v.s - 0.5);
      }
      // 3. other vehicles: car following, then conflicts inside the box
      for (const u of S.vs) {
        if (u === v) continue;
        let gap = null;
        if (u.path === v.path || (u.app === v.app && u.lane === v.lane && v.s < p.sIn)) {
          if (u.s > v.s) gap = u.s - v.s - LEN - MIN_GAP;
        } else if (u.outKey === v.outKey && u.s >= u.path.sOut && v.s >= p.sOut - 3) {
          const ur = u.path.total - u.s, vr = p.total - v.s;
          if (ur < vr) gap = vr - ur - LEN - MIN_GAP;
        }
        if (gap === null) {
          const ddx = u.x - v.x, ddy = u.y - v.y;
          if (ddx * ddx + ddy * ddy > 900) continue;
          const along = ddx * v.hx + ddy * v.hy;
          if (along <= 0) continue;
          const lat = Math.abs(ddx * v.hy - ddy * v.hx);
          if (along > LEN + 5 + v.v * 1.2 || lat > 2.6) continue;
          if (!(inZone(v) && inZone(u))) continue;
          // a vehicle already inside the box has the right of way over one that has not entered yet
          const vIn = v.s >= p.sIn - 0.5, uIn = u.s >= u.path.sIn - 0.5;
          const yields = v.stuck > 6 ? false
            : (!vIn && uIn) ? true
            : (vIn && !uIn) ? false
            : (u.rank < v.rank || (u.rank === v.rank && u.id < v.id));
          if (!yields) continue;
          const par = Math.abs(v.hx * u.hx + v.hy * u.hy);
          gap = along - (par > 0.7 ? LEN : LEN / 2 + 1.2) - MIN_GAP;
        }
        if (gap < dFree) dFree = gap;
      }
      const target = Math.min(VMAX, Math.sqrt(2 * BRK * Math.max(0, dFree)));
      const nv = target > v.v ? Math.min(target, v.v + ACC * dt) : Math.max(target, v.v - EMERG * dt);
      return Math.max(0, nv);
    }

    // AI signal program: one stage at a time (green -> [yellow -> all red -> new green])
    function advanceAi(dt) {
      ai.stageT += dt;
      if (ai.stage === 'green') ai.timeInPhase += dt;       // seconds since this phase turned green (extensions keep counting)
      if (ai.stageT < ai.stageDur - 0.05) return;
      if (ai.stage === 'green') { ai.due = true; ai.stageT = ai.stageDur; }      // green used up: ask the model what to do next
      else if (ai.stage === 'yellow') { ai.stage = 'allred'; ai.stageT = 0; ai.stageDur = ALL_RED; }
      else { ai.phase = ai.pendingPhase; ai.stage = 'green'; ai.stageT = 0; ai.stageDur = ai.pendingGreen; ai.timeInPhase = 0; }
    }

    function step(dt = DT) {
      if (ai && ai.due) return false;     // waiting for the model's decision: simulated time does not move
      S.t += dt;
      if (ai) advanceAi(dt);
      else {
        S.phaseT += dt;
        if (S.phaseT >= PHASES[S.phaseIdx].d) { S.phaseT -= PHASES[S.phaseIdx].d; S.phaseIdx = (S.phaseIdx + 1) % PHASES.length; }
      }
      for (let a = 0; a < 4; a++) {
        while (S.next[a] <= S.t) { S.backlog[a]++; S.next[a] += expo(rate(a)); }
        if (S.backlog[a] > 40) { S.backlog[a]--; S.dropped++; }
        if (S.backlog[a] > 0 && trySpawn(a)) S.backlog[a]--;
      }
      for (const v of S.vs) {
        const c = posAt(v.path, v.s - LEN / 2);
        v.x = c.x; v.y = c.y; v.hx = c.hx; v.hy = c.hy;
      }
      for (const v of S.vs) v.nv = speedFor(v, dt);
      for (const v of S.vs) {
        v.prevV = v.v; v.v = v.nv; v.s += v.v * dt;
        if (v.v < 0.1) v.wait += dt;
        if (!v.crossed && v.s >= v.path.sStop) { v.crossed = true; S.crossLog[v.app].push(S.t); }   // passed the stop line
        v.stuck = (v.s > v.path.sIn - 2 && v.s < v.path.sOut && v.v < 0.1) ? v.stuck + dt : 0;
      }
      S.vs = S.vs.filter((v) => {
        if (v.s < v.path.total) return true;
        S.completed++; S.waitSum += v.wait; S.travelSum += S.t - v.born; S.doneLog.push(S.t);
        return false;
      });
      // keep only the last WINDOW seconds of throughput events
      for (const log of [S.doneLog, ...S.crossLog]) while (log.length && log[0] < S.t - WINDOW) log.shift();
      if (S.t >= S.nextSample) {            // one history sample every 5 simulated seconds
        S.nextSample += 5;
        const m = monitor();
        S.hist.push({ t: S.t, queue: m.totals.queue, onRoad: S.vs.length, throughput: m.throughput.perHour });
        if (S.hist.length > 180) S.hist.shift();
      }
      return true;
    }

    // time until the next green for approach a, and what the signal shows now
    function signalInfo(a) {
      if (ai) {
        const sg = signal(a), rem = Math.max(0, ai.stageDur - ai.stageT), mine = (GROUP[a] === 'NS') === (ai.phase === 0);
        let until = 0, estimate = false;
        if (ai.stage === 'green') { if (!mine) { until = rem + YELLOW + ALL_RED; estimate = true; } }   // earliest, if the agent switches
        else if (ai.stage === 'yellow') {
          if (mine) { until = rem + ALL_RED + ai.pendingGreen + YELLOW + ALL_RED; estimate = true; } else until = rem + ALL_RED;
        } else if ((GROUP[a] === 'NS') === (ai.pendingPhase === 0)) until = rem;
        else { until = rem + ai.pendingGreen + YELLOW + ALL_RED; estimate = true; }
        return { state: sg, left: sg === 'G' || sg === 'Y' ? rem : 0, untilGreen: until, estimate, span: ai.stageDur };
      }
      const ph = PHASES[S.phaseIdx], left = ph.d - S.phaseT, sg = signal(a);
      let untilGreen = 0;
      if (sg !== 'G') {
        untilGreen = left;
        let i = (S.phaseIdx + 1) % PHASES.length;
        while (!(PHASES[i].g === GROUP[a] && PHASES[i].s === 'G')) { untilGreen += PHASES[i].d; i = (i + 1) % PHASES.length; }
      }
      return { state: sg, left, untilGreen, estimate: false, span: ph.d };
    }

    // everything the monitoring section shows
    function monitor() {
      const lanes = [];
      for (let a = 0; a < 4; a++) for (const lane of [0, 1])
        lanes.push({ app: a, lane, count: 0, queue: 0, queueM: 0, avgWait: 0, maxWait: 0, density: 0, level: 'Low', _w: 0, _minS: Infinity });
      let onApproach = 0, waitSum = 0, maxWait = 0;
      for (const v of S.vs) {
        if (v.s >= v.path.sIn) continue;               // already inside the box: not counted in a lane
        const L = lanes[v.app * 2 + v.lane];
        L.count++; L._w += v.wait; if (v.wait > L.maxWait) L.maxWait = v.wait;
        onApproach++; waitSum += v.wait; if (v.wait > maxWait) maxWait = v.wait;
        if (v.s < v.path.sStop + 2 && v.v < 0.5) { L.queue++; if (v.s < L._minS) L._minS = v.s; }
      }
      let qTotal = 0, qMaxM = 0;
      for (const L of lanes) {
        L.density = L.count / (LANE_LEN / 1000);
        L.level = L.density < DENS_LOW ? 'Low' : L.density < DENS_HIGH ? 'Moderate' : 'High';
        L.avgWait = L.count ? L._w / L.count : 0;
        L.queueM = L.queue ? Math.max(0, EDGE - STOP - L._minS + LEN) : 0;
        qTotal += L.queue; if (L.queueM > qMaxM) qMaxM = L.queueM;
      }
      const win = Math.min(WINDOW, S.t), perHour = (n) => (win >= 10 ? (n / win) * 3600 : 0);
      const approaches = [0, 1, 2, 3].map((a) => ({ ...signalInfo(a), discharge: perHour(S.crossLog[a].length) }));
      return {
        lanes, approaches,
        totals: { onApproach, queue: qTotal, queueMaxM: qMaxM, avgWait: onApproach ? waitSum / onApproach : 0, maxWait },
        throughput: { perHour: perHour(S.doneLog.length), completed: S.completed, entered: S.spawned,
                      pct: S.spawned ? (S.completed / S.spawned) * 100 : 0, windowSec: win },
      };
    }

    function snapshot() {
      const queues = [0, 0, 0, 0];
      let maxWait = 0;
      for (const v of S.vs) {
        if (v.s < v.path.sStop + 2 && v.v < 0.5) queues[v.app]++;
        if (v.wait > maxWait) maxWait = v.wait;
      }
      const ph = PHASES[S.phaseIdx];
      const phase = ai
        ? { name: ai.stage === 'allred' ? 'All red (clearing)' : (ai.phase === 0 ? 'North\u2013South' : 'East\u2013West') + (ai.stage === 'green' ? ' green' : ' yellow'),
            remaining: Math.max(0, ai.stageDur - ai.stageT) }
        : { name: ph.g === '-' ? 'All red (clearing)' : (ph.g === 'NS' ? 'North\u2013South' : 'East\u2013West') + (ph.s === 'G' ? ' green' : ' yellow'),
            remaining: ph.d - S.phaseT };
      return {
        t: S.t, onRoad: S.vs.length, completed: S.completed,
        avgWait: S.completed ? S.waitSum / S.completed : 0,
        avgTravel: S.completed ? S.travelSum / S.completed : 0,
        maxWait, queues, totalQueue: queues.reduce((x, y) => x + y, 0),
        signals: [0, 1, 2, 3].map(signal),
        phase,
        backlog: S.backlog.reduce((x, y) => x + y, 0), dropped: S.dropped,
      };
    }

    // ---- AI interface ----------------------------------------------------------------------
    // The 35-value state, laid out and scaled exactly as sumo_env.get_state() does:
    // per lane [halting, vehicles, waiting time, occupancy] for N0 N1 S0 S1 E0 E1 W0 W1 (lane 0 = kerb lane),
    // then the current phase (one-hot) and the time spent in it. Values are what SUMO would report for the same
    // vehicles on its 250 m lanes; the browser lanes are shorter (55 m), so very long queues saturate earlier.
    function aiState() {
      const L = Array.from({ length: 8 }, () => ({ halt: 0, count: 0, wait: 0 }));
      for (const v of S.vs) {
        if (v.s >= v.path.sIn) continue;
        const l = L[v.app * 2 + v.lane];
        l.count++; l.wait += v.wait; if (v.v < 0.1) l.halt++;
      }
      const f = [];
      for (const l of L) f.push(Math.min(l.halt / AI_LANE_CAP, 1), Math.min(l.count / AI_LANE_CAP, 1),
                                Math.min(l.wait / 500, 1), Math.min((l.count * LEN) / 250, 1));
      const phase = ai ? ai.phase : (PHASES[S.phaseIdx].g === 'NS' ? 0 : 1);
      f.push(phase === 0 ? 1 : 0, phase === 0 ? 0 : 1, Math.min((ai ? ai.timeInPhase : S.phaseT) / 60, 1));
      return f;
    }

    // apply the model's answer: action = phase * 4 + duration index
    function applyAction(action, q) {
      if (!ai || !ai.due) throw new Error('no decision is pending');
      if (!Number.isInteger(action) || action < 0 || action > 7) throw new Error('invalid action ' + action);
      const phase = Math.floor(action / 4), green = AI_DURATIONS[action % 4], changed = phase !== ai.phase;
      const snap = snapshot();
      ai.decisions.push({ n: ++ai.n, t: S.t, action, phase, green, changed, q: q || null, queue: snap.totalQueue, state: aiState() });
      if (ai.decisions.length > 200) ai.decisions.shift();
      ai.counts[action]++; ai.greenSum += green;
      if (changed) { ai.stage = 'yellow'; ai.stageT = 0; ai.stageDur = YELLOW; ai.pendingPhase = phase; ai.pendingGreen = green; ai.switches++; }
      else { ai.stage = 'green'; ai.stageT = 0; ai.stageDur = green; }     // same phase: extend the green
      ai.due = false;
    }

    return {
      step, snapshot, signal, monitor, aiState, applyAction,
      controller,
      needsDecision: () => !!(ai && ai.due),
      get ai() { return ai; },
      get vehicles() { return S.vs; },
      get history() { return S.hist; },
      get time() { return S.t; },
      setDemand(v) {
        demand = v;
        for (let a = 0; a < 4; a++) S.next[a] = S.t + expo(rate(a));
      },
    };
  }

  return { createSim, DT, APPS, LEN, BOX, STOP, EDGE, LW, GREEN, YELLOW, ALL_RED, SHARE, LANE_LEN, DENS_LOW, DENS_HIGH, WINDOW, AI_DURATIONS };
})();

if (typeof module !== 'undefined') module.exports = SimCore;

/* ---------------------------- UI (browser only) ---------------------------- */
(() => {
  if (typeof document === 'undefined') return;
  const { createSim, DT, APPS, LEN, BOX, STOP, EDGE, LW, GREEN, YELLOW, LANE_LEN, DENS_LOW, DENS_HIGH, AI_DURATIONS } = SimCore;
  const $ = (id) => document.getElementById(id);
  const canvas = $('scene'), ctx = canvas.getContext('2d');
  const PXM = 6.4, SEED = 1;                       // pixels per metre, random seed (Reset repeats the same run)
  const X = (m) => 400 + m * PXM, Y = (m) => 400 + m * PXM;
  const COL = { ground: '#d5d9c8', road: '#3b4249', paint: '#e9e6dc', yellow: '#e2b53a',
                G: '#2fbf71', Y: '#f2b632', R: '#e5483b' };
  const CARS = ['#c8553d', '#2f6f8f', '#e0a526', '#5b8c5a', '#7d5ba6', '#e8e4da', '#56646e', '#d98aa3'];
  const WORD = { G: 'Green', Y: 'Yellow', R: 'Red' };

  let controller = new URLSearchParams(location.search).get('controller') === 'dqn' ? 'dqn' : 'fixed';
  $('controller').value = controller;
  let sim = createSim(SEED, +$('demand').value, controller);
  let inFlight = false, modelInfo = null;
  let running = false, speed = 1, last = null, acc = 0, uiTimer = 0;

  /* ---- drawing ---- */
  function line(x1, y1, x2, y2, color, wM, dash) {
    ctx.beginPath(); ctx.moveTo(X(x1), Y(y1)); ctx.lineTo(X(x2), Y(y2));
    ctx.strokeStyle = color; ctx.lineWidth = wM * PXM;
    ctx.setLineDash(dash ? dash.map((d) => d * PXM) : []); ctx.stroke(); ctx.setLineDash([]);
  }
  function rectM(x, y, w, h) { ctx.fillRect(X(x), Y(y), w * PXM, h * PXM); }

  function drawRoads() {
    ctx.fillStyle = COL.ground; ctx.fillRect(0, 0, 800, 800);
    ctx.fillStyle = COL.road;
    rectM(-BOX, -EDGE - 2, 2 * BOX, 2 * EDGE + 4);
    rectM(-EDGE - 2, -BOX, 2 * EDGE + 4, 2 * BOX);
    for (const g of [-1, 1]) {
      line(-0.15, g * 11, -0.15, g * EDGE, COL.yellow, 0.2); line(0.15, g * 11, 0.15, g * EDGE, COL.yellow, 0.2);
      line(g * 11, -0.15, g * EDGE, -0.15, COL.yellow, 0.2); line(g * 11, 0.15, g * EDGE, 0.15, COL.yellow, 0.2);
      for (const o of [-3.5, 3.5]) {
        line(o, g * 11, o, g * EDGE, COL.paint, 0.15, [3, 4]);
        line(g * 11, o, g * EDGE, o, COL.paint, 0.15, [3, 4]);
      }
    }
    ctx.fillStyle = COL.paint; ctx.globalAlpha = 0.85;
    for (const g of [-1, 1]) for (let o = -6.6; o <= 6.61; o += 1.2) {
      rectM(o - 0.3, g * 8.75 - 1.25, 0.6, 2.5); rectM(g * 8.75 - 1.25, o - 0.3, 2.5, 0.6);
    }
    ctx.globalAlpha = 1;
  }

  function drawSignals(snap) {
    APPS.forEach((A, a) => {
      const d = A.d, r = [-d[1], d[0]], st = snap.signals[a];
      // stop line takes the colour of the signal
      const p1 = [-d[0] * STOP, -d[1] * STOP], p2 = [p1[0] + r[0] * BOX, p1[1] + r[1] * BOX];
      line(p1[0], p1[1], p2[0], p2[1], COL[st], 0.5);
      // signal head beside the approach
      const hx = X(-d[0] * (STOP + 2.2) + r[0] * (BOX + 1.4)), hy = Y(-d[1] * (STOP + 2.2) + r[1] * (BOX + 1.4));
      ctx.fillStyle = '#13171a';
      ctx.beginPath(); ctx.roundRect ? ctx.roundRect(hx - 8, hy - 21, 16, 42, 5) : ctx.rect(hx - 8, hy - 21, 16, 42); ctx.fill();
      ['R', 'Y', 'G'].forEach((c, i) => {
        const lit = st === c;
        ctx.beginPath(); ctx.arc(hx, hy - 13 + i * 13, 4.6, 0, 6.2832);
        ctx.fillStyle = COL[c]; ctx.globalAlpha = lit ? 1 : 0.2;
        ctx.shadowColor = COL[c]; ctx.shadowBlur = lit ? 12 : 0; ctx.fill();
        ctx.shadowBlur = 0; ctx.globalAlpha = 1;
      });
    });
  }

  // lane shading by density, and a white bar at the end of each queue
  function drawOverlay(mon) {
    if (!$('overlay').checked) return;
    for (const L of mon.lanes) {
      const d = APPS[L.app].d, r = [-d[1], d[0]], off = L.lane === 0 ? 1.5 * LW : 0.5 * LW, hw = LW / 2;
      const pt = (dist, side) => [-d[0] * dist + r[0] * (off + side), -d[1] * dist + r[1] * (off + side)];
      const c = [pt(STOP, -hw), pt(STOP, hw), pt(EDGE, hw), pt(EDGE, -hw)];
      const rgb = L.density < DENS_LOW ? '47,191,113' : L.density < DENS_HIGH ? '242,182,50' : '229,72,59';
      ctx.beginPath(); c.forEach((q, i) => (i ? ctx.lineTo(X(q[0]), Y(q[1])) : ctx.moveTo(X(q[0]), Y(q[1])))); ctx.closePath();
      ctx.fillStyle = 'rgba(' + rgb + ',' + (0.12 + Math.min(0.3, L.density / 260)).toFixed(2) + ')'; ctx.fill();
      if (L.queue > 0) { const a = pt(STOP + L.queueM, -hw), b = pt(STOP + L.queueM, hw); line(a[0], a[1], b[0], b[1], '#ffffff', 0.4); }
    }
  }

  function drawVehicles() {
    for (const v of sim.vehicles) {
      const ang = Math.atan2(v.hy, v.hx), L = LEN * PXM, W = 1.8 * PXM;
      ctx.save(); ctx.translate(X(v.x), Y(v.y)); ctx.rotate(ang);
      ctx.fillStyle = CARS[(v.id * 5) % CARS.length];
      ctx.beginPath(); ctx.roundRect ? ctx.roundRect(-L / 2, -W / 2, L, W, 3) : ctx.rect(-L / 2, -W / 2, L, W); ctx.fill();
      ctx.fillStyle = 'rgba(20,24,28,0.55)'; ctx.fillRect(L * 0.08, -W / 2 + 1.5, L * 0.22, W - 3);
      if (v.v < v.prevV - 0.02 || v.v < 0.1) { ctx.fillStyle = '#ff3b30'; ctx.fillRect(-L / 2, -W / 2 + 1, 2, 3); ctx.fillRect(-L / 2, W / 2 - 4, 2, 3); }
      ctx.restore();
    }
  }

  function drawLabels(snap) {
    ctx.font = '700 13px "Bricolage Grotesque", system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    APPS.forEach((A, a) => {
      const x = X(-A.d[0] * 57), y = Y(-A.d[1] * 57), txt = A.short + '  ' + snap.queues[a];
      const w = ctx.measureText(txt).width + 16;
      ctx.fillStyle = 'rgba(28,34,38,0.85)';
      ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x - w / 2, y - 11, w, 22, 11) : ctx.rect(x - w / 2, y - 11, w, 22); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.fillText(txt, x, y + 1);
    });
  }

  function render(snap, mon) {
    const k = canvas.width / 800;
    ctx.setTransform(k, 0, 0, k, 0, 0);
    drawRoads(); drawOverlay(mon); drawVehicles(); drawSignals(snap); drawLabels(snap);
  }

  /* ---- panel ---- */
  const mmss = (t) => String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(Math.floor(t % 60)).padStart(2, '0');
  function updatePanel(s) {
    $('s-time').textContent = mmss(s.t);
    $('s-road').textContent = s.onRoad;
    $('s-done').textContent = s.completed;
    $('s-wait').textContent = s.completed ? s.avgWait.toFixed(1) + ' s' : '\u2013';
    $('s-max').textContent = s.maxWait.toFixed(0) + ' s';
    $('s-queue').textContent = s.totalQueue;
    $('phase-name').textContent = s.phase.name;
    $('phase-left').textContent = Math.ceil(s.phase.remaining) + ' s left';
    document.querySelectorAll('#approaches li').forEach((li) => {
      const a = +li.dataset.a;
      li.querySelector('.dot').dataset.state = s.signals[a];
      li.querySelector('.state').textContent = WORD[s.signals[a]];
      li.querySelector('.q').textContent = s.queues[a];
      li.querySelector('.bar i').style.width = Math.min(100, s.queues[a] * 5) + '%';
    });
  }

  /* ---- monitoring section ---- */
  const laneRows = [], sigCards = [];
  APPS.forEach((A, a) => {
    [0, 1].forEach((lane) => {
      const tr = document.createElement('tr');
      tr.innerHTML = '<th scope="row">' + A.name + '<span class="tag">' + (lane === 0 ? 'kerb' : 'inner') + '</span></th><td class="c-count"></td>' +
        '<td><span class="mini"><i></i></span><span class="c-dens"></span></td><td class="c-level lvl"></td><td class="c-q"></td><td class="c-qm"></td><td class="c-wait"></td><td class="c-max"></td>';
      $('lane-rows').appendChild(tr); laneRows.push(tr);
    });
    const card = document.createElement('article');
    card.className = 'sig';
    card.innerHTML = '<div class="sig-top"><b>' + A.name + '</b><span class="pill" data-state="R">Red</span></div>' +
      '<div class="sig-num"><span class="n">0</span><small></small></div><div class="bar"><i></i></div><p>Passed stop line: <b class="dis">0</b> veh/h</p>';
    $('sig-strip').appendChild(card); sigCards.push(card);
  });
  const SIG_TXT = { G: ['Green', 's green left'], Y: ['Yellow', 's yellow left'], R: ['Red', 's until green'] };
  const f0 = (n) => Math.round(n).toLocaleString('en-US');

  function updateMonitor(mon) {
    mon.lanes.forEach((L, i) => {
      const tr = laneRows[i], lv = L.density < DENS_LOW ? '' : L.density < DENS_HIGH ? 'mid' : 'high';
      tr.querySelector('.c-count').textContent = L.count;
      tr.querySelector('.c-dens').textContent = f0(L.density);
      const mini = tr.querySelector('.mini'); mini.className = 'mini ' + lv; mini.firstChild.style.width = Math.min(100, L.density / 1.6) + '%';
      tr.querySelector('.c-level').textContent = L.level;
      tr.querySelector('.c-q').textContent = L.queue;
      tr.querySelector('.c-qm').textContent = L.queueM.toFixed(0) + ' m';
      tr.querySelector('.c-wait').textContent = L.avgWait.toFixed(1) + ' s';
      tr.querySelector('.c-max').textContent = L.maxWait.toFixed(0) + ' s';
    });
    const T = mon.totals;
    $('t-count').textContent = T.onApproach; $('t-dens').textContent = f0(T.onApproach / (LANE_LEN / 1000) / 8);
    $('t-q').textContent = T.queue; $('t-qm').textContent = T.queueMaxM.toFixed(0) + ' m (longest)';
    $('t-wait').textContent = T.avgWait.toFixed(1) + ' s'; $('t-max').textContent = T.maxWait.toFixed(0) + ' s';
    mon.approaches.forEach((A, a) => {
      const c = sigCards[a], st = A.state, txt = SIG_TXT[st];
      c.dataset.state = st;
      const pill = c.querySelector('.pill'); pill.dataset.state = st; pill.textContent = txt[0];
      c.querySelector('.n').textContent = Math.ceil(st === 'R' ? A.untilGreen : A.left);
      c.querySelector('small').textContent = st === 'R' && A.estimate ? 's earliest green' : txt[1];
      c.querySelector('.bar i').style.width = (st === 'R' ? 0 : Math.min(100, (A.left / (A.span || 1)) * 100)) + '%';
      c.querySelector('.dis').textContent = f0(A.discharge);
    });
    const th = mon.throughput;
    $('k-thru').textContent = f0(th.perHour);
    $('k-thru-sub').textContent = th.windowSec < 10 ? 'collecting data\u2026' : 'vehicles per hour (last ' + Math.round(th.windowSec / 60 * 10) / 10 + ' min)';
    $('k-done').textContent = th.completed.toLocaleString('en-US');
    $('k-done-sub').textContent = 'of ' + th.entered.toLocaleString('en-US') + ' entered' + (th.entered ? ' (' + th.pct.toFixed(0) + '%)' : '');
    $('k-wait').textContent = T.avgWait.toFixed(1) + ' s'; $('k-wait-sub').textContent = 'longest ' + T.maxWait.toFixed(0) + ' s';
    $('k-queue').textContent = T.queue; $('k-queue-sub').textContent = 'longest queue ' + T.queueMaxM.toFixed(0) + ' m';
  }

  function drawChart(cv, data, key, color) {
    const dpr = Math.min(2, window.devicePixelRatio || 1), W = cv.clientWidth, H = 160;
    if (!W) return;
    if (cv.width !== Math.round(W * dpr) || cv.height !== H * dpr) { cv.width = Math.round(W * dpr); cv.height = H * dpr; }
    const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
    const padL = 40, padR = 10, padT = 10, padB = 22, w = W - padL - padR, h = H - padT - padB;
    const tNow = data.length ? data[data.length - 1].t : 0, span = 600;
    const vals = data.map((d) => d[key]);
    let max = Math.max(5, ...vals) * 1.15; const mag = Math.pow(10, Math.floor(Math.log10(max))); max = Math.ceil(max / mag) * mag;
    g.font = '11px "Bricolage Grotesque", system-ui, sans-serif'; g.fillStyle = '#5d676e'; g.strokeStyle = '#d9d6cd'; g.lineWidth = 1;
    g.textAlign = 'right'; g.textBaseline = 'middle';
    for (let i = 0; i <= 2; i++) {
      const y = padT + h - (h * i) / 2; g.beginPath(); g.moveTo(padL, y); g.lineTo(W - padR, y); g.stroke(); g.fillText(Math.round((max * i) / 2), padL - 6, y);
    }
    g.textAlign = 'left'; g.textBaseline = 'top'; g.fillText('\u221210 min', padL, H - 15); g.textAlign = 'right'; g.fillText('now', W - padR, H - 15);
    if (data.length < 2) return;
    g.beginPath();
    data.forEach((d, i) => {
      const x = padL + w * (1 - (tNow - d.t) / span), y = padT + h - (h * d[key]) / max;
      i ? g.lineTo(x, y) : g.moveTo(x, y);
    });
    g.strokeStyle = color; g.lineWidth = 2; g.stroke();
  }

  /* ---- AI signal control section ---- */
  const Q_NAMES = AI_DURATIONS.map((d) => 'North\u2013South ' + d + ' s').concat(AI_DURATIONS.map((d) => 'East\u2013West ' + d + ' s'));
  const LANE_NAMES = ['North kerb', 'North inner', 'South kerb', 'South inner', 'East kerb', 'East inner', 'West kerb', 'West inner'];
  Q_NAMES.forEach((n) => {
    const li = document.createElement('li');
    li.innerHTML = '<span>' + n + '</span><span class="qb"><i></i></span><span class="qv">–</span>';
    $('ai-q').appendChild(li);
  });

  function showAiError(msg) { const e = $('ai-error'); e.textContent = msg || ''; e.hidden = !msg; }
  function setBadge(online, text) { $('ai-badge').classList.toggle('on', online); $('ai-badge-text').textContent = text; }

  async function refreshModelStatus() {
    try {
      const r = await fetch('/api/ai/status');
      if (r.status === 401) return (location.href = '/login');
      const d = await r.json();
      if (d.online) { modelInfo = d; setBadge(true, 'Model online \u00b7 trained ' + d.episode + ' episodes \u00b7 ' + d.backend); }
      else { modelInfo = null; setBadge(false, 'Model offline'); }
    } catch { modelInfo = null; setBadge(false, 'Model offline'); }
  }

  async function requestDecision() {
    if (inFlight) return;
    inFlight = true;
    const mine = sim;
    try {
      const r = await fetch('/api/ai/decide', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ state: mine.aiState() }) });
      if (r.status === 401) return (location.href = '/login');
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.message || 'The AI model request failed (' + r.status + ').');
      if (mine !== sim) return;                       // the simulation was reset while waiting
      mine.applyAction(d.action, d.q_values);
      showAiError('');
    } catch (e) {
      if (mine === sim) { setRunning(false); showAiError(e.message + ' The simulation is paused; press Start to retry.'); refreshModelStatus(); }
    } finally { inFlight = false; }
  }

  function drawBars(cv, decisions) {
    const dpr = Math.min(2, window.devicePixelRatio || 1), W = cv.clientWidth, H = 170;
    if (!W) return;
    if (cv.width !== Math.round(W * dpr) || cv.height !== H * dpr) { cv.width = Math.round(W * dpr); cv.height = H * dpr; }
    const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
    const padL = 34, padR = 8, padT = 10, padB = 20, w = W - padL - padR, h = H - padT - padB, max = 45;
    const Yv = (v) => padT + h - (h * v) / max;
    g.font = '11px "Bricolage Grotesque", system-ui, sans-serif'; g.fillStyle = '#5d676e'; g.strokeStyle = '#d9d6cd'; g.lineWidth = 1;
    g.textAlign = 'right'; g.textBaseline = 'middle';
    [0, 10, 20, 30, 40].forEach((v) => { g.beginPath(); g.moveTo(padL, Yv(v)); g.lineTo(W - padR, Yv(v)); g.stroke(); g.fillText(v, padL - 5, Yv(v)); });
    const shown = decisions.slice(-30), slot = w / 30, bw = Math.max(3, slot * 0.7);
    shown.forEach((d, i) => {
      const x = padL + slot * (30 - shown.length + i) + (slot - bw) / 2;
      g.fillStyle = d.phase === 0 ? '#2f6f8f' : '#e0a526'; g.fillRect(x, Yv(d.green), bw, Yv(0) - Yv(d.green));
    });
    g.setLineDash([5, 4]); g.strokeStyle = '#1c2226'; g.beginPath(); g.moveTo(padL, Yv(42)); g.lineTo(W - padR, Yv(42)); g.stroke(); g.setLineDash([]);
    g.fillStyle = '#1c2226'; g.textAlign = 'left'; g.textBaseline = 'bottom'; g.fillText('fixed plan 42 s', padL + 4, Yv(42) - 2);
    g.fillStyle = '#5d676e'; g.textBaseline = 'top'; g.textAlign = 'left'; g.fillText('older', padL, H - 14); g.textAlign = 'right'; g.fillText('latest', W - padR, H - 14);
  }

  function updateAi(snap) {
    const ai = sim.ai;
    $('ai-idle').hidden = !!ai; $('ai-live').hidden = !ai;
    if (!ai) return;
    const last = ai.decisions[ai.decisions.length - 1];
    if (last) {
      $('ai-title').textContent = (last.phase === 0 ? 'North\u2013South' : 'East\u2013West') + ' \u00b7 ' + last.green + ' s green';
      $('ai-meta').textContent = 'Decision #' + last.n + ' at ' + mmss(last.t) + ' \u00b7 ' +
        (last.changed ? 'switched phase (3 s yellow and 1 s all red inserted)' : 'kept the same phase and extended the green');
    }
    const stage = snap.phase.name + ' \u00b7 ' + Math.ceil(snap.phase.remaining) + ' s left' + (sim.needsDecision() ? ' \u00b7 asking the model\u2026' : '');
    $('ai-stage').textContent = 'Now: ' + stage;
    $('ai-prog').style.width = ai.stageDur ? Math.min(100, (ai.stageT / ai.stageDur) * 100) + '%' : '0%';
    $('ai-n').textContent = ai.n; $('ai-sw').textContent = ai.switches;
    $('ai-avg').textContent = ai.n ? (ai.greenSum / ai.n).toFixed(1) + ' s' : '\u2013';
    // Q-values
    if (last && last.q) {
      const mn = Math.min(...last.q), mx = Math.max(...last.q), best = last.action;
      [...$('ai-q').children].forEach((li, i) => {
        li.classList.toggle('best', i === best);
        li.querySelector('i').style.width = (mx > mn ? 8 + 92 * ((last.q[i] - mn) / (mx - mn)) : 50) + '%';
        li.querySelector('.qv').textContent = last.q[i].toFixed(1);
      });
    }
    // history table (latest first)
    const tb = $('ai-history').querySelector('tbody'); tb.textContent = '';
    ai.decisions.slice(-8).reverse().forEach((d) => {
      const tr = document.createElement('tr');
      [d.n, mmss(d.t), d.phase === 0 ? 'North\u2013South' : 'East\u2013West', d.green + ' s', d.changed ? 'switch' : 'extend', d.queue].forEach((v, i) => {
        const td = document.createElement('td'); td.textContent = v; if (i === 2) td.style.textAlign = 'left'; tr.appendChild(td);
      });
      tb.appendChild(tr);
    });
    drawBars($('ai-chart'), ai.decisions);
    // state sent
    if (last && last.state) {
      const sb = $('ai-state').querySelector('tbody'); sb.textContent = '';
      LANE_NAMES.forEach((n, i) => {
        const tr = document.createElement('tr'), th = document.createElement('th'); th.scope = 'row'; th.textContent = n; tr.appendChild(th);
        for (let k = 0; k < 4; k++) { const td = document.createElement('td'); td.textContent = last.state[i * 4 + k].toFixed(2); tr.appendChild(td); }
        sb.appendChild(tr);
      });
      $('ai-state-extra').textContent = 'Phase: ' + (last.state[32] ? 'North\u2013South' : 'East\u2013West') + ' green \u00b7 time spent in phase: ' + (last.state[34] * 60).toFixed(0) + ' s (scaled 0 to 1 over 60 s)';
    }
  }

  /* ---- state + controls ---- */
  function setRunning(on) {
    running = on; last = null;
    $('start').disabled = on; $('pause').disabled = !on;
    $('start').textContent = sim.time > 0 ? 'Resume' : 'Start';
    const h = $('hint');
    h.hidden = on;
    h.textContent = sim.time > 0 ? 'Paused' : 'Press Start to begin';
    $('status').textContent = on ? 'Running' : sim.time > 0 ? 'Paused' : 'Ready';
    $('live-text').textContent = on ? 'Live' : sim.time > 0 ? 'Paused' : 'Ready';
    $('live').classList.toggle('on', on);
  }
  $('start').addEventListener('click', () => setRunning(true));
  $('pause').addEventListener('click', () => setRunning(false));
  function resetSim() { sim = createSim(SEED, +$('demand').value, controller); acc = 0; inFlight = false; showAiError(''); setRunning(false); $('status').textContent = 'Reset'; }
  $('reset').addEventListener('click', resetSim);
  $('controller').addEventListener('change', (e) => { controller = e.target.value; resetSim(); if (controller === 'dqn') refreshModelStatus(); });
  $('ai-use').addEventListener('click', () => { $('controller').value = controller = 'dqn'; resetSim(); refreshModelStatus(); });
  $('demand').addEventListener('input', (e) => { $('demand-out').textContent = (+e.target.value).toLocaleString('en-US') + ' vehicles/hour'; sim.setDemand(+e.target.value); });
  $('speed').addEventListener('change', (e) => { speed = +e.target.value; });
  document.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && e.target === document.body) { e.preventDefault(); setRunning(!running); }
  });

  function resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1), w = Math.round(canvas.clientWidth * dpr);
    if (canvas.width !== w) { canvas.width = w; canvas.height = w; }
  }
  new ResizeObserver(resize).observe(canvas);

  function frame(ts) {
    if (last === null) last = ts;
    const dtReal = Math.min(0.1, (ts - last) / 1000); last = ts;
    if (running) {
      acc += dtReal * speed;
      let n = 0;
      while (acc >= DT && n < 120) {
        if (sim.needsDecision()) { requestDecision(); break; }        // AI mode: ask the model before time moves on
        sim.step(DT); acc -= DT; n++;
      }
      if (n === 120 || inFlight) acc = Math.min(acc, 0.5);
    }
    const snap = sim.snapshot(), mon = sim.monitor();
    render(snap, mon);
    if (ts - uiTimer > 200) {
      updatePanel(snap); updateMonitor(mon); updateAi(snap);
      drawChart($('ch-queue'), sim.history, 'queue', '#c8553d'); drawChart($('ch-thru'), sim.history, 'throughput', '#2f6f8f');
      uiTimer = ts;
    }
    requestAnimationFrame(frame);
  }

  /* ---- user + logout ---- */
  fetch('/api/auth/me').then((r) => (r.ok ? r.json() : Promise.reject())).then((u) => { $('who').textContent = u.email; })
    .catch(() => { location.href = '/login'; });
  $('logout').addEventListener('click', async () => {
    const r = await fetch('/api/auth/logout', { method: 'POST' });
    location.href = (await r.json()).redirect;
  });

  refreshModelStatus();
  resize(); setRunning(false); $('demand-out').textContent = (+$('demand').value).toLocaleString('en-US') + ' vehicles/hour';
  requestAnimationFrame(frame);
})();
