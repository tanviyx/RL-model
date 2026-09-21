import { useEffect, useState, useMemo } from "react";
import API from "../api/axios";

/**
 * Simulation Visualizer
 * Upgraded to use SVG for high-end rendering and better visibility.
 */
export default function Simulation() {
  const [vehicles, setVehicles] = useState([]);
  const [signal, setSignal] = useState("NONE");
  const [reward, setReward] = useState(0);

  const WIDTH = 800;
  const HEIGHT = 800;

  // ===== FETCH LIVE DATA FROM SUMO ENGINE =====
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const res = await API.get("/traffic/live");
        setVehicles(res.data.vehicles || []);
        setSignal(res.data.signal || "NONE");
        setReward(res.data.reward || 0);
      } catch (err) {
        // console.error("Poll error", err);
      }
    }, 200); // 5 FPS for smooth updates

    return () => clearInterval(interval);
  }, []);

  // ===== COORDINATE MAPPING =====
  // SUMO coordinates vary depending on the network.
  // We use a responsive scaling logic to keep vehicles centered.
  const bounds = useMemo(() => {
    if (vehicles.length === 0) return { minX: -100, maxX: 100, minY: -100, maxY: 100 };
    
    const xs = vehicles.map(v => v.x);
    const ys = vehicles.map(v => v.y);
    
    return {
      minX: Math.min(...xs) - 50,
      maxX: Math.max(...xs) + 50,
      minY: Math.min(...ys) - 50,
      maxY: Math.max(...ys) + 50
    };
  }, [vehicles]);

  const scale = Math.min(
    WIDTH / (bounds.maxX - bounds.minX),
    HEIGHT / (bounds.maxY - bounds.minY)
  ) * 0.85;

  const mapX = (x) => (x - bounds.minX) * scale;
  const mapY = (y) => HEIGHT - (y - bounds.minY) * scale;

  return (
    <div className="flex flex-col items-center gap-4">
      
      {/* Simulation Container */}
      <div className="relative w-[800px] h-[800px] bg-[#0a0a0f] rounded-3xl border border-white/5 shadow-2xl overflow-hidden group">
        
        <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="w-full h-full">
          {/* Gradients & Filters */}
          <defs>
            <filter id="car-glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
            
            <linearGradient id="road-grad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#11111a" />
              <stop offset="100%" stopColor="#08080c" />
            </linearGradient>

            <linearGradient id="car-grad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#00f2fe" />
              <stop offset="100%" stopColor="#4facfe" />
            </linearGradient>

            <filter id="neon-glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="8" result="coloredBlur"/>
              <feMerge>
                <feMergeNode in="coloredBlur"/>
                <feMergeNode in="SourceGraphic"/>
              </feMerge>
            </filter>
          </defs>

          {/* Road Background */}
          <rect width={WIDTH} height={HEIGHT} fill="url(#road-grad)" />

          {/* Grid lines for depth */}
          <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(255,255,255,0.02)" strokeWidth="1"/>
          </pattern>
          <rect width={WIDTH} height={HEIGHT} fill="url(#grid)" />

          {/* Dynamic Road Layout (Centers automatically) */}
          <g opacity="0.1">
            <rect x={WIDTH/2 - 60} y="0" width="120" height={HEIGHT} fill="#1a1a24" />
            <rect x="0" y={HEIGHT/2 - 60} width={WIDTH} height="120" fill="#1a1a24" />
          </g>

          {/* Lane Markers */}
          <line x1={WIDTH/2} y1="0" x2={WIDTH/2} y2={HEIGHT} stroke="rgba(255,255,255,0.1)" strokeWidth="2" strokeDasharray="15,15" />
          <line x1="0" y1={HEIGHT/2} x2={WIDTH} y2={HEIGHT/2} stroke="rgba(255,255,255,0.1)" strokeWidth="2" strokeDasharray="15,15" />

          {/* Traffic Lights Indicators */}
          <g>
             {/* NS Lights */}
             <circle 
               cx={WIDTH/2 + 80} cy={HEIGHT/2 - 80} r="12" 
               fill={signal === "NS_GREEN" ? "#00e676" : "#ff3d00"} 
               filter={signal === "NS_GREEN" ? "url(#neon-glow)" : ""}
               className="transition-all duration-500"
             />
             <circle 
               cx={WIDTH/2 - 80} cy={HEIGHT/2 + 80} r="12" 
               fill={signal === "NS_GREEN" ? "#00e676" : "#ff3d00"} 
               filter={signal === "NS_GREEN" ? "url(#neon-glow)" : ""}
               className="transition-all duration-500"
             />

             {/* EW Lights */}
             <circle 
               cx={WIDTH/2 - 80} cy={HEIGHT/2 - 80} r="12" 
               fill={signal === "EW_GREEN" ? "#00e676" : "#ff3d00"} 
               filter={signal === "EW_GREEN" ? "url(#neon-glow)" : ""}
               className="transition-all duration-500"
             />
             <circle 
               cx={WIDTH/2 + 80} cy={HEIGHT/2 + 80} r="12" 
               fill={signal === "EW_GREEN" ? "#00e676" : "#ff3d00"} 
               filter={signal === "EW_GREEN" ? "url(#neon-glow)" : ""}
               className="transition-all duration-500"
             />
          </g>

          {/* Vehicles (Drawn from SUMO Positions) */}
          {vehicles.map((v) => (
            <g 
              key={v.id} 
              style={{ transform: `translate(${mapX(v.x)}px, ${mapY(v.y)}px)`, transition: "all 0.25s linear" }}
            >
              {/* Car Body */}
              <rect 
                x="-12" y="-18" width="24" height="36" rx="4"
                fill="url(#car-grad)"
                filter="url(#car-glow)"
              />
              {/* Windshield */}
              <rect x="-8" y="-12" width="16" height="8" rx="1" fill="rgba(0,0,0,0.3)" />
              {/* Headlights (Subtle glow) */}
              <circle cx="-7" cy="-16" r="2" fill="white" opacity="0.8" />
              <circle cx="7" cy="-16" r="2" fill="white" opacity="0.8" />
            </g>
          ))}
        </svg>

        {/* HUD OVERLAY */}
        <div className="absolute top-6 left-6 flex flex-col gap-2">
          <div className="px-4 py-2 bg-black/40 backdrop-blur-md border border-white/10 rounded-full flex items-center gap-3">
            <div className={`w-2 h-2 rounded-full animate-pulse ${signal.includes("GREEN") ? "bg-green-400" : "bg-red-400"}`} />
            <span className="text-xs font-bold tracking-widest text-white/80 uppercase">{signal}</span>
          </div>
          
          <div className="px-4 py-2 bg-black/40 backdrop-blur-md border border-white/10 rounded-full flex items-center gap-3">
            <span className="text-[10px] font-bold tracking-widest text-white/40 uppercase">REWARD</span>
            <span className={`text-xs font-bold ${reward >= 0 ? "text-green-400" : "text-amber-400"}`}>{reward.toFixed(1)}</span>
          </div>
        </div>

        <div className="absolute bottom-6 right-6">
           <div className="px-5 py-3 bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl">
              <div className="text-[10px] font-bold text-white/30 tracking-tighter uppercase mb-1">Live Engine Feed</div>
              <div className="flex items-end gap-1">
                 <span className="text-2xl font-black text-white leading-none">{vehicles.length}</span>
                 <span className="text-[10px] font-bold text-white/50 mb-1">VEHICLES</span>
              </div>
           </div>
        </div>

        {/* Scanning Line Effect */}
        <div className="absolute inset-0 pointer-events-none bg-gradient-to-b from-transparent via-cyan-500/5 to-transparent h-1/4 w-full animate-scanline" />
      </div>

      <style jsx>{`
        @keyframes scanline {
          0% { transform: translateY(-100%); }
          100% { transform: translateY(400%); }
        }
        .animate-scanline {
          animation: scanline 8s linear infinite;
        }
      `}</style>
    </div>
  );
}