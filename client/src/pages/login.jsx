import { useState, useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import API from "../api/axios";

const flows = [81, 84, 79, 88, 83, 77, 90];
const incs = [2, 3, 2, 1, 2, 4, 2];
const congs = ["LOW", "LOW", "MODERATE", "LOW", "LOW", "HIGH", "LOW"];
const congColors = ["#00c896", "#00c896", "#ffc300", "#00c896", "#00c896", "#ff3b3b", "#00c896"];

const Login = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [tick, setTick] = useState(0);
  const [mode, setMode] = useState(searchParams.get("mode") === "signup" ? "signup" : "login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [googleNote, setGoogleNote] = useState("");
  const [isSigningIn, setIsSigningIn] = useState(false);
  const googleButtonRef = useRef(null);
  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

  useEffect(() => {
    const id = setInterval(() => setTick((t) => (t + 1) % flows.length), 3000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!googleClientId) {
      setGoogleNote("Google sign-in is not configured (VITE_GOOGLE_CLIENT_ID is missing).");
      return undefined;
    }

    const initializeGoogleButton = () => {
      if (!window.google?.accounts?.id || !googleButtonRef.current) return;

      window.google.accounts.id.initialize({
        client_id: googleClientId,
        callback: async ({ credential }) => {
          setIsSigningIn(true);
          setAuthError("");

          try {
            await API.post("/auth/google", { credential });
            navigate("/setup-automation");
          } catch (error) {
            setAuthError(error.response?.data?.message || "Google sign-in failed. Please try again.");
            setIsSigningIn(false);
          }
        },
      });
      window.google.accounts.id.renderButton(googleButtonRef.current, {
        theme: "filled_black",
        size: "large",
        text: "continue_with",
        shape: "rectangular",
        width: 320,
      });
    };

    let script = document.getElementById("google-identity-script");
    const handleScriptError = () => {
      setGoogleNote("Google sign-in could not be loaded. Check your connection and refresh.");
    };

    if (window.google?.accounts?.id) {
      initializeGoogleButton();
    } else {
      if (!script) {
        script = document.createElement("script");
        script.id = "google-identity-script";
        script.src = "https://accounts.google.com/gsi/client";
        script.async = true;
        script.defer = true;
        document.head.appendChild(script);
      }

      script.addEventListener("load", initializeGoogleButton);
      script.addEventListener("error", handleScriptError);
    }

    return () => {
      script?.removeEventListener("load", initializeGoogleButton);
      script?.removeEventListener("error", handleScriptError);
    };
  }, [googleClientId, navigate]);

  const switchMode = (next) => {
    setMode(next);
    setAuthError("");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setAuthError("");

    const cleanEmail = email.trim().toLowerCase();
    if (mode === "signup" && name.trim().length < 2) {
      return setAuthError("Please enter your name.");
    }
    if (!/^\S+@\S+\.\S+$/.test(cleanEmail)) {
      return setAuthError("Please enter a valid email address.");
    }
    if (mode === "signup" && password.length < 8) {
      return setAuthError("Password must be at least 8 characters.");
    }
    if (!password) {
      return setAuthError("Please enter your password.");
    }

    setIsSigningIn(true);
    try {
      if (mode === "signup") {
        await API.post("/auth/register", { name: name.trim(), email: cleanEmail, password });
      } else {
        await API.post("/auth/login", { email: cleanEmail, password });
      }
      navigate("/setup-automation");
    } catch (error) {
      setAuthError(error.response?.data?.message || "Something went wrong. Please try again.");
      setIsSigningIn(false);
    }
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@400;500;600;700&family=Share+Tech+Mono&display=swap');

        .tr-root * { box-sizing: border-box; margin: 0; padding: 0; }

        .tr-root {
          min-height: 100vh;
          background: #050810;
          font-family: 'Rajdhani', sans-serif;
          display: flex;
          align-items: stretch;
          overflow: hidden;
          position: relative;
        }

        /* ── LEFT PANEL ── */
        .tr-city {
          width: 52%;
          position: relative;
          background: #050810;
          overflow: hidden;
        }
        .tr-grid {
          position: absolute;
          inset: 0;
          background-image:
            linear-gradient(rgba(0,200,150,0.06) 1px, transparent 1px),
            linear-gradient(90deg, rgba(0,200,150,0.06) 1px, transparent 1px);
          background-size: 40px 40px;
          animation: trGridMove 8s linear infinite;
        }
        @keyframes trGridMove {
          from { background-position: 0 0; }
          to   { background-position: 40px 40px; }
        }
        .tr-city::after {
          content: '';
          position: absolute;
          inset: 0;
          background: radial-gradient(ellipse at 30% 50%, transparent 20%, #050810 80%);
          pointer-events: none;
          z-index: 5;
        }
        .tr-scan {
          position: absolute;
          left: 0; right: 0;
          height: 2px;
          background: linear-gradient(90deg, transparent, rgba(0,200,150,0.4), transparent);
          z-index: 6;
          animation: trScan 4s linear infinite;
        }
        @keyframes trScan {
          from { top: -2px; }
          to   { top: 100%; }
        }
        .tr-corner-tag {
          position: absolute;
          top: 18px; left: 18px;
          z-index: 10;
          font-family: 'Share Tech Mono', monospace;
          font-size: 11px;
          color: rgba(0,200,150,0.6);
          letter-spacing: 0.12em;
          line-height: 1.8;
        }
        .tr-map-svg {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          z-index: 2;
        }

        /* car animations */
        .tr-car-h  { animation: trDriveH  4s linear infinite; }
        .tr-car-h2 { animation: trDriveH  6.5s linear infinite 2s; }
        .tr-car-v  { animation: trDriveV  5s linear infinite 1s; }
        .tr-car-v2 { animation: trDriveV  7s linear infinite 3.5s; }
        @keyframes trDriveH {
          from { transform: translateX(-80px); }
          to   { transform: translateX(420px); }
        }
        @keyframes trDriveV {
          from { transform: translateY(-80px); }
          to   { transform: translateY(110vh); }
        }

        /* pulse dots */
        .tr-pdot { animation: trPulse 2s ease-in-out infinite; }
        .tr-pdot:nth-child(2) { animation-delay: 0.5s; }
        .tr-pdot:nth-child(3) { animation-delay: 1s; }
        .tr-pdot:nth-child(4) { animation-delay: 1.5s; }
        @keyframes trPulse {
          0%,100% { r: 4; opacity: 0.6; }
          50%      { r: 7; opacity: 1; }
        }

        /* signal cycle */
        .tr-sig-g { animation: trSig 6s linear infinite; }
        .tr-sig-r { animation: trSig 6s linear infinite 3s; }
        @keyframes trSig {
          0%,49%   { opacity: 1; }
          50%,100% { opacity: 0.1; }
        }

        /* ── DIVIDER ── */
        .tr-divider {
          width: 1px;
          background: linear-gradient(to bottom,
            transparent,
            rgba(0,200,150,0.3),
            rgba(0,200,150,0.5),
            rgba(0,200,150,0.3),
            transparent);
          flex-shrink: 0;
          position: relative;
          z-index: 10;
        }

        /* ── RIGHT PANEL ── */
        .tr-form-panel {
          flex: 1;
          display: flex;
          flex-direction: column;
          justify-content: center;
          padding: 40px 36px;
          background: #050810;
          position: relative;
          z-index: 10;
        }
        .tr-corner-br {
          position: absolute; bottom: 0; right: 0;
          width: 60px; height: 60px;
          border-bottom: 1px solid rgba(0,200,150,0.2);
          border-right:  1px solid rgba(0,200,150,0.2);
          pointer-events: none;
        }
        .tr-corner-tl {
          position: absolute; top: 0; left: 0;
          width: 40px; height: 40px;
          border-top:  1px solid rgba(0,200,150,0.2);
          border-left: 1px solid rgba(0,200,150,0.2);
          pointer-events: none;
        }

        /* traffic light accent */
        .tr-tl-accent {
          position: absolute; right: 16px; top: 50%;
          transform: translateY(-50%);
          display: flex; flex-direction: column;
          gap: 6px; align-items: center;
        }
        .tr-tl-body {
          width: 14px;
          background: #0a0f1a;
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 7px;
          padding: 5px 2px;
          display: flex; flex-direction: column;
          align-items: center; gap: 5px;
        }
        .tr-tl-light { width: 8px; height: 8px; border-radius: 50%; }
        .tr-tl-r { background: #ff3b3b; animation: trTl 6s step-start infinite; }
        .tr-tl-y { background: #ffc300; opacity: 0.15; }
        .tr-tl-g { background: #00c896; opacity: 0.15; animation: trTl 6s step-start infinite 3s; }
        @keyframes trTl {
          0%,49%   { opacity: 1; }
          50%,100% { opacity: 0.15; }
        }

        /* status bar */
        .tr-status-bar {
          display: flex; align-items: center; gap: 8px;
          margin-bottom: 36px;
          padding-bottom: 16px;
          border-bottom: 1px solid rgba(0,200,150,0.1);
        }
        .tr-status-dot {
          width: 6px; height: 6px;
          border-radius: 50%; background: #00c896;
          animation: trBlink 1.4s ease-in-out infinite;
        }
        @keyframes trBlink {
          0%,100% { opacity: 1; }
          50%     { opacity: 0.2; }
        }
        .tr-status-text {
          font-family: 'Share Tech Mono', monospace;
          font-size: 10px;
          color: rgba(0,200,150,0.7);
          letter-spacing: 0.2em;
        }

        /* title */
        .tr-title {
          font-size: 28px; font-weight: 700;
          color: #e8f5f0;
          letter-spacing: 0.04em; line-height: 1.15;
          margin-bottom: 6px;
        }
        .tr-subtitle {
          font-size: 13px;
          color: rgba(255,255,255,0.3);
          letter-spacing: 0.15em;
          font-family: 'Share Tech Mono', monospace;
          margin-bottom: 32px;
        }

        /* data chips */
        .tr-data-row { display: flex; gap: 12px; margin-bottom: 20px; }
        .tr-chip {
          flex: 1;
          background: rgba(0,200,150,0.04);
          border: 1px solid rgba(0,200,150,0.1);
          border-radius: 3px;
          padding: 8px 10px;
        }
        .tr-chip-label {
          font-family: 'Share Tech Mono', monospace;
          font-size: 9px; color: rgba(0,200,150,0.45);
          letter-spacing: 0.15em; display: block; margin-bottom: 2px;
        }
        .tr-chip-val {
          font-family: 'Share Tech Mono', monospace;
          font-size: 14px; font-weight: 500;
          color: rgba(255,255,255,0.65); display: block;
          transition: color 0.4s;
        }

        .tr-google-login {
          display: flex;
          min-height: 48px;
          justify-content: center;
          margin-top: 20px;
          opacity: ${isSigningIn ? 0.55 : 1};
          pointer-events: ${isSigningIn ? "none" : "auto"};
        }
        .tr-auth-error {
          min-height: 18px;
          margin-top: 12px;
          color: #ff8c8c;
          font: 11px 'Share Tech Mono', monospace;
          letter-spacing: 0.04em;
          text-align: center;
        }
        .tr-signin-note {
          margin-top: 16px;
          color: rgba(255,255,255,0.3);
          font: 10px 'Share Tech Mono', monospace;
          letter-spacing: 0.1em;
          text-align: center;
        }

        /* ── AUTH FORM ── */
        .tr-tabs {
          display: flex;
          margin-bottom: 20px;
          border-bottom: 1px solid rgba(0,200,150,0.15);
        }
        .tr-tab {
          flex: 1;
          padding: 10px 0;
          background: none;
          border: none;
          border-bottom: 2px solid transparent;
          margin-bottom: -1px;
          color: rgba(255,255,255,0.35);
          font: 600 13px 'Rajdhani', sans-serif;
          letter-spacing: 0.2em;
          cursor: pointer;
          transition: color 0.2s, border-color 0.2s;
        }
        .tr-tab:hover { color: rgba(255,255,255,0.65); }
        .tr-tab.active { color: #00c896; border-bottom-color: #00c896; }

        .tr-form { display: flex; flex-direction: column; gap: 14px; }
        .tr-field { display: flex; flex-direction: column; gap: 5px; }
        .tr-label {
          font: 9px 'Share Tech Mono', monospace;
          color: rgba(0,200,150,0.5);
          letter-spacing: 0.15em;
        }
        .tr-input {
          width: 100%;
          background: rgba(0,200,150,0.04);
          border: 1px solid rgba(0,200,150,0.15);
          border-radius: 3px;
          padding: 11px 12px;
          color: #e8f5f0;
          font: 500 15px 'Rajdhani', sans-serif;
          letter-spacing: 0.03em;
          outline: none;
          transition: border-color 0.2s, background 0.2s;
        }
        .tr-input::placeholder { color: rgba(255,255,255,0.2); }
        .tr-input:focus { border-color: #00c896; background: rgba(0,200,150,0.08); }
        .tr-submit {
          margin-top: 4px;
          padding: 12px;
          background: #00c896;
          border: none;
          border-radius: 3px;
          color: #04110d;
          font: 700 14px 'Rajdhani', sans-serif;
          letter-spacing: 0.2em;
          cursor: pointer;
          transition: filter 0.2s, opacity 0.2s;
        }
        .tr-submit:hover:not(:disabled) { filter: brightness(1.12); }
        .tr-submit:disabled { opacity: 0.5; cursor: not-allowed; }
        .tr-or {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-top: 18px;
          color: rgba(255,255,255,0.25);
          font: 10px 'Share Tech Mono', monospace;
          letter-spacing: 0.2em;
        }
        .tr-or::before, .tr-or::after {
          content: '';
          flex: 1;
          height: 1px;
          background: rgba(0,200,150,0.15);
        }

        /* responsive */
        @media (max-width: 640px) {
          .tr-city { display: none; }
          .tr-divider { display: none; }
          .tr-form-panel { padding: 32px 24px; }
        }
      `}</style>

      <div className="tr-root">

        {/* ── LEFT: city map ── */}
        <div className="tr-city">
          <div className="tr-grid" />
          <div className="tr-scan" />
          <div className="tr-corner-tag">
            SECTOR 7-C GRID<br />
            NODES: 142 ACTIVE<br />
            UPTIME: 99.8%
          </div>

          <svg
            className="tr-map-svg"
            viewBox="0 0 370 600"
            preserveAspectRatio="xMidYMid slice"
            xmlns="http://www.w3.org/2000/svg"
          >
            <defs>
              <filter id="trGlow">
                <feGaussianBlur stdDeviation="2.5" result="blur" />
                <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
            </defs>

            {/* Buildings */}
            {[
              [20,20,80,70],[130,20,110,70],[270,20,90,70],
              [20,140,80,100],[130,140,110,100],[270,140,90,100],
              [20,300,80,90],[130,300,110,90],[270,300,90,90],
              [20,450,80,130],[130,450,110,130],[270,450,90,130],
            ].map(([x,y,w,h],i) => (
              <rect key={i} x={x} y={y} width={w} height={h} rx="2"
                fill="rgba(0,200,150,0.04)" stroke="rgba(0,200,150,0.12)" strokeWidth="0.5"/>
            ))}

            {/* Window dots */}
            {[[50,45],[65,45],[50,58],[65,58],[160,40],[175,40],[190,40],[160,55],[175,55],[190,55]].map(([cx,cy],i) => (
              <circle key={i} cx={cx} cy={cy} r="2" fill={`rgba(0,200,150,${0.15 + (i%3)*0.07})`}/>
            ))}

            {/* Horizontal roads */}
            {[[100,140],[250,300],[400,450]].map(([y1,y2],i) => (
              <g key={i}>
                <rect x="0" y={y1} width="370" height={y2-y1} fill="rgba(255,255,255,0.015)"/>
                <line x1="0" y1={y1} x2="370" y2={y1} stroke="rgba(0,200,150,0.25)" strokeWidth="1"/>
                <line x1="0" y1={y2} x2="370" y2={y2} stroke="rgba(0,200,150,0.25)" strokeWidth="1"/>
                <line x1="20"  y1={(y1+y2)/2} x2="100" y2={(y1+y2)/2} stroke="rgba(255,255,255,0.08)" strokeWidth="1" strokeDasharray="8,6"/>
                <line x1="130" y1={(y1+y2)/2} x2="240" y2={(y1+y2)/2} stroke="rgba(255,255,255,0.08)" strokeWidth="1" strokeDasharray="8,6"/>
                <line x1="270" y1={(y1+y2)/2} x2="370" y2={(y1+y2)/2} stroke="rgba(255,255,255,0.08)" strokeWidth="1" strokeDasharray="8,6"/>
              </g>
            ))}

            {/* Vertical roads */}
            {[[100,130],[240,270]].map(([x1,x2],i) => (
              <g key={i}>
                <rect x={x1} y="0" width={x2-x1} height="600" fill="rgba(255,255,255,0.015)"/>
                <line x1={x1} y1="0" x2={x1} y2="600" stroke="rgba(0,200,150,0.25)" strokeWidth="1"/>
                <line x1={x2} y1="0" x2={x2} y2="600" stroke="rgba(0,200,150,0.25)" strokeWidth="1"/>
                {[90,240,390,600].map((seg,j,arr) => (
                  <line key={j} x1={(x1+x2)/2} y1={j===0?0:arr[j-1]} x2={(x1+x2)/2} y2={seg}
                    stroke="rgba(255,255,255,0.08)" strokeWidth="1" strokeDasharray="8,6"/>
                ))}
              </g>
            ))}

            {/* Intersection pulse dots */}
            {[[115,120,"#00c896"],[255,120,"#00c896"],[115,275,"#ff3b3b"],[255,275,"#00c896"],[115,425,"#00c896"],[255,425,"#ffc300"]].map(([cx,cy,fill],i) => (
              <circle key={i} cx={cx} cy={cy} r="4" fill={fill} opacity="0.7" className="tr-pdot"/>
            ))}

            {/* Traffic light signals */}
            <rect x="104" y="110" width="5" height="9" rx="1" fill="#111" stroke="rgba(0,200,150,0.3)" strokeWidth="0.5"/>
            <circle cx="106.5" cy="112" r="1.2" fill="#ff3b3b" className="tr-sig-r"/>
            <circle cx="106.5" cy="116.5" r="1.2" fill="#00c896" className="tr-sig-g"/>

            <rect x="258" y="265" width="5" height="9" rx="1" fill="#111" stroke="rgba(0,200,150,0.3)" strokeWidth="0.5"/>
            <circle cx="260.5" cy="267" r="1.2" fill="#ff3b3b" className="tr-sig-r"/>
            <circle cx="260.5" cy="271.5" r="1.2" fill="#00c896" className="tr-sig-g"/>

            {/* Animated cars */}
            <g className="tr-car-h" filter="url(#trGlow)">
              <rect x="5" y="107" width="14" height="7" rx="1.5" fill="#00c896" opacity="0.9"/>
              <circle cx="7" cy="114.5" r="1.5" fill="#333"/>
              <circle cx="17" cy="114.5" r="1.5" fill="#333"/>
              <rect x="19" y="109" width="3" height="2" rx="0.5" fill="#ffcc44" opacity="0.9"/>
            </g>
            <g className="tr-car-h2" filter="url(#trGlow)">
              <rect x="5" y="128" width="12" height="7" rx="1.5" fill="#ff3b3b" opacity="0.85"/>
              <circle cx="7" cy="135.5" r="1.5" fill="#333"/>
              <circle cx="15" cy="135.5" r="1.5" fill="#333"/>
              <rect x="17" y="130" width="3" height="2" rx="0.5" fill="#ffcc44" opacity="0.9"/>
            </g>
            <g className="tr-car-v" filter="url(#trGlow)">
              <rect x="107" y="5" width="7" height="14" rx="1.5" fill="#4dc3ff" opacity="0.85"/>
              <circle cx="107.5" cy="19.5" r="1.5" fill="#333"/>
              <circle cx="113.5" cy="19.5" r="1.5" fill="#333"/>
              <rect x="109" y="3" width="2" height="3" rx="0.5" fill="#ffcc44" opacity="0.9"/>
            </g>
            <g className="tr-car-v2" filter="url(#trGlow)">
              <rect x="120" y="5" width="7" height="12" rx="1.5" fill="#ffc300" opacity="0.85"/>
              <circle cx="120.5" cy="17.5" r="1.5" fill="#333"/>
              <circle cx="126.5" cy="17.5" r="1.5" fill="#333"/>
            </g>
          </svg>
        </div>

        {/* ── DIVIDER ── */}
        <div className="tr-divider" />

        {/* ── RIGHT: form panel ── */}
        <div className="tr-form-panel">
          <div className="tr-corner-tl" />
          <div className="tr-corner-br" />

          {/* Traffic light accent */}
          <div className="tr-tl-accent">
            <div className="tr-tl-body">
              <div className="tr-tl-light tr-tl-r" />
              <div className="tr-tl-light tr-tl-y" />
              <div className="tr-tl-light tr-tl-g" />
            </div>
          </div>

          {/* Status bar */}
          <div className="tr-status-bar">
            <div className="tr-status-dot" />
            <span className="tr-status-text">GRID ONLINE &nbsp;|&nbsp; SECTOR 7-C &nbsp;|&nbsp; 142 SIGNALS ACTIVE</span>
          </div>

          {/* Title */}
          <div className="tr-title">Traffic Control<br />Operations</div>
          <div className="tr-subtitle">SMART CITY COMMAND INTERFACE</div>

          {/* Live data chips */}
          <div className="tr-data-row">
            <div className="tr-chip">
              <span className="tr-chip-label">FLOW INDEX</span>
              <span className="tr-chip-val" style={{ color: "#00c896" }}>{flows[tick]}%</span>
            </div>
            <div className="tr-chip">
              <span className="tr-chip-label">INCIDENTS</span>
              <span className="tr-chip-val">{incs[tick]}</span>
            </div>
            <div className="tr-chip">
              <span className="tr-chip-label">CONGESTION</span>
              <span className="tr-chip-val" style={{ color: congColors[tick], transition: "color 0.4s" }}>
                {congs[tick]}
              </span>
            </div>
          </div>

          {/* Log in / Sign up tabs */}
          <div className="tr-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={mode === "login"}
              className={`tr-tab ${mode === "login" ? "active" : ""}`}
              onClick={() => switchMode("login")}
            >
              LOG IN
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === "signup"}
              className={`tr-tab ${mode === "signup" ? "active" : ""}`}
              onClick={() => switchMode("signup")}
            >
              SIGN UP
            </button>
          </div>

          <form className="tr-form" onSubmit={handleSubmit} noValidate>
            {mode === "signup" && (
              <label className="tr-field">
                <span className="tr-label">NAME</span>
                <input
                  className="tr-input"
                  type="text"
                  autoComplete="name"
                  placeholder="Your name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
            )}
            <label className="tr-field">
              <span className="tr-label">EMAIL</span>
              <input
                className="tr-input"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <label className="tr-field">
              <span className="tr-label">PASSWORD</span>
              <input
                className="tr-input"
                type="password"
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                placeholder={mode === "signup" ? "At least 8 characters" : "Your password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            <button className="tr-submit" type="submit" disabled={isSigningIn}>
              {isSigningIn ? "PLEASE WAIT..." : mode === "signup" ? "CREATE ACCOUNT" : "LOG IN"}
            </button>
          </form>

          <div className="tr-or">OR</div>
          <div
            className="tr-google-login"
            ref={googleButtonRef}
            aria-label="Continue with Google"
          />
          {googleNote && <div className="tr-signin-note">{googleNote}</div>}
          <div className="tr-auth-error" role="alert" aria-live="polite">
            {authError}
          </div>
        </div>
      </div>
    </>
  );
};

export default Login;