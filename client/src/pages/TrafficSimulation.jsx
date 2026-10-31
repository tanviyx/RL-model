import React, { useState, useEffect, useRef, useReducer } from 'react';
import { io } from 'socket.io-client';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import './TrafficSimulation.css';
import {
  W, H, ROAD_W, CX, CY, NS_L, NS_R, EW_T, EW_B, PAVE, CROSS,
  STOP_POS, laneCenter, makeWorld, applyUpdate, stepWorld, lampState,
} from './trafficWorld';

const SOCKET_URL = 'https://localhost:5000';
const SPEEDS = [1, 5, 10, 30, 60];
const FONT = "'Barlow', system-ui, sans-serif";
const FONT_NUM = "'Barlow Condensed', 'Barlow', sans-serif";
const LAMP = { red: '#ff5a4a', amber: '#ffb020', green: '#2ee59d' };
const STATE_TEXT = { red: 'Red', amber: 'Amber', green: 'Green' };
const ROT = { SN: 0, EW: 90, NS: 180, WE: 270 }; // cars are drawn facing up, then rotated

// ─── Map: static scenery (re-renders only when the mode or lane count changes) ───
const BUILDING = ['#222831', '#272d37', '#20252d', '#2b313b'];

function Block({ x, y, w, h, seed }) {
  const cols = Math.max(1, Math.round(w / 140));
  const rows = Math.max(1, Math.round(h / 140));
  const cw = w / cols, ch = h / rows;
  const cells = [];
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      const k = (seed * 7 + i * 13 + j * 5) % 6;
      const cx = x + i * cw + 9, cy = y + j * ch + 9, bw = cw - 18, bh = ch - 18;
      if (bw < 14 || bh < 14) continue;
      cells.push(
        k === 0 ? (
          <g key={`${i}-${j}`}>
            <rect x={cx} y={cy} width={bw} height={bh} rx={6} fill="#1b2620" />
            {[0.28, 0.62, 0.45].map((f, t) => (
              <circle key={t} cx={cx + bw * (0.2 + t * 0.3)} cy={cy + bh * f} r={Math.min(bw, bh) * 0.12} fill="#22352b" />
            ))}
          </g>
        ) : (
          <g key={`${i}-${j}`}>
            <rect x={cx} y={cy} width={bw} height={bh} rx={4} fill={BUILDING[(i + j + seed) % 4]} stroke="#343b47" strokeWidth={1} />
            <rect x={cx + bw * 0.18} y={cy + bh * 0.18} width={bw * 0.28} height={bh * 0.22} rx={2} fill="#2f3641" />
          </g>
        )
      );
    }
  }
  return <g>{cells}</g>;
}

const Scene = React.memo(function Scene({ mode, lanes }) {
  const inter = mode === 'intersection';
  const vSegs = inter ? [[0, EW_T], [EW_B, H]] : [[0, H]];
  const hSegs = inter ? [[0, NS_L], [NS_R, W]] : [];
  const step = ROAD_W / 2 / lanes;
  const dividers = Array.from({ length: lanes - 1 }, (_, i) => (i + 1) * step);
  const asphalt = '#23272e';
  const dash = '20 16';
  const stripe = 'rgba(255,255,255,0.26)';
  const yellow = 'rgba(214,174,40,0.85)';

  return (
    <g>
      <rect width={W} height={H} fill="#12151a" />

      {/* city blocks */}
      {inter ? (
        <>
          <Block x={0} y={0} w={NS_L - PAVE} h={EW_T - PAVE} seed={1} />
          <Block x={NS_R + PAVE} y={0} w={W - NS_R - PAVE} h={EW_T - PAVE} seed={2} />
          <Block x={0} y={EW_B + PAVE} w={NS_L - PAVE} h={H - EW_B - PAVE} seed={3} />
          <Block x={NS_R + PAVE} y={EW_B + PAVE} w={W - NS_R - PAVE} h={H - EW_B - PAVE} seed={4} />
        </>
      ) : (
        <>
          <Block x={0} y={0} w={NS_L - PAVE} h={H} seed={1} />
          <Block x={NS_R + PAVE} y={0} w={W - NS_R - PAVE} h={H} seed={2} />
        </>
      )}

      {/* pavements */}
      <rect x={NS_L - PAVE} y={0} width={ROAD_W + PAVE * 2} height={H} fill="#2c313a" />
      {inter && <rect x={0} y={EW_T - PAVE} width={W} height={ROAD_W + PAVE * 2} fill="#2c313a" />}

      {/* asphalt */}
      <rect x={NS_L} y={0} width={ROAD_W} height={H} fill={asphalt} />
      {inter && <rect x={0} y={EW_T} width={W} height={ROAD_W} fill={asphalt} />}
      {inter && <rect x={NS_L} y={EW_T} width={ROAD_W} height={ROAD_W} fill="#282c34" />}

      {/* centre lines + lane dividers */}
      {vSegs.map(([a, b], i) => (
        <g key={`v${i}`}>
          <line x1={CX - 1.8} x2={CX - 1.8} y1={a} y2={b} stroke={yellow} strokeWidth={1.4} />
          <line x1={CX + 1.8} x2={CX + 1.8} y1={a} y2={b} stroke={yellow} strokeWidth={1.4} />
          {dividers.map((o) => (
            <g key={o}>
              <line x1={CX + o} x2={CX + o} y1={a} y2={b} stroke={stripe} strokeWidth={1.5} strokeDasharray={dash} />
              <line x1={CX - o} x2={CX - o} y1={a} y2={b} stroke={stripe} strokeWidth={1.5} strokeDasharray={dash} />
            </g>
          ))}
        </g>
      ))}
      {hSegs.map(([a, b], i) => (
        <g key={`h${i}`}>
          <line y1={CY - 1.8} y2={CY - 1.8} x1={a} x2={b} stroke={yellow} strokeWidth={1.4} />
          <line y1={CY + 1.8} y2={CY + 1.8} x1={a} x2={b} stroke={yellow} strokeWidth={1.4} />
          {dividers.map((o) => (
            <g key={o}>
              <line y1={CY + o} y2={CY + o} x1={a} x2={b} stroke={stripe} strokeWidth={1.5} strokeDasharray={dash} />
              <line y1={CY - o} y2={CY - o} x1={a} x2={b} stroke={stripe} strokeWidth={1.5} strokeDasharray={dash} />
            </g>
          ))}
        </g>
      ))}

      {/* edge lines */}
      <line x1={NS_L} x2={NS_L} y1={0} y2={H} stroke="rgba(255,255,255,0.18)" strokeWidth={2} />
      <line x1={NS_R} x2={NS_R} y1={0} y2={H} stroke="rgba(255,255,255,0.18)" strokeWidth={2} />
      {inter && (
        <>
          <line y1={EW_T} y2={EW_T} x1={0} x2={W} stroke="rgba(255,255,255,0.18)" strokeWidth={2} />
          <line y1={EW_B} y2={EW_B} x1={0} x2={W} stroke="rgba(255,255,255,0.18)" strokeWidth={2} />
          <rect x={NS_L} y={EW_T} width={ROAD_W} height={ROAD_W} fill="#282c34" />
        </>
      )}

      {/* zebra crossings */}
      {Array.from({ length: 8 }, (_, i) => NS_L + 7 + i * 17).map((x) => (
        <g key={x} fill="rgba(255,255,255,0.3)">
          <rect x={x} y={EW_T - CROSS} width={9} height={18} rx={1} />
          <rect x={x} y={EW_B + 6} width={9} height={18} rx={1} />
        </g>
      ))}
      {inter && Array.from({ length: 8 }, (_, i) => EW_T + 7 + i * 17).map((y) => (
        <g key={y} fill="rgba(255,255,255,0.3)">
          <rect x={NS_L - CROSS} y={y} width={18} height={9} rx={1} />
          <rect x={NS_R + 6} y={y} width={18} height={9} rx={1} />
        </g>
      ))}

      {/* stop lines (only across the incoming half) */}
      <g stroke="rgba(255,255,255,0.85)" strokeWidth={3}>
        <line x1={CX} x2={NS_R} y1={STOP_POS.NS} y2={STOP_POS.NS} />
        <line x1={NS_L} x2={CX} y1={STOP_POS.SN} y2={STOP_POS.SN} />
        {inter && <line x1={STOP_POS.EW} x2={STOP_POS.EW} y1={EW_T} y2={CY} />}
        {inter && <line x1={STOP_POS.WE} x2={STOP_POS.WE} y1={CY} y2={EW_B} />}
      </g>
    </g>
  );
});

// ─── Signal heads on the kerb, one per approach ───
function Head({ x, y, horiz, state }) {
  const w = horiz ? 46 : 18, h = horiz ? 18 : 46;
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={9} fill="#0a0b0e" stroke="#3a404b" strokeWidth={1.5} />
      {['red', 'amber', 'green'].map((c, i) => {
        const o = (i - 1) * 14;
        const on = state === c;
        return (
          <circle key={c} cx={horiz ? o : 0} cy={horiz ? 0 : o} r={5} fill={on ? LAMP[c] : '#1b1e24'}
            style={on ? { filter: `drop-shadow(0 0 5px ${LAMP[c]})` } : undefined} />
        );
      })}
    </g>
  );
}

function Signals({ mode, ns, ew }) {
  return (
    <g>
      <Head x={NS_R + PAVE / 2} y={STOP_POS.NS - 30} state={ns} />
      <Head x={NS_L - PAVE / 2} y={STOP_POS.SN + 30} state={ns} />
      {mode === 'intersection' && (
        <>
          <Head horiz x={STOP_POS.EW - 30} y={EW_T - PAVE / 2} state={ew} />
          <Head horiz x={STOP_POS.WE + 30} y={EW_B + PAVE / 2} state={ew} />
        </>
      )}
    </g>
  );
}

// ─── Queue tags (the server's real queue numbers) ───
function QueueTag({ x, y, label, n, max }) {
  const ratio = Math.min(1, n / Math.max(1, max));
  const tone = ratio < 0.6 ? LAMP.green : ratio < 0.85 ? LAMP.amber : LAMP.red;
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect width={122} height={54} rx={8} fill="rgba(12,14,18,0.9)" stroke="#2c323c" />
      <text x={12} y={19} fontSize={12.5} fill="#8b94a2" fontFamily={FONT}>{label}</text>
      <text x={12} y={39} fontSize={22} fontWeight={600} fill="#e8ebf0" fontFamily={FONT_NUM}>
        {n}<tspan fontSize={12.5} fontWeight={400} fill="#8b94a2" fontFamily={FONT}> waiting</tspan>
      </text>
      <rect x={12} y={45} width={98} height={3} rx={1.5} fill="#1d2128" />
      <rect x={12} y={45} width={98 * ratio} height={3} rx={1.5} fill={tone} />
    </g>
  );
}

// ─── Cars ───
function Car({ c, lanes }) {
  const lc = laneCenter(c.dir, c.lane, lanes);
  const horiz = c.dir === 'EW' || c.dir === 'WE';
  const x = horiz ? c.pos : lc;
  const y = horiz ? lc : c.pos;
  const tail = c.braking ? '#ff3b30' : '#7d2320';
  return (
    <g transform={`translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${ROT[c.dir]})`}>
      <path d="M-9 -19 L-16 -52 L16 -52 L9 -19Z" fill="url(#beam)" />
      <rect x={-9} y={-16} width={22} height={38} rx={6} fill="rgba(0,0,0,0.35)" />
      <rect x={-11} y={-19} width={22} height={38} rx={6} fill={c.color} />
      <rect x={-8} y={-11} width={16} height={7} rx={2} fill="#0b0f14" opacity={0.8} />
      <rect x={-8} y={-2} width={16} height={11} rx={3} fill="rgba(0,0,0,0.22)" />
      <rect x={-7} y={11} width={14} height={4} rx={1.5} fill="#0b0f14" opacity={0.7} />
      <circle cx={-7} cy={-17.2} r={2.2} fill="#fff6cf" />
      <circle cx={7} cy={-17.2} r={2.2} fill="#fff6cf" />
      {c.braking && <rect x={-11} y={18.5} width={22} height={5} rx={2.5} fill="#ff3b30" opacity={0.35} />}
      <rect x={-9.5} y={16.5} width={5} height={2.4} rx={1} fill={tail} />
      <rect x={4.5} y={16.5} width={5} height={2.4} rx={1} fill={tail} />
    </g>
  );
}

/** Owns the animation loop. Only this small layer re-renders every frame, not the whole page. */
function CarsLayer({ worldRef }) {
  const [, redraw] = useReducer((n) => n + 1, 0);
  useEffect(() => {
    let raf;
    let last = performance.now();
    const loop = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (stepWorld(worldRef.current, dt, now)) redraw();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [worldRef]);

  const w = worldRef.current;
  return <g>{w.cars.map((c) => <Car key={c.id} c={c} lanes={w.lanes} />)}</g>;
}

// ─── helpers ───
const fmtBig = (n = 0) => (Math.abs(n) >= 1000 ? `${(n / 1000).toFixed(1)}k` : Math.round(n));
const sourceLabel = (s) =>
  s === 'synthetic' ? 'Random arrivals' : s === 'profile' ? 'Pune, average day' : `Pune, ${String(s).slice(4)}`;

// ─── page ───
export default function TrafficSimulation() {
  const [sim, setSim] = useState({
    nsQueue: 0, ewQueue: 0, light: 0, cleared: 0, reward: 0, cumulativeReward: 0,
    isRunning: false, spawnRate: 0.4, simMode: 'intersection', lanes: 4, speed: 1,
    lostLeft: 0, lostTime: 3, timeInPhase: 0, minGreen: 5, maxQueue: 10,
  });
  const [perf, setPerf] = useState([]);
  const [connected, setConnected] = useState(false);
  const socketRef = useRef(null);
  const worldRef = useRef(null);
  const tickRef = useRef(0);
  if (!worldRef.current) worldRef.current = makeWorld();

  useEffect(() => {
    const s = io(SOCKET_URL, { withCredentials: true, transports: ['websocket'] });
    socketRef.current = s;

    s.on('connect', () => {
      setConnected(true);
      try {
        const c = localStorage.getItem('automationConfig');
        if (c) s.emit('update_config', JSON.parse(c));
      } catch { /* ignore a corrupt saved config */ }
    });
    s.on('disconnect', () => setConnected(false));
    s.on('connect_error', (err) => console.warn('Socket error:', err.message));

    s.on('sim_update', (d) => {
      applyUpdate(worldRef.current, d, performance.now());
      setSim((p) => ({ ...p, ...d }));
      if (d.events) {
        tickRef.current += 1;
        const point = { i: tickRef.current, v: d.cleared, r: d.reward };
        setPerf((p) => [...p, point].slice(-60));
      }
    });

    return () => { s.close(); socketRef.current = null; };
  }, []);

  const emit = (ev, payload) => socketRef.current?.emit(ev, payload);
  const onStartPause = () => emit(sim.isRunning ? 'pause_sim' : 'start_sim');
  const onReset = () => { emit('reset_sim'); setPerf([]); tickRef.current = 0; };

  const single = sim.simMode === 'single';
  const nsState = lampState(0, sim);
  const ewState = lampState(1, sim);
  const realDemand = !!sim.demandSource && sim.demandSource !== 'synthetic';
  const clearing = (sim.lostLeft || 0) > 0;
  const phaseColor = clearing ? LAMP.amber : LAMP.green;
  const phaseText = clearing
    ? 'Clearing the junction'
    : sim.light === 0 ? 'North–South green' : single ? 'North–South red' : 'East–West green';
  const minGreenPct = Math.min(100, ((sim.timeInPhase || 0) / Math.max(1, sim.minGreen || 5)) * 100);
  const qColor = (n) => {
    const r = n / Math.max(1, sim.maxQueue || 10);
    return r < 0.6 ? LAMP.green : r < 0.85 ? LAMP.amber : LAMP.red;
  };

  const rows = [
    { key: 'ns', name: 'North–South', state: nsState, q: sim.nsQueue || 0 },
    ...(single ? [] : [{ key: 'ew', name: 'East–West', state: ewState, q: sim.ewQueue || 0 }]),
  ];

  return (
    <div className="ts-app">
      {/* ── Sidebar ── */}
      <aside className="ts-side">
        <div className="ts-head">
          <div>
            <h1 className="ts-title">Signal control</h1>
            <p className="ts-sub">Q-learning agent, live simulation</p>
          </div>
          <span className={`ts-conn ${connected ? 'on' : 'off'}`}><i />{connected ? 'Connected' : 'Offline'}</span>
        </div>

        <section className="ts-card">
          <h2 className="ts-h">Signals</h2>
          {rows.map((r) => (
            <div className="ts-sig" key={r.key}>
              <div className={`ts-head-lamp ${r.state}`}><b /><b /><b /></div>
              <span className="ts-sig-name">{r.name}</span>
              <span className={`ts-sig-state ts-state-${r.state}`}>{STATE_TEXT[r.state]}</span>
            </div>
          ))}
          <div className="ts-phase">
            <div className="ts-phase-row">
              <span>Time in this phase</span>
              <strong className="ts-num">{sim.timeInPhase || 0}s</strong>
            </div>
            <div className="ts-bar"><div style={{ width: `${minGreenPct}%`, background: minGreenPct >= 100 ? LAMP.green : '#5d6675' }} /></div>
            <div className="ts-hint">The agent can switch after {sim.minGreen || 5}s of green.</div>
          </div>
        </section>

        <section className="ts-card">
          <h2 className="ts-h">Queues</h2>
          {rows.map((r) => (
            <div className="ts-meter" key={r.key}>
              <div className="ts-meter-top">
                <span>{r.name}</span>
                <b className="ts-num">{r.q}<small>of {sim.maxQueue}</small></b>
              </div>
              <div className="ts-bar"><div style={{ width: `${Math.min(100, (r.q / Math.max(1, sim.maxQueue)) * 100)}%`, background: qColor(r.q) }} /></div>
            </div>
          ))}
        </section>

        <section className="ts-card">
          <h2 className="ts-h">Controls</h2>

          {sim.sources && (
            <div className="ts-field">
              <label className="ts-label" htmlFor="ts-demand">Traffic demand</label>
              <select id="ts-demand" className="ts-select" value={sim.demandSource}
                onChange={(e) => emit('set_demand_source', e.target.value)} disabled={!connected}>
                {sim.sources.map((s) => <option key={s} value={s}>{sourceLabel(s)}</option>)}
              </select>
              {realDemand && (
                <p className="ts-hint">North–South {sim.rateNS} veh/s, East–West {sim.rateEW} veh/s</p>
              )}
            </div>
          )}

          <div className="ts-field">
            <div className="ts-label"><span>Simulation speed</span><b>{sim.speed}x</b></div>
            <div className="ts-seg" role="group" aria-label="Simulation speed">
              {SPEEDS.map((v) => (
                <button key={v} aria-pressed={sim.speed === v} disabled={!connected}
                  onClick={() => emit('set_speed', v)}>{v}x</button>
              ))}
            </div>
            {sim.speed >= 10 && (
              <p className="ts-hint">At this speed the map shows a sample of the traffic. The numbers stay exact.</p>
            )}
          </div>

          <div className="ts-field">
            <div className="ts-label">
              <label htmlFor="ts-spawn">Arrival rate</label>
              <b>{realDemand ? 'From data' : `${Math.round((sim.spawnRate || 0.4) * 100)}%`}</b>
            </div>
            <input id="ts-spawn" className="ts-range" type="range" min="0.1" max="1" step="0.05"
              value={sim.spawnRate || 0.4} disabled={!connected || realDemand}
              onChange={(e) => emit('set_spawn_rate', parseFloat(e.target.value))} />
          </div>

          <div className="ts-actions">
            <button className={`ts-btn ${sim.isRunning ? 'pause' : 'go'}`} disabled={!connected} onClick={onStartPause}>
              {sim.isRunning ? 'Pause' : 'Start'}
            </button>
            <button className="ts-btn" disabled={!connected} onClick={onReset}>Reset</button>
          </div>
          {!connected && (
            <p className="ts-hint ts-offline">Can’t reach the simulation server. Start the backend, then reload this page.</p>
          )}
        </section>

        <section className="ts-card">
          <h2 className="ts-h">Results</h2>
          <div className="ts-stats">
            <div className="ts-stat"><span>Vehicles cleared</span><b className="ts-num">{sim.cleared || 0}</b></div>
            <div className="ts-stat"><span>Last step</span>
              <b className={`ts-num ${(sim.reward || 0) >= 0 ? 'ts-pos' : 'ts-neg'}`}>{(sim.reward || 0).toFixed(1)}</b></div>
            <div className="ts-stat"><span>Total reward</span>
              <b className={`ts-num ${(sim.cumulativeReward || 0) >= 0 ? 'ts-pos' : 'ts-neg'}`}>{fmtBig(sim.cumulativeReward)}</b></div>
          </div>
          <div className="ts-legend">
            <span><i style={{ background: LAMP.green }} />Cleared</span>
            <span><i style={{ background: LAMP.amber }} />Step reward</span>
          </div>
          <div className="ts-chart">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={perf} margin={{ top: 4, right: 4, bottom: 0, left: -18 }}>
                <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                <XAxis dataKey="i" hide />
                <YAxis yAxisId="l" stroke="#6b7482" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis yAxisId="r" orientation="right" stroke="#6b7482" fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ background: '#0d0f13', border: '1px solid #262b34', borderRadius: 8, fontSize: 12 }}
                  labelFormatter={() => ''} />
                <Line yAxisId="l" type="monotone" dataKey="v" name="Cleared" stroke={LAMP.green} strokeWidth={2} dot={false} isAnimationActive={false} />
                <Line yAxisId="r" type="monotone" dataKey="r" name="Step reward" stroke={LAMP.amber} strokeWidth={1.5} dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>
      </aside>

      {/* ── Map ── */}
      <main className="ts-stage">
        <div className="ts-mapbar">
          <div className="ts-clock">
            {sim.simTime || '--:--'}
            <small>{sourceLabel(sim.demandSource || 'synthetic')}</small>
          </div>
          <span className="ts-phase-chip"><i style={{ background: phaseColor }} />{phaseText}</span>
        </div>

        <div className="ts-map">
          <svg viewBox={`0 0 ${W} ${H}`} role="img"
            aria-label={`Traffic ${single ? 'road' : 'intersection'}: ${sim.nsQueue || 0} vehicles waiting north–south${single ? '' : `, ${sim.ewQueue || 0} east–west`}`}>
            <defs>
              <linearGradient id="beam" x1="0" y1="1" x2="0" y2="0">
                <stop offset="0%" stopColor="#fff4c8" stopOpacity="0.16" />
                <stop offset="100%" stopColor="#fff4c8" stopOpacity="0" />
              </linearGradient>
            </defs>
            <Scene mode={sim.simMode} lanes={sim.lanes || 4} />
            <Signals mode={sim.simMode} ns={nsState} ew={ewState} />
            <CarsLayer worldRef={worldRef} />
            <QueueTag x={NS_L - PAVE - 12 - 122} y={16} label="North–South" n={sim.nsQueue || 0} max={sim.maxQueue || 10} />
            {!single && <QueueTag x={16} y={EW_T - PAVE - 12 - 54} label="East–West" n={sim.ewQueue || 0} max={sim.maxQueue || 10} />}
          </svg>
        </div>
      </main>
    </div>
  );
}
