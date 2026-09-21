import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import './TrafficSimulation.css';

// ─── Constants ──────────────────────────────────────────────────────────────────
const W = 800, H = 800;
const ROAD_W = 144;
const CX = W / 2, CY = H / 2;

const ROAD_NS_LEFT = CX - ROAD_W / 2;  // 328
const ROAD_NS_RIGHT = CX + ROAD_W / 2;  // 472
const ROAD_EW_TOP = CY - ROAD_W / 2;  // 328
const ROAD_EW_BOT = CY + ROAD_W / 2;  // 472

const IX1 = ROAD_NS_LEFT, IX2 = ROAD_NS_RIGHT;
const IY1 = ROAD_EW_TOP, IY2 = ROAD_EW_BOT;

const CAR_W = 24;   // width perpendicular to travel direction
const CAR_H = 40;   // length along travel direction
const CAR_GAP = 8;   // minimum bumper-to-bumper gap

// Dynamic lane centre calculation
function getLaneCenter(dir, lane, totalLanes) {
  const dirW = ROAD_W / 2;
  const laneWidth = dirW / totalLanes;
  const offset = (lane + 0.5) * laneWidth;
  
  if (dir === 'NS') return ROAD_NS_LEFT + dirW + offset;
  if (dir === 'SN') return ROAD_NS_RIGHT - dirW - offset;
  if (dir === 'EW') return ROAD_EW_TOP + dirW + offset;
  if (dir === 'WE') return ROAD_EW_BOT - dirW - offset;
  return 0;
}

// Stop position = where the FRONT of a car must halt
const STOP_POS = {
  NS: IY1 - 6,       // southbound stops above intersection
  SN: IY2 + 6,       // northbound stops below intersection
  EW: IX1 - 6,       // eastbound stops left of intersection
  WE: IX2 + 6,       // westbound stops right of intersection
};

// +1 means position increases as car moves forward; -1 means decreases
const SIGN = { NS: 1, SN: -1, EW: 1, WE: -1 };

// Starting positions (off screen entry edge)
const START_POS = { NS: -CAR_H / 2 - 10, SN: H + CAR_H / 2 + 10, EW: -CAR_H / 2 - 10, WE: W + CAR_H / 2 + 10 };
const END_POS = { NS: H + CAR_H, SN: -CAR_H, EW: W + CAR_H, WE: -CAR_H };

let uid = 0;
const COLORS = ['#e63946', '#2a9d8f', '#e9c46a', '#264653', '#f4a261', '#6a0572', '#118ab2', '#06d6a0', '#ef476f', '#457b9d'];
function makeCar(dir, totalLanes = 4) {
  return {
    id: uid++, direction: dir, color: COLORS[uid % COLORS.length],
    pos: START_POS[dir], speed: 1.7 + Math.random() * 0.7, stopped: false,
    lane: Math.floor(Math.random() * totalLanes)
  };
}

// ─── Car SVG shape ────────────────────────────────────────────────────────────
function CarShape({ car, totalLanes }) {
  const isH = car.direction === 'EW' || car.direction === 'WE';
  const flip = car.direction === 'SN' || car.direction === 'WE';
  const lCenter = getLaneCenter(car.direction, car.lane, totalLanes);
  const cx = isH ? car.pos : lCenter;
  const cy = isH ? lCenter : car.pos;
  const rW = isH ? CAR_H : CAR_W;
  const rH = isH ? CAR_W : CAR_H;
  const g = 'rgba(215,240,255,0.82)';

  return (
    <g>
      {/* shadow */}
      <rect x={cx - rW / 2 + 2} y={cy - rH / 2 + 4} width={rW} height={rH} rx={5} fill="rgba(0,0,0,0.22)" />
      {/* body */}
      <rect x={cx - rW / 2} y={cy - rH / 2} width={rW} height={rH} rx={5} fill={car.color} />
      {/* cabin glass */}
      {isH
        ? <rect x={cx - rW / 2 + 8} y={cy - rH / 2 + 4} width={rW - 20} height={rH - 8} rx={3} fill={g} />
        : <rect x={cx - rW / 2 + 4} y={cy - rH / 2 + 8} width={rW - 8} height={rH - 20} rx={3} fill={g} />
      }
      {/* headlights */}
      {isH && !flip && <><circle cx={cx + rW / 2 - 4} cy={cy - rH / 2 + 5} r={3} fill="#fffde7" /><circle cx={cx + rW / 2 - 4} cy={cy + rH / 2 - 5} r={3} fill="#fffde7" /></>}
      {isH && flip && <><circle cx={cx - rW / 2 + 4} cy={cy - rH / 2 + 5} r={3} fill="#fffde7" /><circle cx={cx - rW / 2 + 4} cy={cy + rH / 2 - 5} r={3} fill="#fffde7" /></>}
      {!isH && !flip && <><rect x={cx - rW / 2 + 3} y={cy + rH / 2 - 5} width={6} height={4} rx={1} fill="#fffde7" /><rect x={cx + rW / 2 - 9} y={cy + rH / 2 - 5} width={6} height={4} rx={1} fill="#fffde7" /></>}
      {!isH && flip && <><rect x={cx - rW / 2 + 3} y={cy - rH / 2 + 1} width={6} height={4} rx={1} fill="#fffde7" /><rect x={cx + rW / 2 - 9} y={cy - rH / 2 + 1} width={6} height={4} rx={1} fill="#fffde7" /></>}
      {/* tail lights */}
      {isH && !flip && <><rect x={cx - rW / 2} y={cy - rH / 2 + 3} width={5} height={5} rx={1} fill={car.stopped ? '#ff1744' : '#aa2222'} /><rect x={cx - rW / 2} y={cy + rH / 2 - 8} width={5} height={5} rx={1} fill={car.stopped ? '#ff1744' : '#aa2222'} /></>}
      {isH && flip && <><rect x={cx + rW / 2 - 5} y={cy - rH / 2 + 3} width={5} height={5} rx={1} fill={car.stopped ? '#ff1744' : '#aa2222'} /><rect x={cx + rW / 2 - 5} y={cy + rH / 2 - 8} width={5} height={5} rx={1} fill={car.stopped ? '#ff1744' : '#aa2222'} /></>}
      {!isH && !flip && <><rect x={cx - rW / 2 + 3} y={cy - rH / 2} width={6} height={4} rx={1} fill={car.stopped ? '#ff1744' : '#aa2222'} /><rect x={cx + rW / 2 - 9} y={cy - rH / 2} width={6} height={4} rx={1} fill={car.stopped ? '#ff1744' : '#aa2222'} /></>}
      {!isH && flip && <><rect x={cx - rW / 2 + 3} y={cy + rH / 2 - 4} width={6} height={4} rx={1} fill={car.stopped ? '#ff1744' : '#aa2222'} /><rect x={cx + rW / 2 - 9} y={cy + rH / 2 - 4} width={6} height={4} rx={1} fill={car.stopped ? '#ff1744' : '#aa2222'} /></>}
    </g>
  );
}

// ─── Traffic Light Pole ───────────────────────────────────────────────────────
function Pole({ x, y, green }) {
  return (
    <g transform={`translate(${x},${y})`}>
      <rect x={-3} y={-65} width={6} height={65} rx={2} fill="#555" />
      <rect x={-13} y={-92} width={26} height={62} rx={5} fill="#111" stroke="#333" strokeWidth={1.5} />
      <circle cx={0} cy={-78} r={9} fill={green ? '#200000' : '#ff1744'}
        style={{ filter: green ? 'none' : 'drop-shadow(0 0 7px #ff1744)', transition: 'fill 0.4s' }} />
      <circle cx={0} cy={-61} r={9} fill="#1a1200" />
      <circle cx={0} cy={-44} r={9} fill={green ? '#00e676' : '#001508'}
        style={{ filter: green ? 'drop-shadow(0 0 9px #00e676)' : 'none', transition: 'fill 0.4s' }} />
    </g>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function TrafficSimulation() {
  const [simState, setSimState] = useState({
    nsQueue: 0, ewQueue: 0, light: 0, cleared: 0, reward: 0, cumulativeReward: 0, isRunning: false, spawnRate: 0.4,
    simMode: 'intersection'
  });
  const [perfData, setPerfData] = useState([]);
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);
  const [cars, setCars] = useState([]);

  const rafRef = useRef(null);
  const stRef = useRef(simState);
  const spawnTick = useRef(0);
  stRef.current = simState;

  // ── Socket ─────────────────────────────────────────────────────────────────
useEffect(() => {
  const s = io("https://localhost:5000", {
    withCredentials: true,
    transports: ["websocket"],
  });

  s.on("connect", () => {
    console.log("🟢 CONNECTED:", s.id); // 🔥 ADD THIS
    setConnected(true);
    setSocket(s);

    try {
      const c = localStorage.getItem("automationConfig");
      if (c) s.emit("update_config", JSON.parse(c));
    } catch {}
  });

  s.on("disconnect", () => {
    console.log("🔴 DISCONNECTED");
    setConnected(false);
  });

  s.on("connect_error", (err) => {
    console.log("❌ SOCKET ERROR:", err.message); // 🔥 IMPORTANT
  });

  s.on("sim_update", (d) => {
    setSimState(d);
    setPerfData((p) => {
      const n = [
        ...p,
        { t: new Date().toLocaleTimeString(), v: d.cleared, r: d.reward },
      ];
      return n.length > 30 ? n.slice(1) : n;
    });
  });

  return () => s.close();
}, []);

  // ── Animation loop ─────────────────────────────────────────────────────────
  useEffect(() => {
    const tick = () => {
      const st = stRef.current;
      spawnTick.current++;

      setCars(prev => {
        let next = [...prev];

        // Spawn
        if (st.isRunning && spawnTick.current % 50 === 0) {
          const rate = st.spawnRate || 0.4;
          const totalLanes = st.lanes || 4;
          const modes = st.simMode === 'single' ? ['NS', 'SN'] : ['NS', 'SN', 'EW', 'WE'];
          modes.forEach(dir => {
            if (Math.random() < rate * 0.5) {
              const laneIdx = Math.floor(Math.random() * totalLanes);
              const sameLane = next.filter(c => c.direction === dir && c.lane === laneIdx);
              const blocked = sameLane.some(c => Math.abs(c.pos - START_POS[dir]) < CAR_H + CAR_GAP + 10);
              if (!blocked) next.push(makeCar(dir, totalLanes));
            }
          });
        }

        // Physics — per direction
        ['NS', 'SN', 'EW', 'WE'].forEach(dir => {
          const sign = SIGN[dir];
          const isNS = dir === 'NS' || dir === 'SN';
          const green = st.light === 0 ? isNS : !isNS;
          const stopP = STOP_POS[dir];

          // Sort: leader (furthest along) first
          const lane = next
            .filter(c => c.direction === dir)
            .sort((a, b) => sign * (b.pos - a.pos));

          lane.forEach((car, i) => {
            const sameLaneCars = lane.filter(c => c.lane === car.lane);
            const carIdxInLane = sameLaneCars.findIndex(c => c.id === car.id);
            const leader = sameLaneCars[carIdxInLane - 1];
            let maxPos = END_POS[dir];

            // ── Red light: stop before stop line ──
            if (!green) {
              // Centre of car when front is at stopP
              const maxCentre = stopP - sign * CAR_H / 2;
              maxPos = sign > 0 ? Math.min(maxPos, maxCentre) : Math.max(maxPos, maxCentre);
            }

            // ── Car-following: maintain gap behind leader ──
            if (leader) {
              const leaderBack = leader.pos - sign * (CAR_H / 2);
              const safeCentre = leaderBack - sign * (CAR_GAP + CAR_H / 2);
              maxPos = sign > 0 ? Math.min(maxPos, safeCentre) : Math.max(maxPos, safeCentre);
            }

            const desired = car.pos + sign * car.speed;
            const newPos = sign > 0 ? Math.min(desired, maxPos) : Math.max(desired, maxPos);

            const ni = next.findIndex(c => c.id === car.id);
            if (ni !== -1) next[ni] = { ...next[ni], pos: newPos, stopped: Math.abs(newPos - car.pos) < 0.05 };
          });
        });

        // Remove off-screen
        next = next.filter(c => {
          const s = SIGN[c.direction];
          return s > 0 ? c.pos < END_POS[c.direction] + 10 : c.pos > END_POS[c.direction] - 10;
        });

        return next;
      });

      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  const onStartPause = () => { if (!socket) return; simState.isRunning ? socket.emit('pause_sim') : socket.emit('start_sim'); };
  const onReset = () => { if (!socket) return; socket.emit('reset_sim'); setCars([]); };
  const onSpawn = e => { if (!socket) return; socket.emit('set_spawn_rate', parseFloat(e.target.value)); };

  const nsGreen = simState.light === 0;
  const ewGreen = !nsGreen;

  return (
    <div className="cyber-container">

      {/* ── SIDEBAR ─────────────────────────────────────────────────────────── */}
      <div className="dashboard-sidebar">
        <div className="dashboard-header">
          <h1 className="cyber-title">SMART CITY AI</h1>
          <p className="cyber-subtitle">Q-Learning Traffic Control</p>
          <div className={`status-badge ${connected ? 'online' : 'offline'}`}>
            <div className="pulse-dot" />
            {connected ? 'LIVE CONNECTION' : 'DISCONNECTED'}
          </div>
        </div>

        <div className="control-panel glass-panel">
          <h3 className="panel-title">SIMULATION CONTROLS</h3>
          <div className="slider-wrapper">
            <div className="slider-header">
              <label>SPAWN RATE</label>
              <span className="slider-value">{Math.round((simState.spawnRate || 0.4) * 100)}%</span>
            </div>
            <input type="range" min="0.1" max="1.0" step="0.05"
              value={simState.spawnRate || 0.4} onChange={onSpawn}
              disabled={!connected} className="cyber-slider" />
          </div>
          <div className="button-group">
            <button className={`cyber-btn ${!simState.isRunning ? 'action-start' : 'action-pause'}`}
              disabled={!connected} onClick={onStartPause}>
              {simState.isRunning ? 'PAUSE' : 'START'}
            </button>
            <button className="cyber-btn action-reset" disabled={!connected} onClick={onReset}>RESET</button>
          </div>
        </div>

        <div className="glass-panel" style={{ padding: '1.2rem 1.5rem', marginBottom: '1rem' }}>
          <h3 className="panel-title" style={{ marginBottom: '1rem' }}>SIGNAL STATUS</h3>
          <div style={{ display: 'flex', justifyContent: 'space-around' }}>
            {[['N ↕ S', nsGreen], ['E ↔ W', ewGreen]].map(([lbl, g]) => (
              <div key={lbl} style={{ textAlign: 'center' }}>
                <div style={{
                  width: 18, height: 18, borderRadius: '50%', margin: '0 auto 5px',
                  background: g ? '#00e676' : '#440000', boxShadow: g ? '0 0 12px #00e676' : 'none', transition: 'all 0.4s'
                }} />
                <div style={{ fontSize: '0.7rem', color: '#8A92A6', letterSpacing: '1px' }}>{lbl}</div>
                <div style={{ fontSize: '0.78rem', fontWeight: 700, color: g ? '#00e676' : '#ff1744', marginTop: 3 }}>
                  {g ? 'GREEN' : 'RED'}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="metrics-panel">
          <div className="metric-box glass-panel">
            <span className="metric-label">N–S QUEUE</span>
            <span className="metric-value">{simState.nsQueue || 0}</span>
          </div>
          <div className="metric-box glass-panel">
            <span className="metric-label">E–W QUEUE</span>
            <span className="metric-value">{simState.ewQueue || 0}</span>
          </div>
          <div className="metric-box highlight glass-panel">
            <span className="metric-label">THROUGHPUT</span>
            <span className="metric-value glowing-text">{simState.cleared || 0} <span className="unit">VEH</span></span>
          </div>
        </div>

        <div className="glass-panel" style={{ padding: '1.2rem 1.5rem', marginBottom: '1rem' }}>
          <h3 className="panel-title" style={{ marginBottom: '1rem', color: '#00f2fe' }}>RL LEARNING METRICS</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div className="metric-box" style={{ background: 'rgba(0,242,254,0.05)', border: '1px solid rgba(0,242,254,0.1)' }}>
              <span className="metric-label" style={{ fontSize: '0.6rem' }}>STEP REWARD</span>
              <span className="metric-value" style={{ fontSize: '1.2rem', color: simState.reward >= 0 ? '#00e676' : '#ff1744' }}>
                {simState.reward?.toFixed(1) || 0}
              </span>
            </div>
            <div className="metric-box" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}>
              <span className="metric-label" style={{ fontSize: '0.6rem' }}>LEARNING PROGRESS</span>
              <span className="metric-value" style={{ fontSize: '1.2rem', color: '#f5dfa0' }}>
                {Math.abs(simState.cumulativeReward || 0) > 1000 
                  ? (simState.cumulativeReward / 1000).toFixed(1) + 'k' 
                  : simState.cumulativeReward?.toFixed(0) || 0}
              </span>
            </div>
          </div>
          <div style={{ marginTop: '1rem' }}>
             <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.6rem', color: '#8A92A6', marginBottom: '4px' }}>
                <span>AGENT EFFICIENCY</span>
                <span>{Math.max(0, Math.min(100, 100 + (simState.reward || 0) * 5)).toFixed(0)}%</span>
             </div>
             <div style={{ width: '100%', height: '4px', background: 'rgba(255,255,255,0.1)', borderRadius: '2px', overflow: 'hidden' }}>
                <div style={{ 
                  width: `${Math.max(0, Math.min(100, 100 + (simState.reward || 0) * 5))}%`, 
                  height: '100%', 
                  background: '#00f2fe',
                  transition: 'width 0.4s ease'
                }} />
             </div>
          </div>
        </div>

        <div className="chart-panel glass-panel" style={{ height: 210, marginTop: '1rem', padding: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <h3 className="panel-title" style={{ fontSize: '0.7rem' }}>PERFORMANCE ANALYTICS</h3>
            <div style={{ display: 'flex', gap: '10px' }}>
               <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#00f2fe' }} />
                  <span style={{ fontSize: '0.5rem', color: '#8A92A6' }}>FLOW</span>
               </div>
               <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#ff1744' }} />
                  <span style={{ fontSize: '0.5rem', color: '#8A92A6' }}>REWARD</span>
               </div>
            </div>
          </div>
          <ResponsiveContainer width="100%" height="80%">
            <LineChart data={perfData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="t" hide />
              <YAxis yAxisId="left" stroke="#6c7086" fontSize={10} />
              <YAxis yAxisId="right" orientation="right" stroke="#6c7086" fontSize={10} />
              <Tooltip contentStyle={{ background: '#0a0a0f', border: '1px solid rgba(255,255,255,0.1)', fontSize: '0.8rem' }} itemStyle={{ fontSize: '0.7rem' }} />
              <Line yAxisId="left" type="monotone" dataKey="v" stroke="#00f2fe" strokeWidth={2} dot={false} isAnimationActive={false} name="Throughput" />
              <Line yAxisId="right" type="monotone" dataKey="r" stroke="#ff1744" strokeWidth={1.5} dot={false} isAnimationActive={false} name="Reward" strokeDasharray="3 3" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── CANVAS ──────────────────────────────────────────────────────────── */}
      <div className="simulation-canvas">
        <svg viewBox={`0 0 ${W} ${H}`} className="intersection-svg">
          <defs>
            <filter id="carShadow">
              <feDropShadow dx="0" dy="2" stdDeviation="3" floodOpacity="0.3" />
            </filter>
          </defs>

          {/* ── BACKGROUND (light warm city) ── */}
          <rect width={W} height={H} fill="#d4cec8" />

          {/* ── CITY BLOCKS ── */}
          {[
            [0, 0, ROAD_NS_LEFT - 10, ROAD_EW_TOP - 10],
            [ROAD_NS_RIGHT + 10, 0, W - ROAD_NS_RIGHT - 10, ROAD_EW_TOP - 10],
            [0, ROAD_EW_BOT + 10, ROAD_NS_LEFT - 10, H - ROAD_EW_BOT - 10],
            [ROAD_NS_RIGHT + 10, ROAD_EW_BOT + 10, W - ROAD_NS_RIGHT - 10, H - ROAD_EW_BOT - 10],
          ].map(([bx, by, bw, bh], qi) => (
            <g key={qi}>
              <rect x={bx} y={by} width={bw} height={bh} fill="#ccc5bd" />
              {/* 4 buildings per block */}
              {[
                [bx + bw * 0.06, by + bh * 0.06, bw * 0.40, bh * 0.40],
                [bx + bw * 0.54, by + bh * 0.06, bw * 0.40, bh * 0.40],
                [bx + bw * 0.06, by + bh * 0.54, bw * 0.40, bh * 0.40],
                [bx + bw * 0.54, by + bh * 0.54, bw * 0.40, bh * 0.40],
              ].map(([rx, ry, rw, rh], bi) =>
                rw > 12 && rh > 12 ? (
                  <g key={bi}>
                    <rect x={rx} y={ry} width={rw} height={rh}
                      fill={['#aec6e8', '#f5dfa0', '#b8ddb8', '#f0bfbf'][bi]}
                      stroke="#9e968e" strokeWidth={1} rx={2} />
                    {rw > 28 && rh > 28 && Array.from({ length: Math.floor(rh / 13) }).map((_, wi) =>
                      Array.from({ length: Math.floor(rw / 13) }).map((_, wj) => (
                        <rect key={`${wi}-${wj}`}
                          x={rx + 4 + wj * 13} y={ry + 4 + wi * 13}
                          width={7} height={8} rx={1}
                          fill="rgba(255,255,255,0.6)" stroke="rgba(0,0,0,0.07)" strokeWidth={0.5} />
                      ))
                    )}
                  </g>
                ) : null
              )}
            </g>
          ))}

          {/* ── KERB/PAVEMENT STRIPS ── */}
          <rect x={ROAD_NS_LEFT - 10} y={0} width={10} height={H} fill="#bab3aa" />
          <rect x={ROAD_NS_RIGHT} y={0} width={10} height={H} fill="#bab3aa" />
          {simState.simMode === 'intersection' && (
            <>
              <rect x={0} y={ROAD_EW_TOP - 10} width={W} height={10} fill="#bab3aa" />
              <rect x={0} y={ROAD_EW_BOT} width={W} height={10} fill="#bab3aa" />
            </>
          )}

          {/* ── BLACK ROADS ── */}
          <rect x={ROAD_NS_LEFT} y={0} width={ROAD_W} height={H} fill="#111111" />
          {simState.simMode === 'intersection' && (
            <rect x="0" y={ROAD_EW_TOP} width={W} height={ROAD_W} fill="#111111" />
          )}

          {/* ── LANE MARKINGS ── */}
          {/* NS center separator */}
          <line x1={CX - 2} y1={0} x2={CX - 2} y2={H} stroke="#e6c200" strokeWidth={1} opacity="0.6" />
          <line x1={CX + 2} y1={0} x2={CX + 2} y2={H} stroke="#e6c200" strokeWidth={1} opacity="0.6" />
          
          {/* NS Lane dividers */}
          {Array.from({ length: (simState.lanes || 4) - 1 }).map((_, li) => {
            const step = (ROAD_W / 2) / (simState.lanes || 4);
            const offset = (li + 1) * step;
            return (
              <g key={`nsl${li}`}>
                {Array.from({ length: 16 }).map((_, i) => (
                  <React.Fragment key={i}>
                    <rect x={CX + offset - 1} y={i * 56 + 6} width={2} height={28} fill="rgba(255,255,255,0.25)" />
                    <rect x={CX - offset - 1} y={i * 56 + 6} width={2} height={28} fill="rgba(255,255,255,0.25)" />
                  </React.Fragment>
                ))}
              </g>
            );
          })}

          {/* EW center separator */}
          {simState.simMode === 'intersection' && (
            <>
              <line x1={0} y1={CY - 2} x2={W} y2={CY - 2} stroke="#e6c200" strokeWidth={1} opacity="0.6" />
              <line x1={0} y1={CY + 2} x2={W} y2={CY + 2} stroke="#e6c200" strokeWidth={1} opacity="0.6" />

              {/* EW Lane dividers */}
              {Array.from({ length: (simState.lanes || 4) - 1 }).map((_, li) => {
                const step = (ROAD_W / 2) / (simState.lanes || 4);
                const offset = (li + 1) * step;
                return (
                  <g key={`ewl${li}`}>
                    {Array.from({ length: 16 }).map((_, i) => (
                      <React.Fragment key={i}>
                        <rect x={i * 56 + 6} y={CY + offset - 1} width={28} height={2} fill="rgba(255,255,255,0.25)" />
                        <rect x={i * 56 + 6} y={CY - offset - 1} width={28} height={2} fill="rgba(255,255,255,0.25)" />
                      </React.Fragment>
                    ))}
                  </g>
                );
              })}
            </>
          )}

          {/* Yellow edge kerb lines */}
          <line x1={ROAD_NS_LEFT} y1={0} x2={ROAD_NS_LEFT} y2={H} stroke="#e6c200" strokeWidth={2.5} />
          <line x1={ROAD_NS_RIGHT} y1={0} x2={ROAD_NS_RIGHT} y2={H} stroke="#e6c200" strokeWidth={2.5} />
          {simState.simMode === 'intersection' && (
            <>
              <line x1={0} y1={ROAD_EW_TOP} x2={W} y2={ROAD_EW_TOP} stroke="#e6c200" strokeWidth={2.5} />
              <line x1={0} y1={ROAD_EW_BOT} x2={W} y2={ROAD_EW_BOT} stroke="#e6c200" strokeWidth={2.5} />
            </>
          )}

          {/* ── INTERSECTION ── */}
          {simState.simMode === 'intersection' ? (
            <>
              <rect x={IX1} y={IY1} width={IX2 - IX1} height={IY2 - IY1} fill="#111111" />
              {/* Yellow hatch pattern */}
              {Array.from({ length: 10 }).map((_, i) => (
                <line key={`h1${i}`} x1={IX1 + i * 16} y1={IY1} x2={IX1} y2={IY1 + i * 16} stroke="rgba(230,194,0,0.18)" strokeWidth={1.5} />
              ))}
              {Array.from({ length: 10 }).map((_, i) => (
                <line key={`h2${i}`} x1={IX1 + i * 16} y1={IY2} x2={IX2} y2={IY1 + i * 16} stroke="rgba(230,194,0,0.18)" strokeWidth={1.5} />
              ))}
            </>
          ) : (
             <rect x={IX1} y={IY1} width={IX2 - IX1} height={IY2 - IY1} fill="#111111" />
          )}

          {/* ── CROSSWALKS ── */}
          {[0, 1, 2, 3, 4].map(i => <rect key={`cN${i}`} x={IX1 + 10 + i * 24} y={IY1 - 20} width={14} height={18} fill="rgba(255,255,255,0.2)" rx={1} />)}
          {[0, 1, 2, 3, 4].map(i => <rect key={`cS${i}`} x={IX1 + 10 + i * 24} y={IY2 + 2} width={14} height={18} fill="rgba(255,255,255,0.2)" rx={1} />)}
          {simState.simMode === 'intersection' && (
            <>
              {[0, 1, 2, 3, 4].map(i => <rect key={`cW${i}`} x={IX1 - 20} y={IY1 + 10 + i * 24} width={18} height={14} fill="rgba(255,255,255,0.2)" rx={1} />)}
              {[0, 1, 2, 3, 4].map(i => <rect key={`cE${i}`} x={IX2 + 2} y={IY1 + 10 + i * 24} width={18} height={14} fill="rgba(255,255,255,0.2)" rx={1} />)}
            </>
          )}

          {/* ── STOP LINES ── */}
          <line x1={ROAD_NS_LEFT} y1={STOP_POS.NS} x2={ROAD_NS_RIGHT} y2={STOP_POS.NS} stroke="white" strokeWidth={3} opacity="0.75" />
          <line x1={ROAD_NS_LEFT} y1={STOP_POS.SN} x2={ROAD_NS_RIGHT} y2={STOP_POS.SN} stroke="white" strokeWidth={3} opacity="0.75" />
          {simState.simMode === 'intersection' && (
            <>
              <line x1={STOP_POS.EW} y1={ROAD_EW_TOP} x2={STOP_POS.EW} y2={ROAD_EW_BOT} stroke="white" strokeWidth={3} opacity="0.75" />
              <line x1={STOP_POS.WE} y1={ROAD_EW_TOP} x2={STOP_POS.WE} y2={ROAD_EW_BOT} stroke="white" strokeWidth={3} opacity="0.75" />
            </>
          )}

          {/* ── TRAFFIC LIGHT POLES ── */}
          {simState.simMode === 'intersection' ? (
            <>
              <Pole x={IX1 - 28} y={IY1 - 8} green={ewGreen} />   {/* NW – controls E→ */}
              <Pole x={IX2 + 28} y={IY1 - 8} green={nsGreen} />   {/* NE – controls ↓S */}
              <Pole x={IX1 - 28} y={IY2 + 8} green={nsGreen} />   {/* SW – controls ↑N */}
              <Pole x={IX2 + 28} y={IY2 + 8} green={ewGreen} />   {/* SE – controls ←W */}
            </>
          ) : (
            <>
              <Pole x={IX2 + 28} y={IY1 - 8} green={nsGreen} />   {/* NE – controls ↓S */}
              <Pole x={IX1 - 28} y={IY2 + 8} green={nsGreen} />   {/* SW – controls ↑N */}
            </>
          )}

          {/* ── CARS ── */}
          <g filter="url(#carShadow)">
            {cars.map(c => <CarShape key={c.id} car={c} totalLanes={simState.lanes || 4} />)}
          </g>
        </svg>
      </div>
    </div>
  );
}
