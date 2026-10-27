// Fair policy comparison. Every policy sees exactly the same arrivals, on days
// the Q-table was NOT trained on.
//
//   node tools/evaluate.mjs                 # held-out days of config/demand.json
//   node tools/evaluate.mjs --synthetic     # old 40%-per-second arrivals (works without any dataset)
//   options: --window 1800 --seeds 5 --test-days 2 --scale 1 --fixed 10,20,30,60 --max-windows 6 --lost-time 3
//            --qtable name=path (repeatable; default = every config/q_table*.json)
//            --gate [--gate-margin 0]  CI check: exit 1 if the installed config/q_table.json has a higher
//                      average delay than the best fixed timer (times 1+margin) on the held-out days
import fs from "fs";
import path from "path";
import { DEFAULT_CFG, MAX_QUEUE, createState, step, summarize, fixedTimePolicy, longestQueuePolicy, qTablePolicy } from "../services/simCore.js";
import { loadDemand, makeRateFn, splitDays, validWindows } from "../services/demand.js";
import { parseArgs, configDir, toolsDir, genArrivals, hashSeed, mulberry32 } from "./common.mjs";

const args = parseArgs(process.argv.slice(2));
const synthetic = !!args.synthetic;
const window = Number(args.window ?? 1800);
const seeds = Number(args.seeds ?? 5);
const testDays = Number(args["test-days"] ?? 2);
const scale = Number(args.scale ?? 1);
const maxWindows = Number(args["max-windows"] ?? 6);
const fixedCycles = String(args.fixed ?? "10,20,30,60").split(",").map(Number);
const cfg = {
  ...DEFAULT_CFG,
  maxQueue: synthetic ? MAX_QUEUE.synthetic : MAX_QUEUE.real,
  lostTime: Number(args["lost-time"] ?? DEFAULT_CFG.lostTime),
};

// ---- policies ----
const policies = fixedCycles.map((c) => ({ name: `fixed-${c}s`, fn: fixedTimePolicy(c) }));
policies.push({ name: "longest-queue", fn: longestQueuePolicy(2) });

const tableSpecs = [].concat(args.qtable ?? []);
if (!tableSpecs.length) {
  for (const f of fs.readdirSync(configDir)) {
    if (/^q_table.*\.json$/.test(f) && !f.endsWith(".meta.json")) {
      const name = f.replace(/\.json$/, "").replace(/^q_table\.?/, "") || "shipped";
      tableSpecs.push(`${name}=${path.join(configDir, f)}`);
    }
  }
}
for (const spec of tableSpecs) {
  const [name, file] = spec.split("=");
  policies.push({ name: `qtable:${name}`, fn: qTablePolicy(JSON.parse(fs.readFileSync(file, "utf-8"))) });
}

// ---- scenarios ----
const scenarios = []; // { label, rateFn, startSec }
if (synthetic) {
  for (let i = 0; i < maxWindows; i++) scenarios.push({ label: `synthetic#${i}`, rateFn: null, startSec: 0 });
} else {
  const demand = loadDemand(path.join(configDir, "demand.json"));
  if (!demand) {
    console.error("config/demand.json not found. Run tools/prepare_pune_demand.py first, or use --synthetic.");
    process.exit(1);
  }
  const split = splitDays(demand, testDays, window);
  console.log(`Held-out test days: ${split.test.join(", ")}`);
  for (const day of split.test) {
    let wins = validWindows(demand, day, window, 0.9);
    if (!wins.length) {
      wins = validWindows(demand, day, window, 0.7);
      if (wins.length) console.warn(`  ${day}: no window is >=90% recorded; using windows >=70% recorded`);
    }
    wins = wins.slice(0, maxWindows);
    for (const start of wins) {
      scenarios.push({ label: `${day}@${String(start / 3600).padStart(2, "0")}h`, rateFn: makeRateFn(demand, `day:${day}`, scale), startSec: start });
    }
  }
  if (!scenarios.length) {
    console.error(`No test windows of ${window}s with enough recorded data. Try a smaller --window.`);
    process.exit(1);
  }
}

// ---- run ----
const results = Object.fromEntries(policies.map((p) => [p.name, []])); // per scenario: array over seeds of summaries
let rateNS = 0, rateEW = 0, rateN = 0;
for (const sc of scenarios) {
  const perSeed = Object.fromEntries(policies.map((p) => [p.name, []]));
  for (let sd = 0; sd < seeds; sd++) {
    const rng = mulberry32(hashSeed(sc.label, sd));
    const arr = genArrivals({ rateFn: sc.rateFn, startSec: sc.startSec, steps: window, rng });
    rateNS += arr.ns.reduce((a, b) => a + b, 0) / window;
    rateEW += arr.ew.reduce((a, b) => a + b, 0) / window;
    rateN++;
    for (const p of policies) {
      const state = createState();
      for (let t = 0; t < window; t++) {
        step(state, p.fn(state), { ns: arr.ns[t], ew: arr.ew[t] }, cfg);
      }
      perSeed[p.name].push(summarize(state));
    }
  }
  for (const p of policies) results[p.name].push(perSeed[p.name]);
}

// ---- report ----
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const sd = (a) => (a.length < 2 ? 0 : Math.sqrt(mean(a.map((x) => (x - mean(a)) ** 2)) * a.length / (a.length - 1)));
const T95 = [0, 12.71, 4.3, 3.18, 2.78, 2.57, 2.45, 2.36, 2.31, 2.26, 2.23, 2.2, 2.18, 2.16, 2.14, 2.13, 2.12, 2.11, 2.1, 2.09, 2.09, 2.08, 2.07, 2.07, 2.06, 2.06, 2.06, 2.05, 2.05, 2.04];
const tcrit = (df) => (df <= 0 ? NaN : df <= 30 ? T95[df] : 1.96);

// window-level mean of a metric (averaging over seeds), so n = number of windows
const perWindow = (name, key) => results[name].map((seedsArr) => mean(seedsArr.map((r) => r[key])));
// reference = the fixed timer with the lowest average delay in this run (the honest baseline)
const fixedNames = policies.filter((p) => p.name.startsWith("fixed-")).map((p) => p.name);
const ref = fixedNames.reduce((best, n) => (mean(perWindow(n, "avgDelay")) < mean(perWindow(best, "avgDelay")) ? n : best));

console.log(`\nWindows: ${scenarios.length} x ${seeds} seeds, ${window}s each. Mean demand: NS ${(rateNS / rateN).toFixed(2)} veh/s, EW ${(rateEW / rateN).toFixed(2)} veh/s (sim serves up to ${Math.ceil(cfg.lanes / 2)} veh/s per axis while green)`);
console.log(`Delay includes vehicles still queued at the end. Lower is better. CI = 95% over windows (indicative; few windows).\n`);
console.log("| policy | avg delay (s) | avg queue | served | dropped | delay vs " + ref + " (95% CI) |");
console.log("|---|---|---|---|---|---|");

const summary = {};
for (const p of policies) {
  const delay = perWindow(p.name, "avgDelay");
  const ref_ = perWindow(ref, "avgDelay");
  const diffs = delay.map((d, i) => d - ref_[i]);
  const half = diffs.length > 1 ? tcrit(diffs.length - 1) * sd(diffs) / Math.sqrt(diffs.length) : NaN;
  const row = {
    avgDelay: mean(delay),
    avgQueue: mean(perWindow(p.name, "avgQueue")),
    served: mean(perWindow(p.name, "throughput")),
    dropped: mean(perWindow(p.name, "dropped")),
    deltaVsRef: mean(diffs),
    deltaCI95: half,
  };
  summary[p.name] = row;
  const d = p.name === ref ? "-" : `${row.deltaVsRef >= 0 ? "+" : ""}${row.deltaVsRef.toFixed(1)} ± ${Number.isNaN(half) ? "n/a" : half.toFixed(1)}`;
  console.log(`| ${p.name} | ${row.avgDelay.toFixed(1)} | ${row.avgQueue.toFixed(1)} | ${row.served.toFixed(0)} | ${row.dropped.toFixed(0)} | ${d} |`);
}

const outDir = path.join(toolsDir, "results");
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, `eval-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
fs.writeFileSync(outFile, JSON.stringify({ synthetic, window, seeds, scale, scenarios: scenarios.map((s) => s.label), summary }, null, 2));
console.log(`\nSaved ${outFile}`);

// ---- CI gate: the installed table must be at least as good as the best fixed timer ----
if (args.gate) {
  const installed = summary["qtable:shipped"];
  if (!installed) {
    console.error("\nGATE FAIL: config/q_table.json not found, nothing to check.");
    process.exit(1);
  }
  const margin = Number(args["gate-margin"] ?? 0);
  const limit = summary[ref].avgDelay * (1 + margin);
  const ok = installed.avgDelay <= limit;
  console.log(
    `\nGATE ${ok ? "PASS" : "FAIL"} (scale ${scale}): installed Q-table ${installed.avgDelay.toFixed(1)} s vs best fixed timer ${ref} ` +
    `${summary[ref].avgDelay.toFixed(1)} s (limit ${limit.toFixed(1)} s)`
  );
  if (!ok) process.exit(1);
}