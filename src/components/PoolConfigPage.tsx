import React from 'react';
import { Box, Check, RotateCcw, Waves } from 'lucide-react';
import { PoolItemVisibility, usePoolStore } from '../store/usePoolStore';

type PoolItemKey = keyof PoolItemVisibility;

const ITEM_GROUPS: Array<{ title: string; items: Array<{ key: PoolItemKey; label: string; description: string }> }> = [
  {
    title: 'Structure',
    items: [
      { key: 'deck', label: 'Pool deck', description: 'Surrounding deck area' },
      { key: 'water', label: 'Water surface', description: 'Pool basin and water' },
      { key: 'walls', label: 'End walls', description: 'Start and turn walls' },
      { key: 'bulkhead', label: 'Bulkhead', description: 'Movable center divider' },
    ],
  },
  {
    title: 'Competition equipment',
    items: [
      { key: 'laneRopes', label: 'Lane ropes', description: 'Lane separators and color zones' },
      { key: 'startingBlocks', label: 'Starting blocks', description: 'One block per lane' },
      { key: 'backstrokeFlags', label: 'Backstroke flags', description: '5 m and 45 m flag lines' },
      { key: 'ladders', label: 'Pool ladders', description: 'Ladders at the 25 m line' },
      { key: 'distanceMarkers', label: 'Distance markers', description: 'Key distance lines and labels' },
    ],
  },
];

const BASE_VISIBILITY: PoolItemVisibility = {
  deck: true,
  water: true,
  walls: true,
  laneRopes: true,
  startingBlocks: true,
  backstrokeFlags: true,
  ladders: true,
  distanceMarkers: true,
  bulkhead: false,
};

export const PoolConfigPage: React.FC = () => {
  const activePool = usePoolStore((state) => state.activePool);
  const visibility = usePoolStore((state) => state.poolItemVisibility);
  const setPoolItemVisibility = usePoolStore((state) => state.setPoolItemVisibility);
  const selectedCount = Object.values(visibility).filter(Boolean).length;
  const itemCount = Object.keys(visibility).length;

  return (
    <main className="pool-config-page" aria-label="Pool configuration">
      <header className="pool-config-heading">
        <div className="gallery-icon"><Waves size={20} /></div>
        <div className="pool-config-title">
          <p className="eyebrow">VENUE DESIGN</p>
          <h1>Pool config</h1>
          <p>Choose which pool elements appear in the top view.</p>
        </div>
      </header>

      <div className="pool-config-layout">
        <aside className="pool-item-panel" aria-label="Pool items">
          <div className="pool-item-panel-heading">
            <div>
              <h2>Pool items</h2>
              <p>{selectedCount} of {itemCount} visible</p>
            </div>
            <button
              className="pool-reset-button"
              onClick={() => {
                (Object.keys(BASE_VISIBILITY) as PoolItemKey[]).forEach((key) =>
                  setPoolItemVisibility(key, BASE_VISIBILITY[key])
                );
              }}
              title="Restore the default pool view"
            >
              <RotateCcw size={14} />
              <span>Reset</span>
            </button>
          </div>

          {ITEM_GROUPS.map((group) => (
            <section className="pool-item-group" key={group.title}>
              <h3>{group.title}</h3>
              <div className="pool-item-list">
                {group.items.map((item) => (
                  <label className="pool-item-option" key={item.key}>
                    <span className={`pool-checkbox${visibility[item.key] ? ' checked' : ''}`} aria-hidden="true">
                      {visibility[item.key] && <Check size={12} strokeWidth={3} />}
                    </span>
                    <input
                      type="checkbox"
                      checked={visibility[item.key]}
                      onChange={(event) => setPoolItemVisibility(item.key, event.target.checked)}
                    />
                    <span className="pool-item-copy">
                      <span>{item.label}</span>
                      <small>{item.description}</small>
                    </span>
                  </label>
                ))}
              </div>
            </section>
          ))}
        </aside>

        <PoolTopView pool={activePool} visibility={visibility} />
      </div>
    </main>
  );
};

const PoolTopView: React.FC<{
  pool: ReturnType<typeof usePoolStore.getState>['activePool'];
  visibility: PoolItemVisibility;
}> = ({ pool, visibility }) => {
  const poolWidth = pool.laneCount * pool.laneWidth;
  const svgWidth = 1100;
  const svgHeight = 540;
  const scale = Math.min(
    (svgWidth - 120) / (pool.length + pool.deckBorder * 2),
    (svgHeight - 115) / (poolWidth + pool.deckBorder * 2)
  );
  const deckX = (svgWidth - (pool.length + pool.deckBorder * 2) * scale) / 2;
  const deckY = (svgHeight - (poolWidth + pool.deckBorder * 2) * scale) / 2;
  const x = deckX + pool.deckBorder * scale;
  const y = deckY + pool.deckBorder * scale;
  const width = pool.length * scale;
  const height = poolWidth * scale;
  const interiorRopeColors = ['#0284c7', '#0369a1', '#2563eb', '#f59e0b', '#f59e0b', '#f59e0b', '#0369a1', '#0284c7', '#0284c7'];
  const ropePositions = Array.from({ length: Math.max(0, pool.laneCount - 1) }, (_, index) => (index + 1) * pool.laneWidth);
  const distancePositions = [5, 15, 25, 35, 45].filter((distance) => distance < pool.length);
  const flagPositions = [pool.flagDistance, pool.length - pool.flagDistance];
  const ladderX = x + width / 2;
  const blockWidth = Math.max(6, scale * 0.55);
  const blockHeight = Math.max(8, pool.laneWidth * scale * 0.52);

  return (
    <section className="pool-top-view-panel" aria-label="Two dimensional pool top view">
      <div className="pool-view-heading">
        <div>
          <p className="eyebrow">LIVE PREVIEW</p>
          <h2>{pool.name || 'Standard 50m Olympic Pool'}</h2>
          <p>{pool.length} m long <span>·</span> {pool.laneCount} lanes <span>·</span> {pool.laneWidth} m lane width</p>
        </div>
        <span className="top-view-badge"><Box size={13} /> TOP VIEW</span>
      </div>

      <div className="pool-svg-wrap">
        <svg
          className="pool-top-svg"
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          role="img"
          aria-label={`Top view of a ${pool.length} meter, ${pool.laneCount} lane pool`}
        >
          <defs>
            <linearGradient id="pool-water-gradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#0c547d" />
              <stop offset="50%" stopColor="#0877a9" />
              <stop offset="100%" stopColor="#075477" />
            </linearGradient>
            <pattern id="pool-deck-pattern" width="20" height="20" patternUnits="userSpaceOnUse">
              <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#94a3b8" strokeOpacity="0.24" strokeWidth="0.8" />
            </pattern>
          </defs>

          {visibility.deck && (
            <g>
              <rect x={deckX} y={deckY} width={(pool.length + pool.deckBorder * 2) * scale} height={(poolWidth + pool.deckBorder * 2) * scale} rx="8" fill="#d0d7df" />
              <rect x={deckX} y={deckY} width={(pool.length + pool.deckBorder * 2) * scale} height={(poolWidth + pool.deckBorder * 2) * scale} rx="8" fill="url(#pool-deck-pattern)" />
            </g>
          )}

          {visibility.water && <rect x={x} y={y} width={width} height={height} fill="url(#pool-water-gradient)" />}

          {visibility.walls && (
            <g fill="#dbe3ea" stroke="#64748b" strokeWidth="1">
              <rect x={x - 2} y={y} width="5" height={height} />
              <rect x={x + width - 3} y={y} width="5" height={height} />
            </g>
          )}

          {visibility.laneRopes && ropePositions.map((position, index) => {
            const lineY = y + position * scale;
            const laneColor = pool.laneColorScheme === 'uniform_blue'
              ? '#2563eb'
              : interiorRopeColors[index] || '#2563eb';
            return (
              <g key={`rope-${index}`}>
                <line x1={x} y1={lineY} x2={x + width} y2={lineY} stroke={laneColor} strokeWidth="3.2" />
                <line x1={x} y1={lineY} x2={x + 5 * scale} y2={lineY} stroke="#ef4444" strokeWidth="3.4" />
                <line x1={x + 14.75 * scale} y1={lineY} x2={x + 15.25 * scale} y2={lineY} stroke="#ef4444" strokeWidth="3.4" />
                <line x1={x + 24.5 * scale} y1={lineY} x2={x + 25.5 * scale} y2={lineY} stroke="#f8fafc" strokeWidth="3.4" />
                <line x1={x + 34.75 * scale} y1={lineY} x2={x + 35.25 * scale} y2={lineY} stroke="#ef4444" strokeWidth="3.4" />
                <line x1={x + 45 * scale} y1={lineY} x2={x + width} y2={lineY} stroke="#ef4444" strokeWidth="3.4" />
              </g>
            );
          })}

          {visibility.distanceMarkers && distancePositions.map((distance) => (
            <g key={`distance-${distance}`}>
              <line x1={x + distance * scale} y1={y} x2={x + distance * scale} y2={y + height} stroke={distance === 15 || distance === 35 ? '#fb7185' : '#bae6fd'} strokeWidth="1.1" strokeDasharray="5 5" opacity="0.68" />
              <text x={x + distance * scale} y={deckY - 8} textAnchor="middle" className="pool-svg-distance-label">{distance} m</text>
            </g>
          ))}

          {visibility.backstrokeFlags && flagPositions.map((distance, lineIndex) => (
            <g key={`flags-${lineIndex}`}>
              <line x1={x + distance * scale} y1={y - 7} x2={x + distance * scale} y2={y + height + 7} stroke="#e2e8f0" strokeWidth="2" />
              {Array.from({ length: Math.ceil(poolWidth / 0.7) }).map((_, flagIndex) => {
                const flagY = y + ((flagIndex + 0.5) * poolWidth * scale) / Math.ceil(poolWidth / 0.7);
                const direction = lineIndex === 0 ? 1 : -1;
                const flagX = x + distance * scale;
                return <path key={flagIndex} d={`M ${flagX} ${flagY - 3} L ${flagX + direction * 10} ${flagY} L ${flagX} ${flagY + 3} Z`} fill={flagIndex % 2 === 0 ? '#ef4444' : '#f8fafc'} />;
              })}
            </g>
          ))}

          {visibility.startingBlocks && Array.from({ length: pool.laneCount }).map((_, laneIndex) => {
            const blockY = y + (laneIndex + 0.5) * pool.laneWidth * scale - blockHeight / 2;
            return (
              <g key={`block-${laneIndex}`}>
                <rect x={x - blockWidth - 3} y={blockY} width={blockWidth} height={blockHeight} rx="2" fill="#0f172a" stroke="#7dd3fc" strokeWidth="1.5" />
                <text x={x - blockWidth / 2 - 3} y={blockY + blockHeight / 2 + 3} textAnchor="middle" className="pool-svg-lane-label">{laneIndex + (pool.laneCount === 10 ? 0 : 1)}</text>
              </g>
            );
          })}

          {visibility.ladders && [y - 7, y + height + 7].map((ladderY, index) => (
            <g key={`ladder-${index}`} stroke="#f1f5f9" strokeWidth="2.2" fill="none">
              <path d={`M ${ladderX - 6} ${ladderY} v ${index === 0 ? 11 : -11} q 0 5 5 5 h 12 q 5 0 5 -5 v ${index === 0 ? -11 : 11}`} />
              <line x1={ladderX - 3} y1={ladderY + (index === 0 ? 4 : -4)} x2={ladderX + 13} y2={ladderY + (index === 0 ? 4 : -4)} />
            </g>
          ))}

          {visibility.bulkhead && (
            <g>
              <rect x={ladderX - 4} y={y} width="8" height={height} fill="#cbd5e1" stroke="#475569" strokeWidth="1.5" />
              <text x={ladderX} y={y + height + 23} textAnchor="middle" className="pool-svg-wall-label">BULKHEAD</text>
            </g>
          )}

          {visibility.walls && (
            <g className="pool-svg-wall-label">
              <text x={x} y={deckY + (poolWidth + pool.deckBorder * 2) * scale + 27}>START</text>
              <text x={x + width} y={deckY + (poolWidth + pool.deckBorder * 2) * scale + 27} textAnchor="end">TURN</text>
            </g>
          )}
          <text x={svgWidth / 2} y={38} textAnchor="middle" className="pool-svg-dimension">{pool.length} m</text>
          <text x={svgWidth - 34} y={svgHeight / 2} textAnchor="middle" transform={`rotate(90 ${svgWidth - 34} ${svgHeight / 2})`} className="pool-svg-dimension">{poolWidth.toFixed(1)} m</text>
        </svg>
      </div>

      <div className="pool-view-legend">
        <span><i className="legend-water" />Water</span>
        <span><i className="legend-lane" />Lane ropes</span>
        <span><i className="legend-distance" />Distance marks</span>
        <span className="pool-view-note">Top view is drawn to scale from pool dimensions</span>
      </div>
    </section>
  );
};
