import Simulation from "../components/Simulation";
import { useEffect, useState } from "react";
import API from "../api/axios";

export default function Dashboard() {
  const [live, setLive] = useState({});
  const [comparison, setComparison] = useState({});

  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const res = await API.get("/traffic/live");
        setLive(res.data);

        const comp = await API.get("/traffic/compare");
        setComparison(comp.data);

      } catch {}
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-[#050508] text-white p-8 font-['Outfit']">

      {/* HEADER SECTION */}
      <header className="mb-10 flex justify-between items-center">
        <div>
          <h1 className="text-4xl font-black tracking-tighter bg-gradient-to-r from-white to-gray-500 bg-clip-text text-fill-transparent">
            TRAFFIC AI <span className="text-cyan-400">COMMAND CENTER</span>
          </h1>
          <p className="text-gray-500 font-semibold tracking-widest text-[10px] uppercase mt-1">
            Real-time Reinforcement Learning Simulation Engine
          </p>
        </div>
        
        <div className="flex gap-4">
          <div className="px-4 py-2 bg-white/5 border border-white/10 rounded-xl flex flex-col items-end">
            <span className="text-[10px] text-gray-500 font-bold uppercase">System Status</span>
            <span className="text-xs text-green-400 font-bold flex items-center gap-2">
              <div className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
              LIVE FEED ACTIVE
            </span>
          </div>
        </div>
      </header>

      <div className="flex gap-8">

        {/* LEFT PANEL: METRICS & ANALYTICS */}
        <div className="w-80 flex flex-col gap-4 shrink-0">
          
          {/* Main Stats */}
          <div className="grid grid-cols-1 gap-4">
            <MetricCard label="Signal Phase" value={live.signal || "N/A"} color="text-cyan-400" />
            <MetricCard label="Efficiency Reward" value={live.reward?.toFixed(1) || 0} color={live.reward >= 0 ? "text-green-400" : "text-amber-400"} />
            <MetricCard label="Active Vehicles" value={live.vehicles?.length || 0} color="text-white" />
          </div>

          {/* AI Comparison */}
          <div className="bg-white/5 border border-white/10 p-6 rounded-3xl mt-4">
            <h3 className="text-[10px] font-bold text-gray-500 tracking-widest uppercase mb-6">Optimization Engine</h3>
            
            <div className="space-y-6">
              <div className="flex justify-between items-end">
                <div>
                  <div className="text-[10px] text-cyan-400 font-bold uppercase mb-1">RL Agent</div>
                  <div className="text-2xl font-black">{comparison.RL_avg_queue || 0}</div>
                </div>
                <div className="text-[10px] text-gray-500 font-bold mb-1">AVG QUEUE</div>
              </div>

              <div className="flex justify-between items-end">
                <div>
                  <div className="text-[10px] text-gray-400 font-bold uppercase mb-1">Fixed Timer</div>
                  <div className="text-2xl font-black text-gray-600">{comparison.FIXED_avg_queue || 0}</div>
                </div>
                <div className="text-[10px] text-gray-500 font-bold mb-1">AVG QUEUE</div>
              </div>

              <div className="pt-6 border-t border-white/5">
                <div className="text-[10px] text-gray-500 font-bold uppercase mb-2">Throughput Improvement</div>
                <div className="text-4xl font-black text-green-400 tracking-tighter">
                  {comparison.improvement || "0%"}
                </div>
              </div>
            </div>
          </div>

        </div>

        {/* CENTER SECTION: SIMULATION VISUALIZER */}
        <div className="flex-1 flex justify-center items-start">
          <Simulation />
        </div>

      </div>
    </div>
  );
}

function MetricCard({ label, value, color }) {
  return (
    <div className="bg-white/5 border border-white/10 p-6 rounded-3xl transition-all hover:bg-white/[0.07]">
      <div className="text-[10px] font-bold text-gray-500 tracking-widest uppercase mb-2">{label}</div>
      <div className={`text-3xl font-black ${color} tracking-tight`}>{value}</div>
    </div>
  );
}