import React from 'react';
import { usePoolStore } from '../store/usePoolStore';
// Replace:
// import { Camera, Layers, Eye, Grid } from 'lucide-react';

// With direct icon paths:
import Camera from 'lucide-react/dist/esm/icons/camera';
import Layers from 'lucide-react/dist/esm/icons/layers';
import Eye from 'lucide-react/dist/esm/icons/eye';
import Grid from 'lucide-react/dist/esm/icons/grid';


export const TelemetryOverlay: React.FC = () => {
  const { config, cameraPose, showGrid, activePreset } = usePoolStore();
  const { setLaneCount, toggleGrid, setActivePreset } = usePoolStore();

  const copyPoseJSON = () => {
    navigator.clipboard.writeText(JSON.stringify(cameraPose, null, 2));
  };

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.card}>
        <div style={styles.titleRow}>
          <Layers size={18} color="#38bdf8" />
          <span style={styles.headerTitle}>50m Olympic Pool Digital Twin</span>
        </div>

        {/* Lane Config Selector */}
        <div style={styles.controlGroup}>
          <label style={styles.label}>Configuration</label>
          <div style={styles.btnRow}>
            <button
              onClick={() => setLaneCount(10)}
              style={config.laneCount === 10 ? styles.btnActive : styles.btn}
            >
              10 Lanes (25m)
            </button>
            <button
              onClick={() => setLaneCount(8)}
              style={config.laneCount === 8 ? styles.btnActive : styles.btn}
            >
              8 Lanes (20m)
            </button>
            <button
              onClick={toggleGrid}
              style={showGrid ? styles.btnActive : styles.btn}
            >
              <Grid size={14} style={{ marginRight: 4 }} />
              Grid
            </button>
          </div>
        </div>

        {/* View Presets */}
        <div style={styles.controlGroup}>
          <label style={styles.label}>View Presets</label>
          <div style={styles.btnRow}>
            {(['start', 'turn', 'grandstand', 'ortho'] as const).map((view) => (
              <button
                key={view}
                onClick={() => setActivePreset(view)}
                style={activePreset === view ? styles.btnActive : styles.btn}
              >
                <Eye size={12} style={{ marginRight: 4 }} />
                {view.charAt(0).toUpperCase() + view.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Real-time Telemetry Card for Camera Calibration / PnP */}
      <div style={styles.card}>
        <div style={styles.titleRow}>
          <Camera size={18} color="#38bdf8" />
          <span style={styles.headerTitle}>Camera Calibration Telemetry</span>
        </div>
        <div style={styles.telemetryGrid}>
          <div>
            <div style={styles.statLabel}>X (Length)</div>
            <div style={styles.statVal}>{cameraPose.x} m</div>
          </div>
          <div>
            <div style={styles.statLabel}>Y (Height)</div>
            <div style={styles.statVal}>{cameraPose.y} m</div>
          </div>
          <div>
            <div style={styles.statLabel}>Z (Width)</div>
            <div style={styles.statVal}>{cameraPose.z} m</div>
          </div>
          <div>
            <div style={styles.statLabel}>Pitch / Yaw</div>
            <div style={styles.statVal}>{cameraPose.pitch}° / {cameraPose.yaw}°</div>
          </div>
        </div>
        <button onClick={copyPoseJSON} style={styles.copyBtn}>
          Copy Pose JSON (for PnP / Solver)
        </button>
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    position: 'absolute',
    top: 16,
    left: 16,
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    zIndex: 10,
    fontFamily: 'Inter, system-ui, sans-serif',
    pointerEvents: 'none',
  },
  card: {
    background: 'rgba(15, 23, 42, 0.85)',
    backdropFilter: 'blur(8px)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: 8,
    padding: '12px 16px',
    color: '#e2e8f0',
    width: 320,
    pointerEvents: 'auto',
  },
  titleRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  headerTitle: {
    fontSize: 14,
    fontWeight: 600,
  },
  controlGroup: {
    marginTop: 8,
  },
  label: {
    fontSize: 11,
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  btnRow: {
    display: 'flex',
    gap: 6,
    marginTop: 4,
    flexWrap: 'wrap',
  },
  btn: {
    display: 'flex',
    alignItems: 'center',
    background: '#1e293b',
    border: '1px solid #334155',
    color: '#cbd5e1',
    padding: '4px 8px',
    borderRadius: 4,
    fontSize: 12,
    cursor: 'pointer',
  },
  btnActive: {
    display: 'flex',
    alignItems: 'center',
    background: '#0284c7',
    border: '1px solid #38bdf8',
    color: '#ffffff',
    padding: '4px 8px',
    borderRadius: 4,
    fontSize: 12,
    cursor: 'pointer',
  },
  telemetryGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: 8,
    marginTop: 8,
    background: '#090d16',
    padding: 8,
    borderRadius: 4,
  },
  statLabel: {
    fontSize: 10,
    color: '#64748b',
  },
  statVal: {
    fontSize: 13,
    fontFamily: 'monospace',
    color: '#38bdf8',
    fontWeight: 600,
  },
  copyBtn: {
    marginTop: 8,
    width: '100%',
    padding: '6px 0',
    background: '#1e293b',
    border: '1px solid #334155',
    color: '#cbd5e1',
    borderRadius: 4,
    fontSize: 12,
    cursor: 'pointer',
  },
};
