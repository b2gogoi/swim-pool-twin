import React from 'react';
import { PoolCoverageSummary } from '../utils/coverageAnalyzer';
import { usePoolStore } from '../store/usePoolStore';

interface Props {
  coverage: PoolCoverageSummary;
  isOnline: boolean;
  syncState: 'idle' | 'syncing' | 'error';
  pendingCount: number;
  onSyncNow: () => void;
  overlayOpacity: number;
  onChangeOverlayOpacity: (val: number) => void;
}

export const CoverageSyncBar: React.FC<Props> = ({
  coverage,
  isOnline,
  syncState,
  pendingCount,
  onSyncNow,
  overlayOpacity,
  onChangeOverlayOpacity,
}) => {
  const { showCoverage3D, toggleCoverage3D } = usePoolStore();

  return (
    <div style={barStyle}>
      {/* Offline / Sync Status Pill */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: !isOnline
              ? '#f59e0b'
              : syncState === 'syncing'
              ? '#38bdf8'
              : syncState === 'error'
              ? '#ef4444'
              : '#22c55e',
          }}
        />
        <span style={{ fontSize: 11, fontWeight: 600 }}>
          {!isOnline
            ? 'Offline Mode'
            : syncState === 'syncing'
            ? 'Syncing...'
            : pendingCount > 0
            ? `${pendingCount} Queued`
            : 'Synced'}
        </span>
        {isOnline && pendingCount > 0 && (
          <button onClick={onSyncNow} style={tinyBtn}>
            Sync
          </button>
        )}
      </div>

      <div style={divider} />

      {/* 3D Point Coverage Summary */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 11 }}>
        <div>
          <span style={{ color: '#94a3b8' }}>3D Coverage: </span>
          <strong style={{ color: '#22c55e' }}>
            {coverage.coveredCount}/{coverage.totalAnchors} ({coverage.coveragePercent}%)
          </strong>
          <span style={{ color: '#64748b', marginLeft: 6 }}>
            [{coverage.multiViewCount} multi-view]
          </span>
        </div>

        {/* Zone Mini Breakdown */}
        <div style={{ display: 'flex', gap: 6, fontSize: 10, color: '#cbd5e1' }}>
          <span title="0m - 15m Zone">Start: {coverage.zoneBreakdown.startZone0to15m}%</span>
          <span title="15m - 35m Zone">Mid: {coverage.zoneBreakdown.midZone15to35m}%</span>
          <span title="35m - 50m Zone">Turn: {coverage.zoneBreakdown.turnZone35to50m}%</span>
        </div>

        <button
          onClick={toggleCoverage3D}
          style={{
            background: showCoverage3D ? '#0284c7' : '#1e293b',
            border: '1px solid #38bdf8',
            color: '#fff',
            borderRadius: 4,
            padding: '2px 8px',
            fontSize: 11,
            cursor: 'pointer',
          }}
        >
          {showCoverage3D ? 'Hide 3D Nodes' : 'Show 3D Nodes'}
        </button>
        {/* // Add inside the CoverageSyncBar JSX right next to the "Hide 3D Nodes" button: */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ color: '#94a3b8', fontSize: 10 }}>Photo Overlay:</span>
          <input
            type="range"
            min={0}
            max={0.9}
            step={0.05}
            value={overlayOpacity}
            onChange={(e) => onChangeOverlayOpacity(Number(e.target.value))}
            style={{ width: 65, accentColor: '#38bdf8', cursor: 'pointer' }}
          />
          <span style={{ fontSize: 10, width: 28 }}>{Math.round(overlayOpacity * 100)}%</span>
        </div>
      </div>
    </div>
  );
};

const barStyle: React.CSSProperties = {
  position: 'absolute',
  top: 16,
  left: '50%',
  transform: 'translateX(-50%)',
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  background: 'rgba(15, 23, 42, 0.92)',
  backdropFilter: 'blur(8px)',
  border: '1px solid rgba(255, 255, 255, 0.14)',
  borderRadius: 999,
  padding: '6px 16px',
  color: '#e2e8f0',
  zIndex: 12,
  fontFamily: 'Inter, system-ui, sans-serif',
  whiteSpace: 'nowrap',
};

const divider: React.CSSProperties = {
  width: 1,
  height: 16,
  background: '#334155',
};

const tinyBtn: React.CSSProperties = {
  background: '#1e293b',
  border: '1px solid #475569',
  color: '#e2e8f0',
  borderRadius: 4,
  padding: '1px 6px',
  fontSize: 10,
  cursor: 'pointer',
};