// Smoke test of the Step 6.6 and 6.7 APIs without MongoDB: the models are replaced by a tiny in-memory stand-in (test/fakeDb.js).
// Needs the model service running (cd model && python serve.py). Run:  node test/api.test.js
process.env.JWT_SECRET = 'test-secret';
const path = require('path');
const assert = require('assert');
const http = require('http');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

const db = require('./fakeDb')();

const express = require('express');
const cookieParser = require('cookie-parser');
const app = express();
app.use(express.json()); app.use(cookieParser());
app.use('/api/experiments', require('../routes/experiments'));
app.use('/api/traffic', require('../routes/traffic'));
app.use('/api/history', require('../routes/history'));

const userA = new mongoose.Types.ObjectId().toString(), userB = new mongoose.Types.ObjectId().toString();
db.User.rows.push({ _id: userA, name: 'Tanvi', email: 'a@test', createdAt: new Date(), loginCount: 2 });
const cookie = (u) => 'token=' + jwt.sign({ sub: u }, process.env.JWT_SECRET);

function call(port, method, url, body, user) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request({ port, method, path: url, headers: { 'Content-Type': 'application/json', ...(user ? { Cookie: cookie(user) } : {}) } }, (res) => {
      let t = ''; res.on('data', (c) => (t += c)); res.on('end', () => { let j; try { j = JSON.parse(t); } catch { j = t; } resolve({ status: res.statusCode, body: j }); });
    });
    req.on('error', reject); if (data) req.write(data); req.end();
  });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const srv = app.listen(0); const port = srv.address().port;
  const ok = (name) => console.log('ok  -', name);

  assert.strictEqual((await call(port, 'GET', '/api/experiments')).status, 401); ok('login required');
  assert.strictEqual((await call(port, 'POST', '/api/experiments', { minutes: 7 }, userA)).status, 400); ok('rejects minutes=7');
  assert.strictEqual((await call(port, 'POST', '/api/experiments', { minutes: 5, demand: 99999 }, userA)).status, 400); ok('rejects demand=99999');
  assert.strictEqual((await call(port, 'GET', '/api/experiments/not-an-id', null, userA)).status, 400); ok('rejects bad id');

  // slow run (speed 60) so we can look at it while it is running
  let r = await call(port, 'POST', '/api/experiments', { minutes: 5, demand: 1200, seed: 3, speed: 10 }, userA);
  assert.strictEqual(r.status, 202, JSON.stringify(r.body)); const id = r.body.id; ok('start 5-minute run');
  assert.strictEqual((await call(port, 'POST', '/api/experiments', { minutes: 5 }, userA)).status, 409); ok('second run while one is active -> 409');
  await sleep(1500);
  r = await call(port, 'GET', '/api/experiments/' + id, null, userA);
  assert.strictEqual(r.body.status, 'running'); assert(r.body.progressSec > 0 && r.body.progressSec < 300); ok('live progress: ' + Math.round(r.body.progressSec) + ' of 300 s');
  assert.strictEqual((await call(port, 'GET', '/api/experiments/' + id, null, userB)).status, 404); ok("other user can't see it");
  assert.strictEqual((await call(port, 'POST', `/api/experiments/${id}/cancel`, null, userA)).status, 200); ok('cancel');
  await sleep(500);
  r = await call(port, 'GET', '/api/experiments/' + id, null, userA); assert.strictEqual(r.body.status, 'cancelled'); ok('status cancelled');

  // fast runs of all three lengths
  for (const minutes of [5, 30, 60]) {
    r = await call(port, 'POST', '/api/experiments', { minutes, demand: 1500, seed: 7 }, userA); assert.strictEqual(r.status, 202);
    for (let i = 0; i < 100; i++) { await sleep(300); const g = await call(port, 'GET', '/api/experiments/' + r.body.id, null, userA); if (g.body.status !== 'running') { r.final = g.body; break; } }
    const e = r.final; assert.strictEqual(e.status, 'completed', JSON.stringify(e).slice(0, 300));
    assert.strictEqual(e.summary.fixed.spawned, e.summary.dqn.spawned, 'both signals got the same number of vehicles');
    assert(e.samples.fixed.length > 20 && e.samples.dqn.length > 20);
    ok(`${minutes}-minute run: ${e.samples.fixed.length} samples each, ${e.summary.fixed.spawned} vehicles both, avg wait ${e.summary.fixed.avgWait}s fixed vs ${e.summary.dqn.avgWait}s AI`);
    if (minutes === 60) r.last = r.body.id;
  }
  const list = await call(port, 'GET', '/api/experiments', null, userA); assert.strictEqual(list.body.length, 4); assert(!list.body[0].samples); ok('list has 4 runs, no samples');
  const live = await call(port, 'GET', '/api/traffic/live', null, userA); assert(live.body.fixed && live.body.dqn); ok('traffic/live');
  const hist = await call(port, 'GET', `/api/traffic/history?controller=dqn&from=600&to=1200`, null, userA); assert(hist.body.dqn.every((s) => s.t >= 600 && s.t <= 1200) && !hist.body.fixed); ok('traffic/history filter, ' + hist.body.dqn.length + ' points');
  const sum = await call(port, 'GET', '/api/traffic/summary', null, userA); assert.strictEqual(sum.body.runs, 3); ok('traffic/summary over 3 finished runs');
  const base = await call(port, 'GET', '/api/traffic/baseline', null, userA); assert.strictEqual(base.body.hours, 48); ok('traffic/baseline: 48 SUMO hours, avg wait ' + base.body.avgWaitSec + ' s');
  // ---- Step 6.7: data is stored in separate collections and read back for the dashboard ----
  const done = db.Experiment.rows.filter((d) => d.status === 'completed');
  assert.strictEqual(done.length, 3); assert(done.every((d) => !d.arms.fixed.samples), 'samples are not embedded in the experiment');
  assert.strictEqual(db.TrafficSample.rows.length, 2 * (61 + 121 + 121)); ok('trafficsamples collection: ' + db.TrafficSample.rows.length + ' rows');
  const tFixed = db.SignalTiming.rows.filter((x) => x.experiment.toString() === String(done[2]._id) && x.controller === 'fixed');
  const tDqn = db.SignalTiming.rows.filter((x) => x.experiment.toString() === String(done[2]._id) && x.controller === 'dqn');
  assert(tFixed.length > 50 && tDqn.length > 50 && tFixed.every((x) => x.green === 42) && tDqn.every((x) => [10, 20, 30, 40].includes(x.green)));
  ok('signaltimings collection: ' + tFixed.length + ' fixed greens (all 42 s), ' + tDqn.length + ' AI decisions (10-40 s)');
  const ov = await call(port, 'GET', '/api/history/overview', null, userA);
  assert.strictEqual(ov.body.totals.completed, 3); assert.strictEqual(ov.body.trend.length, 3); assert.strictEqual(ov.body.byDuration.length, 3);
  assert(typeof ov.body.averageImprovementPct.avgWait === 'number'); ok('history/overview: avg wait change ' + ov.body.averageImprovementPct.avgWait + '%, ' + ov.body.byTraffic.map((g) => g.runs).join('/') + ' runs by traffic level');
  const tm = await call(port, 'GET', '/api/history/timings', null, userA);
  assert(tm.body.stats.fixed && tm.body.stats.dqn && tm.body.timings.length === tFixed.length + tDqn.length); ok('history/timings: avg green fixed ' + tm.body.stats.fixed.avgGreen + ' s, AI ' + tm.body.stats.dqn.avgGreen + ' s');
  assert.strictEqual((await call(port, 'GET', '/api/history/overview', null, userB)).status, 401); ok('history needs a known user');
  const csv = await call(port, 'GET', `/api/experiments/${r.last}/export.csv`, null, userA); assert(String(csv.body).startsWith('controller,t,queue')); ok('CSV export');
  assert.strictEqual((await call(port, 'DELETE', `/api/experiments/${r.last}`, null, userA)).status, 200);
  assert(!db.TrafficSample.rows.some((x) => x.experiment.toString() === r.last) && !db.SignalTiming.rows.some((x) => x.experiment.toString() === r.last)); ok('delete removes the run and its samples and timings');
  srv.close(); process.exit(0);
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
