'use strict';
(() => {
  const $ = (id) => document.getElementById(id);
  const COL = { fixed: '#d9822b', dqn: '#1f9d5c' };
  let currentId = null, timer = null, lastData = null;

  const fmtT = (s) => (s >= 3600 ? '1 hour' : Math.round(s / 60) + ' min');
  const clock = (s) => Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');
  const show = (m) => { $('msg').textContent = m || ''; };
  async function api(url, opts) {
    const r = await fetch(url, opts);
    const d = await r.json().catch(() => ({}));
    if (r.status === 401) location.href = '/login';
    if (!r.ok) throw new Error(d.message || 'Request failed (' + r.status + ')');
    return d;
  }

  // ---- charts (plain canvas, two lines) ----
  function chart(cv, fixed, dqn, key, durationSec) {
    const dpr = window.devicePixelRatio || 1, w = cv.clientWidth, h = cv.clientHeight;
    cv.width = w * dpr; cv.height = h * dpr;
    const c = cv.getContext('2d'); c.scale(dpr, dpr); c.clearRect(0, 0, w, h);
    const L = 44, R = 10, T = 10, B = 24, pw = w - L - R, ph = h - T - B;
    const all = [...fixed, ...dqn].map((s) => s[key]);
    const max = Math.max(1, ...all) * 1.1;
    c.font = '11px system-ui'; c.fillStyle = '#5d666c'; c.strokeStyle = '#e3e0d6'; c.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = T + ph - (ph * i) / 4;
      c.beginPath(); c.moveTo(L, y); c.lineTo(w - R, y); c.stroke();
      c.textAlign = 'right'; c.fillText(String(Math.round((max * i) / 4)), L - 6, y + 4);
    }
    c.textAlign = 'center';
    for (let i = 0; i <= 4; i++) c.fillText(Math.round((durationSec * i) / 4 / 60) + ' min', L + (pw * i) / 4, h - 6);
    for (const [arr, col] of [[fixed, COL.fixed], [dqn, COL.dqn]]) {
      if (!arr.length) continue;
      c.strokeStyle = col; c.lineWidth = 2; c.beginPath();
      arr.forEach((s, i) => { const x = L + (s.t / durationSec) * pw, y = T + ph - (s[key] / max) * ph; i ? c.lineTo(x, y) : c.moveTo(x, y); });
      c.stroke();
    }
  }

  function kv(el, live, sum) {
    const rows = sum
      ? [['Average wait', sum.avgWait + ' s'], ['95th percentile wait', sum.p95Wait + ' s'], ['Average queue', sum.avgQueue], ['Worst queue', sum.maxQueue], ['Vehicles completed', sum.completed + ' of ' + sum.spawned], ['Throughput', sum.throughputPerHour + ' veh/h']]
      : live
      ? [['Waiting in queues now', live.queue], ['On the road', live.onRoad], ['Avg wait (finished trips)', live.avgWait + ' s'], ['Completed', live.completed], ['Throughput', live.throughput + ' veh/h'], ['Signal', live.phase]]
      : [['Waiting for first reading…', '']];
    el.innerHTML = '';
    for (const [k, v] of rows) { const a = document.createElement('span'), b = document.createElement('span'); a.textContent = k; b.textContent = v; el.append(a, b); }
  }

  function render(d) {
    lastData = d;
    $('runCard').hidden = false;
    $('runTitle').textContent = fmtT(d.durationSec) + ' run · ' + d.demand + ' veh/h · seed ' + d.seed;
    const pct = d.status === 'completed' ? 100 : Math.min(100, (d.progressSec / d.durationSec) * 100);
    $('bar').style.width = pct + '%';
    $('runSub').textContent = d.status === 'running' ? 'Simulated time ' + clock(d.progressSec) + ' of ' + clock(d.durationSec) + '…'
      : d.status === 'completed' ? 'Finished. Everything is stored; open it again any time from Past runs.'
      : d.status === 'cancelled' ? 'Cancelled.' : 'Failed: ' + (d.error || 'unknown error');
    const lf = d.samples.fixed[d.samples.fixed.length - 1], ld = d.samples.dqn[d.samples.dqn.length - 1];
    kv($('kvFixed'), lf, d.summary.fixed); kv($('kvDqn'), ld, d.summary.dqn);
    chart($('cQueue'), d.samples.fixed, d.samples.dqn, 'queue', d.durationSec);
    chart($('cWait'), d.samples.fixed, d.samples.dqn, 'avgWait', d.durationSec);
    chart($('cThru'), d.samples.fixed, d.samples.dqn, 'throughput', d.durationSec);

    const cmp = d.comparison;
    $('tableCard').hidden = !cmp;
    $('verdict').textContent = '';
    if (cmp) {
      const w = cmp.wins;
      $('verdict').textContent = cmp.overall === 'dqn' ? 'The AI was better on ' + w.dqn + ' of ' + cmp.metrics.length + ' measures (fixed time: ' + w.fixed + ', ties: ' + w.tie + ').'
        : cmp.overall === 'fixed' ? 'Fixed time was better on ' + w.fixed + ' of ' + cmp.metrics.length + ' measures (AI: ' + w.dqn + ', ties: ' + w.tie + ').'
        : 'No clear winner: AI ' + w.dqn + ', fixed ' + w.fixed + ', ties ' + w.tie + '.';
      const tb = $('tbody'); tb.innerHTML = '';
      for (const m of cmp.metrics) {
        const tr = document.createElement('tr');
        const cells = [m.label, m.fixed, m.dqn, (m.improvementPct > 0 ? '+' : '') + m.improvementPct + '%'];
        cells.forEach((t, i) => { const td = document.createElement('td'); td.textContent = t; if (i === 3) td.className = m.winner === 'dqn' ? 'win' : m.winner === 'fixed' ? 'lose' : 'tie'; tr.append(td); });
        tb.append(tr);
      }
      const a = d.summary.dqn;
      $('aiStats').textContent = a && a.decisions ? 'AI made ' + a.decisions + ' decisions, average green ' + a.avgGreen + ' s, and switched phase ' + a.switches + ' times.' : '';
    }
  }

  async function poll() {
    if (!currentId) return;
    try {
      const d = await api('/api/experiments/' + currentId);
      render(d);
      if (d.status === 'running') { timer = setTimeout(poll, 1000); setBusy(true); }
      else { setBusy(false); currentId = d.id; loadHistory(); }
    } catch (e) { show(e.message); setBusy(false); }
  }
  function setBusy(b) { $('start').disabled = b; $('cancel').hidden = !b; }
  function open(id) { clearTimeout(timer); currentId = id; show(''); poll(); window.scrollTo({ top: $('runCard').offsetTop - 20, behavior: 'smooth' }); }

  $('form').addEventListener('submit', async (e) => {
    e.preventDefault(); show('');
    try {
      const body = { minutes: +$('minutes').value, demand: +$('demand').value, seed: +$('seed').value, speed: +$('speed').value };
      const r = await api('/api/experiments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      setBusy(true); open(r.id);
    } catch (err) { show(err.message); }
  });
  $('cancel').addEventListener('click', async () => { try { await api('/api/experiments/' + currentId + '/cancel', { method: 'POST' }); } catch (e) { show(e.message); } });

  async function loadHistory() {
    try {
      const [list, sum] = await Promise.all([api('/api/experiments'), api('/api/traffic/summary')]);
      const w = sum.metrics.find((m) => m.key === 'avgWait');
      $('summary').textContent = w ? 'Across ' + sum.runs + ' finished run(s), the AI changed average wait by ' + (w.avgImprovementPct > 0 ? '−' : '+') + Math.abs(w.avgImprovementPct) + '% compared with fixed time.' : 'No finished runs yet.';
      const tb = $('hist'); tb.innerHTML = '';
      for (const d of list) {
        const tr = document.createElement('tr');
        const f = d.summary.fixed, a = d.summary.dqn;
        const cells = [new Date(d.startedAt).toLocaleString(), fmtT(d.durationSec), d.demand + ' veh/h', null, f && a ? f.avgWait + ' s → ' + a.avgWait + ' s' : '–'];
        cells.forEach((t, i) => { const td = document.createElement('td'); if (i === 3) { const s = document.createElement('span'); s.className = 'pill ' + d.status; s.textContent = d.status; td.append(s); } else td.textContent = t; tr.append(td); });
        const act = document.createElement('td');
        const mk = (label, fn) => { const b = document.createElement('button'); b.textContent = label; b.onclick = fn; b.style.marginLeft = '6px'; act.append(b); };
        mk('Open', () => open(d.id));
        if (d.status !== 'running') {
          mk('CSV', () => { location.href = '/api/experiments/' + d.id + '/export.csv'; });
          mk('Delete', async () => { if (confirm('Delete this run?')) { try { await api('/api/experiments/' + d.id, { method: 'DELETE' }); if (currentId === d.id) { currentId = null; $('runCard').hidden = true; $('tableCard').hidden = true; } loadHistory(); } catch (e) { show(e.message); } } });
        } else { setBusy(true); if (!currentId) open(d.id); }
        tr.append(act); tb.append(tr);
      }
      if (!list.length) tb.innerHTML = '<tr><td colspan="6" style="text-align:left">No runs yet.</td></tr>';
    } catch (e) { show(e.message); }
  }

  window.addEventListener('resize', () => { if (lastData) render(lastData); });
  fetch('/api/auth/me').then((r) => (r.ok ? r.json() : Promise.reject())).then((u) => { $('who').textContent = u.email; }).catch(() => { location.href = '/login'; });
  $('logout').onclick = async () => { const r = await fetch('/api/auth/logout', { method: 'POST' }); location.href = (await r.json()).redirect; };
  fetch('/api/ai/status').then((r) => r.json()).then((s) => { $('model').textContent = s.online ? 'AI model online · trained ' + s.episode + ' episodes' : 'AI model offline: start it with “python serve.py” in the model folder before running a comparison.'; }).catch(() => {});
  loadHistory();
})();
