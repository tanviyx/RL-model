import { useState } from "react";
import { useNavigate } from "react-router-dom";
import './TrafficSimulation.css';

const SetupAutomation = () => {
  const navigate = useNavigate();

  const [intersection, setIntersection] = useState(1);
  const [lanes, setLanes] = useState(4);
  const [pedestrians, setPedestrians] = useState([true, true, true, false]);
  const [cycleLength, setCycleLength] = useState(100);
  const [redTime, setRedTime] = useState(20);
  const [yellowTime, setYellowTime] = useState(3);
  const [greenTime, setGreenTime] = useState(87);
  const [showAdditional, setShowAdditional] = useState(false);

  const [simMode, setSimMode] = useState('intersection'); // 'single' or 'intersection'

  const handleNext = () => {
    const config = {
      intersection,
      lanes,
      simMode,
    };
    localStorage.setItem("automationConfig", JSON.stringify(config));
    navigate("/simulation");
  };

  return (
    <div className="cyber-container" style={{ flexDirection: 'column', overflow: 'auto', height: '100vh' }}>
      
      {/* Top Header */}
      <div style={{ 
        padding: '2rem 2.5rem 1rem', 
        borderBottom: '1px solid rgba(255,255,255,0.05)',
        background: 'linear-gradient(180deg, #0a0a0f 0%, #050508 100%)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h1 className="cyber-title" style={{ fontSize: '2rem' }}>AUTOMATION SETTINGS</h1>
            <p className="cyber-subtitle">Select Scenario & Configure Parameters</p>
          </div>
          <button
            onClick={() => navigate(-1)}
            style={{
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.1)',
              padding: '8px 20px',
              borderRadius: '50px',
              color: '#a0a0b0',
              cursor: 'pointer',
              fontFamily: 'inherit',
              fontWeight: 600,
              fontSize: '0.8rem',
              letterSpacing: '1px',
            }}
          >
            ← BACK
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div style={{ 
        display: 'flex', 
        flex: 1, 
        overflow: 'auto',
        background: 'radial-gradient(circle at center, #111116 0%, #050505 100%)'
      }}>
        
        {/* Left Config Panel */}
        <div style={{ 
          flex: '0 0 480px', 
          padding: '2rem 2.5rem',
          borderRight: '1px solid rgba(255,255,255,0.05)',
          overflowY: 'auto'
        }}>
          
          {/* Scenario Selection */}
          <div className="glass-panel" style={{ marginBottom: '1.5rem' }}>
            <h3 className="panel-title">SELECT SCENARIO</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div 
                onClick={() => setSimMode('single')}
                style={{
                  padding: '1rem',
                  borderRadius: '12px',
                  background: simMode === 'single' ? 'rgba(0,242,254,0.1)' : 'rgba(255,255,255,0.02)',
                  border: `1px solid ${simMode === 'single' ? '#00f2fe' : 'rgba(255,255,255,0.1)'}`,
                  cursor: 'pointer',
                  textAlign: 'center',
                  transition: 'all 0.3s'
                }}
              >
                <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>↕</div>
                <div style={{ fontSize: '0.7rem', fontWeight: 700, color: simMode === 'single' ? '#00f2fe' : '#8A92A6' }}>SINGLE ROAD</div>
              </div>
              <div 
                onClick={() => setSimMode('intersection')}
                style={{
                  padding: '1rem',
                  borderRadius: '12px',
                  background: simMode === 'intersection' ? 'rgba(0,242,254,0.1)' : 'rgba(255,255,255,0.02)',
                  border: `1px solid ${simMode === 'intersection' ? '#00f2fe' : 'rgba(255,255,255,0.1)'}`,
                  cursor: 'pointer',
                  textAlign: 'center',
                  transition: 'all 0.3s'
                }}
              >
                <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>╬</div>
                <div style={{ fontSize: '0.7rem', fontWeight: 700, color: simMode === 'intersection' ? '#00f2fe' : '#8A92A6' }}>INTERSECTION</div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Visual Preview */}
        <div style={{ 
          flex: 1, 
          display: 'flex', 
          flexDirection: 'column',
          alignItems: 'center', 
          justifyContent: 'center',
          padding: '2rem'
        }}>
          <div style={{ position: 'relative', width: '100%', maxWidth: '450px' }}>
            <svg viewBox="0 0 400 400" style={{ width: '100%', borderRadius: '24px', boxShadow: '0 0 50px rgba(0,0,0,0.5), inset 0 0 0 1px rgba(255,255,255,0.05)', background: '#09090b' }}>
              <rect width="400" height="400" fill="#ffffff" />
              
              {/* NS Road */}
              <rect x="170" y="0" width="60" height="400" fill="#111116" />
              <line x1="200" y1="0" x2="200" y2="400" stroke="#ffffff" strokeWidth="2" strokeDasharray="12,12" />
              
              {simMode === 'intersection' && (
                <>
                  {/* EW Road */}
                  <rect x="0" y="170" width="400" height="60" fill="#111116" />
                  <line x1="0" y1="200" x2="400" y2="200" stroke="#ffffff" strokeWidth="2" strokeDasharray="12,12" />
                  {/* Intersection */}
                  <rect x="170" y="170" width="60" height="60" fill="#16161d" />
                </>
              )}

              {/* Lights (Preview) */}
              <circle cx="237" cy={simMode === 'intersection' ? 163 : 190} r="8" fill="#00e676" filter="url(#previewGlow)" />
              <circle cx="163" cy={simMode === 'intersection' ? 237 : 210} r="8" fill="#00e676" filter="url(#previewGlow)" />
              
              {simMode === 'intersection' && (
                <>
                  <circle cx="163" cy="163" r="8" fill="#ff3d00" filter="url(#previewGlow)" />
                  <circle cx="237" cy="237" r="8" fill="#ff3d00" filter="url(#previewGlow)" />
                </>
              )}

              <defs>
                <filter id="previewGlow" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="4" result="coloredBlur"/>
                  <feMerge><feMergeNode in="coloredBlur"/><feMergeNode in="SourceGraphic"/></feMerge>
                </filter>
              </defs>
            </svg>

            <div style={{ 
              position: 'absolute', 
              top: '20px', 
              right: '20px', 
              background: 'rgba(0,0,0,0.6)', 
              padding: '8px 15px', 
              borderRadius: '50px',
              border: '1px solid rgba(255,255,255,0.1)',
              fontSize: '0.65rem',
              color: '#00f2fe',
              fontWeight: 800,
              letterSpacing: '1px',
              backdropFilter: 'blur(10px)'
            }}>
              MODE: {simMode.toUpperCase()}
            </div>
          </div>

          {/* Next Button */}
          <button
            className="cyber-btn action-start"
            onClick={handleNext}
            style={{ marginTop: '2rem', flex: 'none', padding: '1rem 3rem', fontSize: '1rem', letterSpacing: '2px' }}
          >
            LAUNCH SIMULATION ENGINE →
          </button>
        </div>
      </div>

      <style>{`
        @keyframes fadeSlideIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
};

export default SetupAutomation;
