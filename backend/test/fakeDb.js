// Tiny in-memory stand-in for the Mongoose models, so the API can be tested without a MongoDB server.
// It supports only what the routes use. It does NOT test real MongoDB behaviour (indexes, validation).
const mongoose = require('mongoose');

const clone = (d) => JSON.parse(JSON.stringify(d));
function matches(doc, f) {
  return Object.entries(f).every(([k, v]) => {
    const x = doc[k];
    if (v && typeof v === 'object' && !(v instanceof mongoose.Types.ObjectId)) {
      if ('$gte' in v && !(x >= v.$gte)) return false;
      if ('$lte' in v && !(x <= v.$lte)) return false;
      return true;
    }
    return String(x) === String(v);
  });
}
function model(name) {
  const rows = [];
  const cursor = (list, one) => {
    let l = list, lim = Infinity;
    const c = {
      sort(spec) { const keys = Object.entries(spec); l = l.slice().sort((a, b) => { for (const [k, d] of keys) { if (a[k] < b[k]) return -d; if (a[k] > b[k]) return d; } return 0; }); return c; },
      limit(n) { lim = n; return c; },
      select() { return c; },
      lean: async () => { const out = l.slice(0, lim).map(clone); return one ? out[0] || null : out; },
    };
    return c;
  };
  const apply = (d, u) => { Object.assign(d, u.$set || {}); for (const [k, v] of Object.entries(u.$inc || {})) d[k] = (d[k] || 0) + v; };
  return {
    name, rows,
    create: async (d) => { const doc = { _id: new mongoose.Types.ObjectId(), createdAt: new Date(), startedAt: new Date(), progressSec: 0, ...d }; rows.push(doc); return doc; },
    insertMany: async (list) => { list.forEach((d) => rows.push({ _id: new mongoose.Types.ObjectId(), ...d })); },
    find: (f = {}) => cursor(rows.filter((r) => matches(r, f)), false),
    findOne: (f) => cursor(rows.filter((r) => matches(r, f)).slice(-1), true),
    findById: (id) => cursor(rows.filter((r) => String(r._id) === String(id)), true),
    updateOne: async (f, u) => { const d = rows.find((r) => matches(r, f)); if (d) apply(d, u); },
    updateMany: async (f, u) => rows.filter((r) => matches(r, f)).forEach((d) => apply(d, u)),
    deleteOne: async (f) => { const i = rows.findIndex((r) => matches(r, f)); if (i >= 0) rows.splice(i, 1); },
    deleteMany: async (f) => { for (let i = rows.length - 1; i >= 0; i--) if (matches(rows[i], f)) rows.splice(i, 1); },
  };
}
module.exports = function install() {
  const dbs = {};
  for (const n of ['Experiment', 'TrafficSample', 'SignalTiming', 'User']) {
    dbs[n] = model(n);
    require.cache[require.resolve('../models/' + n)] = { id: n, filename: n, loaded: true, exports: dbs[n] };
  }
  return dbs;
};
