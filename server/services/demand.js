// Real-world demand (vehicle arrivals) for the simulation.
// Reads config/demand.json produced by tools/prepare_pune_demand.py.
import fs from "fs";

// ---------------- randomness ----------------
/** Small seeded RNG so evaluations are reproducible. */
export const mulberry32 = (seed) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/** Poisson sample (Knuth). Fine for the small per-second rates used here. */
export const poisson = (lambda, rng = Math.random) => {
  if (!(lambda > 0)) return 0;
  if (lambda > 30) return Math.max(0, Math.round(lambda + Math.sqrt(lambda) * gaussian(rng)));
  const L = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= rng();
  } while (p > L);
  return k - 1;
};

const gaussian = (rng) => {
  const u = 1 - rng();
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
};

// ---------------- loading ----------------
export const loadDemand = (file) => {
  try {
    const demand = JSON.parse(fs.readFileSync(file, "utf-8"));
    const nBins = Math.round(86400 / demand.meta.binSeconds);
    for (const axis of ["NS", "EW"]) {
      if (!Array.isArray(demand.profile?.[axis]) || demand.profile[axis].length !== nBins) {
        throw new Error(`profile.${axis} must have ${nBins} bins`);
      }
    }
    return demand;
  } catch (e) {
    if (e.code !== "ENOENT") console.error("demand: could not read", file, "-", e.message);
    return null;
  }
};

export const listSources = (demand) =>
  demand ? ["profile", ...Object.keys(demand.days).sort().map((d) => `day:${d}`)] : [];

/**
 * Returns rate(secondsOfDay) -> { ns, ew } in vehicles per second.
 * source: "profile" (average day) or "day:YYYY-MM-DD" (replay one recorded day;
 * bins with no recording fall back to the average day).
 */
export const makeRateFn = (demand, source = "profile", scale = 1) => {
  const bin = demand.meta.binSeconds;
  const nBins = Math.round(86400 / bin);
  const day = source.startsWith("day:") ? demand.days[source.slice(4)] : null;
  if (source.startsWith("day:") && !day) throw new Error(`Unknown demand day: ${source}`);

  return (sec) => {
    const b = Math.floor((((sec % 86400) + 86400) % 86400) / bin) % nBins;
    const pick = (axis) => (day?.[axis]?.[b] ?? demand.profile[axis][b] ?? 0);
    return { ns: (pick("NS") / bin) * scale, ew: (pick("EW") / bin) * scale };
  };
};

// ---------------- train / test split and windows ----------------
const coverage = (demand, day, startSec, lenSec) => {
  const bin = demand.meta.binSeconds;
  const d = demand.days[day];
  const first = Math.floor(startSec / bin);
  const n = Math.max(1, Math.round(lenSec / bin));
  let ok = 0;
  for (let i = 0; i < n; i++) {
    const b = (first + i) % Math.round(86400 / bin);
    if (d.NS[b] != null && d.EW[b] != null) ok++;
  }
  return ok / n;
};

/** First and last recorded time of day (seconds). The live sim clock stays inside this range. */
export const recordedRange = (demand) => {
  const r = demand.meta?.recordedRange;
  if (r) return { start: r.startSec, end: r.endSec };
  const bin = demand.meta.binSeconds;
  const known = demand.profile.NS.map((v, i) => (v != null ? i : -1)).filter((i) => i >= 0);
  return known.length ? { start: known[0] * bin, end: (known.at(-1) + 1) * bin } : { start: 0, end: 86400 };
};

/** Windows (start seconds-of-day) where >= minCoverage of the bins were really recorded. */
export const validWindows = (demand, day, lenSec, minCoverage = 0.9, stride = Math.min(lenSec, 3600)) => {
  const out = [];
  for (let start = 0; start + lenSec <= 86400; start += stride) {
    if (coverage(demand, day, start, lenSec) >= minCoverage) out.push(start);
  }
  return out;
};

/** Chronological split: the last `testCount` usable days are held out for testing. */
export const splitDays = (demand, testCount = 2, lenSec = 1800) => {
  const usable = Object.keys(demand.days)
    .sort()
    .filter((d) => validWindows(demand, d, lenSec, 0.8).length > 0);
  if (usable.length < 2) {
    throw new Error(`Need at least 2 usable days in demand.json to split train/test (found ${usable.length})`);
  }
  const t = Math.min(testCount, usable.length - 1);
  return { train: usable.slice(0, usable.length - t), test: usable.slice(usable.length - t) };
};

export const formatClock = (sec) => {
  const s = ((Math.floor(sec) % 86400) + 86400) % 86400;
  const h = String(Math.floor(s / 3600)).padStart(2, "0");
  const m = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  return `${h}:${m}`;
};