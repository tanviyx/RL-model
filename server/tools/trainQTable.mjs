// Train a tabular Q-learning policy on recorded demand (or on the old synthetic
// arrivals) using the exact same dynamics as the live simulation.
//
//   node tools/trainQTable.mjs                     # train on the training days of config/demand.json
//   node tools/trainQTable.mjs --synthetic         # train on the old 40%-per-second arrivals
//   options: --episodes 600 --window 1800 --cap 20 --scale 1 --test-days 2 --seed 1 --out <file>
//            --scale-range 1,6   train on a random load level in this range (log-uniform) each episode
//            --lost-time 3       seconds nobody is served after a switch (default from simCore.js)
//
// The shipped config/q_table.json is never overwritten; copy the result over it yourself
// once tools/evaluate.mjs shows it is better.
import fs from "fs";
import path from "path";
import { DEFAULT_CFG, MAX_QUEUE, createState, step } from "../services/simCore.js";
import { loadDemand, makeRateFn, splitDays, validWindows } from "../services/demand.js";
import { parseArgs, configDir, genArrivals, mulberry32 } from "./common.mjs";

const args = parseArgs(process.argv.slice(2));
const synthetic = !!args.synthetic;
const episodes = Number(args.episodes ?? 600);
const window = Number(args.window ?? 1800);
const cap = Number(args.cap ?? 20);
const scale = Number(args.scale ?? 1);
const scaleRange = args["scale-range"] ? String(args["scale-range"]).split(",").map(Number) : null;
if (scaleRange && (scaleRange.length !== 2 || !(scaleRange[0] > 0) || !(scaleRange[1] >= scaleRange[0]))) {
  console.error("--scale-range needs two numbers, e.g. --scale-range 1,6");
  process.exit(1);
}
const testDays = Number(args["test-days"] ?? 2);
const seed = Number(args.seed ?? 1);
const out = args.out ?? path.join(configDir, synthetic ? "q_table.synthetic.json" : "q_table.trained.json");

const cfg = {
  ...DEFAULT_CFG,
  maxQueue: synthetic ? MAX_QUEUE.synthetic : MAX_QUEUE.real,
  lostTime: Number(args["lost-time"] ?? DEFAULT_CFG.lostTime),
};
const rng = mulberry32(seed);

// ---- training pool ----
let pool = [];
let split = null;
let demand = null;
if (!synthetic) {
  demand = loadDemand(path.join(configDir, "demand.json"));
  if (!demand) {
    console.error("config/demand.json not found. Run tools/prepare_pune_demand.py first, or use --synthetic.");
    process.exit(1);
  }
  split = splitDays(demand, testDays, window);
  for (const day of split.train) {
    for (const start of validWindows(demand, day, window, 0.8, 300)) pool.push({ day, start });
  }
  if (!pool.length) {
    console.error("No fully-recorded training windows found. Try a smaller --window.");
    process.exit(1);
  }
  console.log(`Training days: ${split.train.join(", ")}  (held out for testing: ${split.test.join(", ")})`);
  console.log(`${pool.length} training windows of ${window}s`);
} else {
  console.log("Training on synthetic arrivals (40% per second per axis)");
}

// ---- Q-learning ----
const q = Array.from({ length: cap + 1 }, () =>
  Array.from({ length: cap + 1 }, () => [[0, 0], [0, 0]])
);
const alpha = 0.1;
const gamma = 0.95;
const cell = (s) => q[Math.min(s.nsQueue, cap)][Math.min(s.ewQueue, cap)][s.light];

let recent = [];
for (let ep = 0; ep < episodes; ep++) {
  const eps = Math.max(0.05, 1 - ep / (episodes * 0.7));
  let rateFn = null;
  let startSec = 0;
  if (!synthetic) {
    const pick = pool[Math.floor(rng() * pool.length)];
    const epScale = scaleRange
      ? Math.exp(Math.log(scaleRange[0]) + rng() * (Math.log(scaleRange[1]) - Math.log(scaleRange[0])))
      : scale;
    rateFn = makeRateFn(demand, `day:${pick.day}`, epScale);
    startSec = pick.start; // windows come from a 5-minute grid inside the recorded hours
  }
  const arr = genArrivals({ rateFn, startSec, steps: window, rng });

  const state = createState();
  let total = 0;
  for (let t = 0; t < window; t++) {
    const row = cell(state);
    const a = rng() < eps ? (rng() < 0.5 ? 1 : 0) : row[1] > row[0] ? 1 : 0;
    step(state, a, { ns: arr.ns[t], ew: arr.ew[t] }, cfg);
    const next = cell(state);
    const best = Math.max(next[0], next[1]);
    row[a] += alpha * (state.reward + gamma * best - row[a]);
    total += state.reward;
  }
  recent.push(total / window);
  if ((ep + 1) % Math.max(1, Math.floor(episodes / 10)) === 0) {
    const avg = recent.reduce((x, y) => x + y, 0) / recent.length;
    console.log(`episode ${ep + 1}/${episodes}  eps=${eps.toFixed(2)}  mean reward/step=${avg.toFixed(2)}`);
    recent = [];
  }
}

fs.writeFileSync(out, JSON.stringify(q));
fs.writeFileSync(
  out.replace(/\.json$/, ".meta.json"),
  JSON.stringify({ synthetic, episodes, window, cap, scale, scaleRange, seed, trainDays: split?.train ?? null, testDays: split?.test ?? null, cfg }, null, 2)
);
console.log(`Saved ${out}`);