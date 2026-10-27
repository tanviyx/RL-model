import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_CFG, createState, step, summarize,
  fixedTimePolicy, longestQueuePolicy, qTablePolicy,
} from "../services/simCore.js";
import { mulberry32 } from "../services/demand.js";

const quiet = { ns: 0, ew: 0 };
const withQueue = (ns, ew) => {
  const s = createState();
  s.nsQueue = ns; s.nsWait = new Array(ns).fill(0);
  s.ewQueue = ew; s.ewWait = new Array(ew).fill(0);
  return s;
};

test("no vehicle is created or lost: arrived = served + still queued + dropped", () => {
  const rng = mulberry32(7);
  const cfg = { ...DEFAULT_CFG, maxQueue: 12 };
  const s = createState();
  for (let t = 0; t < 3000; t++) {
    const arrivals = { ns: rng() < 0.6 ? 1 + (rng() < 0.2 ? 1 : 0) : 0, ew: rng() < 0.5 ? 1 : 0 };
    step(s, rng() < 0.3 ? 1 : 0, arrivals, cfg);
  }
  assert.equal(s.arrived, s.cleared + s.nsQueue + s.ewQueue + s.dropped);
  assert.ok(s.dropped > 0, "this load should overflow the queue so the test exercises dropping");
  assert.equal(s.nsWait.length, s.nsQueue);
  assert.equal(s.ewWait.length, s.ewQueue);
});

test("a switch request is ignored until minGreen seconds have passed", () => {
  const cfg = { ...DEFAULT_CFG, minGreen: 5, lostTime: 0 };
  const s = createState();
  const lights = [];
  for (let t = 0; t < 8; t++) {
    step(s, 1, quiet, cfg); // ask to switch every second
    lights.push(s.light);
  }
  assert.deepEqual(lights.slice(0, 5), [0, 0, 0, 0, 0]);
  assert.equal(lights[5], 1, "first allowed switch is at second 6");
});

test("lost time: nobody is served for lostTime seconds after a switch", () => {
  const cfg = { ...DEFAULT_CFG, minGreen: 0, lostTime: 3 };
  const s = withQueue(0, 8); // cars waiting on the EW approach, NS currently green
  const served = [];
  step(s, 1, quiet, cfg); served.push(s.cleared); // switch to EW
  step(s, 0, quiet, cfg); served.push(s.cleared);
  step(s, 0, quiet, cfg); served.push(s.cleared);
  step(s, 0, quiet, cfg); served.push(s.cleared);
  assert.deepEqual(served.slice(0, 3), [0, 0, 0], "no service during the 3 lost seconds");
  assert.ok(served[3] > 0, "service resumes after the lost time");
});

test("lost time 0 serves immediately after a switch", () => {
  const cfg = { ...DEFAULT_CFG, minGreen: 0, lostTime: 0 };
  const s = withQueue(0, 8);
  step(s, 1, quiet, cfg);
  assert.ok(s.cleared > 0);
});

test("only the green approach is served, at most ceil(lanes/2) per second", () => {
  const cfg = { ...DEFAULT_CFG, lanes: 4, lostTime: 0 };
  const s = withQueue(10, 10); // NS is green
  step(s, 0, quiet, cfg);
  assert.equal(s.nsQueue, 8);
  assert.equal(s.ewQueue, 10);
});

test("single-road mode ignores east-west arrivals", () => {
  const cfg = { ...DEFAULT_CFG, simMode: "single" };
  const s = createState();
  step(s, 0, { ns: 1, ew: 3 }, cfg);
  assert.equal(s.ewQueue, 0);
  assert.equal(s.arrived, 1);
});

test("fixedTimePolicy switches once per cycle", () => {
  const cfg = { ...DEFAULT_CFG, minGreen: 5, lostTime: 0 };
  const s = createState();
  const policy = fixedTimePolicy(10);
  let switches = 0;
  for (let t = 0; t < 100; t++) if (step(s, policy(s), quiet, cfg).switched) switches++;
  assert.equal(switches, 9); // at seconds 11, 21, ... 91
});

test("longestQueuePolicy switches only when the red side is clearly longer", () => {
  const p = longestQueuePolicy(2);
  assert.equal(p(withQueue(5, 6)), 0);
  assert.equal(p(withQueue(2, 9)), 1);
  const ewGreen = withQueue(9, 2); ewGreen.light = 1;
  assert.equal(p(ewGreen), 1);
});

test("qTablePolicy reads the table, clips big queues and defaults to keep", () => {
  // q[ns][ew][light] = [keep, switch]
  const q = Array.from({ length: 3 }, () => Array.from({ length: 3 }, () => [[0, 0], [0, 0]]));
  q[1][2][0] = [0, 1];
  q[2][2][0] = [1, 0];
  const p = qTablePolicy(q);
  assert.equal(p(withQueue(1, 2)), 1);
  assert.equal(p(withQueue(50, 50)), 0, "clipped to the last row/column (2,2) which says keep");
  assert.equal(p(withQueue(0, 0)), 0, "untrained state -> keep");
});

test("summarize counts vehicles still waiting, so leaving cars unserved cannot look good", () => {
  const s = createState();
  s.cleared = 1; s.delaySum = 4;          // one served car that waited 4 s
  s.nsQueue = 1; s.nsWait = [6];          // one car still waiting after 6 s
  s.steps = 10; s.queueSum = 10;
  const r = summarize(s);
  assert.equal(r.avgDelay, 5);            // (4 + 6) / 2
  assert.equal(r.avgQueue, 1);
});