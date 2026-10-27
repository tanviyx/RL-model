import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  mulberry32, poisson, loadDemand, listSources, makeRateFn,
  validWindows, splitDays, recordedRange, formatClock,
} from "../services/demand.js";

const BIN = 300;
const N = 288;
const slots = (fn) => Array.from({ length: N }, (_, i) => fn(i));
const recorded = (from, to, value) => slots((i) => (i >= from && i < to ? value : null)); // 108..144 = 09:00-12:00
const day = (from = 108, to = 144, ns = 30, ew = 60) => ({ NS: recorded(from, to, ns), EW: recorded(from, to, ew) });
const demand = () => ({
  meta: { binSeconds: BIN, recordedRange: { startSec: 108 * BIN, endSec: 144 * BIN } },
  days: {
    "2023-01-11": day(),
    "2023-01-12": day(),
    "2023-01-13": day(120, 122),               // only 10 minutes recorded
    "2023-01-14": day(),
    "2023-01-15": { NS: slots(() => null), EW: slots(() => null) }, // nothing recorded
  },
  profile: { NS: recorded(108, 144, 30), EW: recorded(108, 144, 60) },
});

test("seeded RNG is reproducible and stays in [0,1)", () => {
  const a = mulberry32(42), b = mulberry32(42);
  for (let i = 0; i < 100; i++) {
    const x = a();
    assert.equal(x, b());
    assert.ok(x >= 0 && x < 1);
  }
});

test("poisson: mean is about lambda, zero for non-positive rates", () => {
  const rng = mulberry32(1);
  let sum = 0;
  const n = 40000;
  for (let i = 0; i < n; i++) sum += poisson(0.3, rng);
  assert.ok(Math.abs(sum / n - 0.3) < 0.02, `mean ${sum / n}`);
  assert.equal(poisson(0, rng), 0);
  assert.equal(poisson(-1, rng), 0);
});

test("makeRateFn: vehicles per bin become vehicles per second, scale applied, time wraps", () => {
  const d = demand();
  const r = makeRateFn(d, "profile", 2)(110 * BIN);
  assert.ok(Math.abs(r.ns - (30 / BIN) * 2) < 1e-12);
  assert.ok(Math.abs(r.ew - (60 / BIN) * 2) < 1e-12);
  const next = makeRateFn(d, "profile", 2)(110 * BIN + 86400);
  assert.deepEqual(next, r);
});

test("makeRateFn: a recorded day is used where it has data and falls back to the profile elsewhere", () => {
  const d = demand();
  d.days["2023-01-11"].NS[110] = 90;
  const rate = makeRateFn(d, "day:2023-01-11", 1);
  assert.ok(Math.abs(rate(110 * BIN).ns - 90 / BIN) < 1e-12);
  assert.ok(Math.abs(rate(111 * BIN).ns - 30 / BIN) < 1e-12);
  assert.equal(rate(10 * BIN).ns, 0, "unrecorded hours give no traffic");
  assert.throws(() => makeRateFn(d, "day:1999-01-01"), /Unknown demand day/);
});

test("listSources lists the average day plus every recorded day", () => {
  assert.deepEqual(listSources(demand()).slice(0, 2), ["profile", "day:2023-01-11"]);
  assert.deepEqual(listSources(null), []);
});

test("validWindows only returns windows that were really recorded", () => {
  const d = demand();
  const wins = validWindows(d, "2023-01-11", 1800, 0.9);
  assert.deepEqual(wins, [32400, 34200, 36000, 37800, 39600, 41400]);
  assert.deepEqual(validWindows(d, "2023-01-13", 1800, 0.8), [], "10 recorded minutes cannot fill a 30 minute window");
  // boundary: 25 recorded minutes = 5 of 6 slots = 83% coverage
  d.days["2023-01-16"] = day(120, 125);
  assert.deepEqual(validWindows(d, "2023-01-16", 1800, 0.9), [], "83% is below a 90% requirement");
  assert.deepEqual(validWindows(d, "2023-01-16", 1800, 0.8), [36000], "83% passes an 80% requirement");
  assert.ok(validWindows(d, "2023-01-11", 1800, 0.9, 300).length > wins.length, "a finer stride gives more windows");
});

test("splitDays holds out the last days, ignores unusable days, and refuses a tiny dataset", () => {
  const d = demand();
  const s = splitDays(d, 2, 1800);
  assert.deepEqual(s.test, ["2023-01-12", "2023-01-14"]);
  assert.deepEqual(s.train, ["2023-01-11"]);
  assert.ok(![...s.train, ...s.test].includes("2023-01-13"));
  assert.ok(![...s.train, ...s.test].includes("2023-01-15"));
  const tiny = { ...d, days: { "2023-01-11": day() } };
  assert.throws(() => splitDays(tiny, 2, 1800), /at least 2 usable days/);
});

test("recordedRange uses the metadata, or derives it from the average day", () => {
  assert.deepEqual(recordedRange(demand()), { start: 32400, end: 43200 });
  const d = demand();
  delete d.meta.recordedRange;
  assert.deepEqual(recordedRange(d), { start: 32400, end: 43200 });
});

test("loadDemand: missing file -> null, malformed profile -> null, valid file -> data", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "demand-"));
  assert.equal(loadDemand(path.join(dir, "nope.json")), null);
  const bad = path.join(dir, "bad.json");
  fs.writeFileSync(bad, JSON.stringify({ meta: { binSeconds: BIN }, days: {}, profile: { NS: [1], EW: [1] } }));
  const origError = console.error;
  console.error = () => {};
  try { assert.equal(loadDemand(bad), null); } finally { console.error = origError; }
  const good = path.join(dir, "good.json");
  fs.writeFileSync(good, JSON.stringify(demand()));
  assert.equal(Object.keys(loadDemand(good).days).length, 5);
});

test("formatClock", () => {
  assert.equal(formatClock(32400), "09:00");
  assert.equal(formatClock(32400 + 5 * 60 + 59), "09:05");
  assert.equal(formatClock(86400 + 60), "00:01");
});