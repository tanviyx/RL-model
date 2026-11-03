'use strict';
(async () => {
  const $ = (id) => document.getElementById(id);
  const COL = { fixed: '#d9822b', dqn: '#1f9d5c' };
  const pct = (x) => (x === null || x === undefined ? '–' : (x > 0 ? '+' : '') + x + '%');
  const cls = (x) => (x > 0 ? 'pos' : x < 0 ? 'neg' : '');
  async function api(u) { const r = await fetch(u); if (r.status === 401) location.href = '/login'; if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message || r.status); return r.json(); }
  function stat(el, label, value, c) { const d = document.createElement('div'); d.className = 'stat'; const b = document.createElement('b'); b.textContent = value; if (c) b.className = c; const s = document.createElement('span'); s.textContent = label; d.append(b, s); el.append(d); }
  function rows(tb, list) { tb.innerHTML = ''; for (const r of list) { const tr = document.createElement('tr'); [r.label, r.runs, pct(r.avgWaitImprovementPct), pct(r.avgQueueImprovementPct)].forEach((t, i) => { const td = document.createElement('td'); td.textContent = t; if (i > 1) td.className = cls(t === '–' ? 0 : parseFloat(t)); tr.append(td); }); tb.append(tr); } }

  function setup(cv) { const dpr = window.devicePixelRatio || 1, w = cv.clientWidth, h = cv.clientHeight; cv.width = w * dpr; cv.height = h * dpr; const c = cv.getContext('2d'); c.scale(dpr, dpr); c.clearRect(0, 0, w, h); c.font = '11px system-ui'; return { c, w, h }; }
  function axes(c, w, h, max, L, T, B, R, unit) {
    const ph = h - T - B; c.fillStyle = '#5d666c'; c.strokeStyle = '#e3e0d6'; c.textAlign = 'right';
    for (let i = 0; i <= 4; i++) { const y = T + ph - (ph * i) / 4; c.beginPath(); c.moveTo(L, y); c.lineTo(w - R, y); c.stroke(); c.fillText(Math.round((max * i) / 4) + (unit || ''), L - 6, y + 4); }
  }
  function drawTrend(trend) {
    const { c, w, h } = setup($('cTrend')), L = 44, R = 10, T = 10, B = 28, pw = w - L - R, ph = h - T - B;
    const max = Math.max(1, ...trend.flatMap((t) => [t.fixedWait, t.dqnWait])) * 1.15;
    axes(c, w, h, max, L, T, B, R, ' s');
    const gw = pw / trend.length, bw = Math.min(22, gw * 0.35);
    trend.forEach((t, i) => {
      const x = L + gw * i + gw / 2;
      [[t.fixedWait, COL.fixed, -bw], [t.dqnWait, COL.dqn, 0]].forEach(([v, col, off]) => { c.fillStyle = col; const bh = (v / max) * ph; c.fillRect(x + off, T + ph - bh, bw, bh); });
      if (trend.length <= 12 || i % 2 === 0) { c.fillStyle = '#5d666c'; c.textAlign = 'center'; c.fillText(t.durationSec / 60 + 'm', x, h - 10); }
    });
  }
  function drawGreen(timings, duration) {
    const { c, w, h } = setup($('cGreen')), L = 44, R = 10, T = 10, B = 24, pw = w - L - R, ph = h - T - B, max = 45;
    axes(c, w, h, max, L, T, B, R, ' s'); c.textAlign = 'center'; c.fillStyle = '#5d666c';
    for (let i = 0; i <= 4; i++) c.fillText(Math.round((duration * i) / 4 / 60) + ' min', L + (pw * i) / 4, h - 6);
    for (const k of ['fixed', 'dqn']) {
      const r = timings.filter((x) => x.controller === k); if (!r.length) continue;
      c.strokeStyle = COL[k]; c.lineWidth = 2; c.beginPath();
      r.forEach((x, i) => { const px = L + (x.t / duration) * pw, py = T + ph - (x.green / max) * ph; i ? c.lineTo(px, py) : c.moveTo(px, py); });
      c.stroke();
    }
  }

  try {
    const o = await api('/api/history/overview');
    $('hello').textContent = 'Welcome, ' + o.user.name;
    const who = $('who'); who.textContent = '';
    if (o.user.avatar) { const i = document.createElement('img'); i.src = o.user.avatar; i.alt = ''; who.appendChild(i); }
    who.appendChild(document.createTextNode(o.user.email));
    $('visit').textContent = 'Member since ' + new Date(o.user.memberSince).toLocaleDateString() + ' · ' + o.user.loginCount + ' login(s)' + (o.user.lastLoginAt ? ' · last login ' + new Date(o.user.lastLoginAt).toLocaleString() : '');
    const t = $('totals'); stat(t, 'Runs stored', o.totals.runs); stat(t, 'Finished runs', o.totals.completed); stat(t, 'Simulated minutes', o.totals.simulatedMinutes); stat(t, 'Vehicles per signal', o.totals.vehiclesPerSignal.toLocaleString());
    if (!o.totals.completed) { $('empty').hidden = false; return; }
    $('hist').hidden = false;
    const a = o.averageImprovementPct, im = $('improve');
    stat(im, 'Average wait', pct(a.avgWait), cls(a.avgWait)); stat(im, '95th percentile wait', pct(a.p95Wait), cls(a.p95Wait)); stat(im, 'Average queue', pct(a.avgQueue), cls(a.avgQueue)); stat(im, 'Throughput', pct(a.throughputPerHour), cls(a.throughputPerHour));
    rows($('tDur'), o.byDuration); rows($('tTraffic'), o.byTraffic);
    const draw = () => drawTrend(o.trend); draw(); window.addEventListener('resize', draw);

    const g = await api('/api/history/timings');
    $('timingNote').textContent = 'Latest finished run: ' + g.durationSec / 60 + ' min at ' + g.demand + ' vehicles/hour. Each point is one green period (how long the signal stayed green for that direction).';
    const dg = () => drawGreen(g.timings, g.durationSec); dg(); window.addEventListener('resize', dg);
    const tb = $('tTiming'); tb.innerHTML = '';
    for (const k of ['fixed', 'dqn']) { const s = g.stats[k]; if (!s) continue; const tr = document.createElement('tr');
      [k === 'fixed' ? 'Fixed time' : 'AI', s.greens, s.avgGreen + ' s', Math.round(s.northSouthShare * 100) + '%', Object.entries(s.greenHistogram).map(([sec, n]) => sec + ' s × ' + n).join(', ')].forEach((x) => { const td = document.createElement('td'); td.textContent = x; tr.append(td); }); tb.append(tr); }
  } catch (e) { $('visit').textContent = 'Could not load history: ' + e.message; }
})();
document.getElementById('logout').onclick = async () => { const r = await fetch('/api/auth/logout', { method: 'POST' }); location.href = (await r.json()).redirect; };
