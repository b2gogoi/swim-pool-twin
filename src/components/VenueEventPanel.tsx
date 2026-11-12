import React, { useState, useEffect } from 'react';
import { db, PoolVenue, CompetitionEvent } from '../db/poolDatabase';
import { usePoolStore, DEFAULT_POOL_TEMPLATE } from '../store/usePoolStore';

interface Props {
  onPoolOrEventChanged: () => void;
  onTriggerSync: () => void;
}

export const VenueEventPanel: React.FC<Props> = ({
  onPoolOrEventChanged,
  onTriggerSync,
}) => {
  const {
    activePool,
    activeEvent,
    cameraPose,
    showGrid,
    activePreset,
    setActivePool,
    setActiveEvent,
    toggleGrid,
    setActivePreset,
  } = usePoolStore();

  const [pools, setPools] = useState<PoolVenue[]>([]);
  const [events, setEvents] = useState<CompetitionEvent[]>([]);
  const [isEditingPool, setIsEditingPool] = useState(false);
  const [draftPool, setDraftPool] = useState<PoolVenue>(activePool);
  const [newEventName, setNewEventName] = useState('');
  const [showNewEventInput, setShowNewEventInput] = useState(false);

  // Initialize DB with a default pool & event if empty
  useEffect(() => {
    async function bootstrap() {
      let existingPools = await db.pools.toArray();
      if (existingPools.length === 0) {
        const seedPool: PoolVenue = {
          ...DEFAULT_POOL_TEMPLATE,
          id: crypto.randomUUID(),
          name: 'Main 50m Competition Pool',
          updatedAt: Date.now(),
          syncStatus: 'dirty',
        };
        await db.pools.add(seedPool);
        existingPools = [seedPool];
      }
      setPools(existingPools);
      const currentPool = existingPools[0];
      setActivePool(currentPool);
      setDraftPool(currentPool);

      let poolEvents = await db.events.where('poolId').equals(currentPool.id).toArray();
      if (poolEvents.length === 0) {
        const seedEvent: CompetitionEvent = {
          id: crypto.randomUUID(),
          poolId: currentPool.id,
          name: 'Meet Session 1 - Prelims',
          date: new Date().toISOString().split('T')[0],
          updatedAt: Date.now(),
          syncStatus: 'dirty',
        };
        await db.events.add(seedEvent);
        poolEvents = [seedEvent];
      }
      setEvents(poolEvents);
      setActiveEvent(poolEvents[0]);
      onPoolOrEventChanged();
    }
    bootstrap();
  }, []);

  const handleSelectPool = async (poolId: string) => {
    const found = pools.find((p) => p.id === poolId);
    if (!found) return;
    setActivePool(found);
    setDraftPool(found);
    setIsEditingPool(false);

    const poolEvents = await db.events.where('poolId').equals(found.id).toArray();
    setEvents(poolEvents);
    setActiveEvent(poolEvents[0] || null);
    onPoolOrEventChanged();
  };

  const handleStartNewPool = () => {
    const fresh: PoolVenue = {
      ...DEFAULT_POOL_TEMPLATE,
      id: crypto.randomUUID(),
      name: `Pool Venue #${pools.length + 1}`,
      updatedAt: Date.now(),
      syncStatus: 'dirty',
    };
    setDraftPool(fresh);
    setIsEditingPool(true);
  };

  const handleSavePoolConfig = async () => {
    const toSave: PoolVenue = {
      ...draftPool,
      updatedAt: Date.now(),
      syncStatus: 'dirty',
    };
    await db.pools.put(toSave);
    const updatedList = await db.pools.toArray();
    setPools(updatedList);
    setActivePool(toSave);
    setIsEditingPool(false);
    onPoolOrEventChanged();
    onTriggerSync();
  };

  const handleCreateEvent = async () => {
    if (!newEventName.trim()) return;
    const created: CompetitionEvent = {
      id: crypto.randomUUID(),
      poolId: activePool.id,
      name: newEventName.trim(),
      date: new Date().toISOString().split('T')[0],
      updatedAt: Date.now(),
      syncStatus: 'dirty',
    };
    await db.events.add(created);
    const updatedEvents = await db.events.where('poolId').equals(activePool.id).toArray();
    setEvents(updatedEvents);
    setActiveEvent(created);
    setNewEventName('');
    setShowNewEventInput(false);
    onPoolOrEventChanged();
    onTriggerSync();
  };

  return (
    <div style={styles.container}>
      {/* 1. Venue / Pool Configurator Card */}
      <div style={styles.card}>
        <div style={styles.rowBetween}>
          <span style={styles.sectionTitle}>1. Pool Venue Config</span>
          <div style={{ display: 'flex', gap: 4 }}>
            <button
              onClick={() => {
                setDraftPool(activePool);
                setIsEditingPool(!isEditingPool);
              }}
              style={styles.smallBtn}
            >
              {isEditingPool ? 'Cancel' : 'Edit'}
            </button>
            <button onClick={handleStartNewPool} style={styles.primarySmallBtn}>
              + New Pool
            </button>
          </div>
        </div>

        <select
          value={activePool.id}
          onChange={(e) => handleSelectPool(e.target.value)}
          style={styles.select}
        >
          {pools.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} ({p.laneCount}L • {p.length}m)
            </option>
          ))}
        </select>

        {isEditingPool && (
          <div style={styles.editorBox}>
            <label style={styles.fieldLabel}>Venue Name</label>
            <input
              type="text"
              value={draftPool.name}
              onChange={(e) => setDraftPool({ ...draftPool, name: e.target.value })}
              style={styles.input}
            />

            <div style={styles.grid2}>
              <div>
                <label style={styles.fieldLabel}>Lanes</label>
                <select
                  value={draftPool.laneCount}
                  onChange={(e) =>
                    setDraftPool({ ...draftPool, laneCount: Number(e.target.value) as 8 | 10 })
                  }
                  style={styles.input}
                >
                  <option value={10}>10 Lanes (25m)</option>
                  <option value={8}>8 Lanes (20m)</option>
                </select>
              </div>
              <div>
                <label style={styles.fieldLabel}>Lane Width (m)</label>
                <input
                  type="number"
                  step="0.05"
                  value={draftPool.laneWidth}
                  onChange={(e) =>
                    setDraftPool({ ...draftPool, laneWidth: Number(e.target.value) })
                  }
                  style={styles.input}
                />
              </div>
              <div>
                <label style={styles.fieldLabel}>Flag Height (m)</label>
                <input
                  type="number"
                  step="0.05"
                  value={draftPool.flagHeight}
                  onChange={(e) =>
                    setDraftPool({ ...draftPool, flagHeight: Number(e.target.value) })
                  }
                  style={styles.input}
                />
              </div>
              <div>
                <label style={styles.fieldLabel}>Rope Colors</label>
                <select
                  value={draftPool.laneColorScheme}
                  onChange={(e) =>
                    setDraftPool({
                      ...draftPool,
                      laneColorScheme: e.target.value as PoolVenue['laneColorScheme'],
                    })
                  }
                  style={styles.input}
                >
                  <option value="olympic">Olympic (Yellow Center)</option>
                  <option value="uniform_blue">Uniform Blue</option>
                </select>
              </div>
            </div>

            <button onClick={handleSavePoolConfig} style={styles.saveBtn}>
              Save Pool Configuration
            </button>
          </div>
        )}

        {/* 2. Event Selector under Active Pool */}
        <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid #1e293b' }}>
          <div style={styles.rowBetween}>
            <span style={styles.sectionTitle}>2. Competition Event</span>
            <button
              onClick={() => setShowNewEventInput(!showNewEventInput)}
              style={styles.primarySmallBtn}
            >
              + Event
            </button>
          </div>

          {showNewEventInput ? (
            <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
              <input
                type="text"
                placeholder="e.g. 100m Fly Finals"
                value={newEventName}
                onChange={(e) => setNewEventName(e.target.value)}
                style={styles.input}
              />
              <button onClick={handleCreateEvent} style={styles.smallBtn}>
                Add
              </button>
            </div>
          ) : (
            <select
              value={activeEvent?.id || ''}
              onChange={(e) => {
                const ev = events.find((item) => item.id === e.target.value) || null;
                setActiveEvent(ev);
                onPoolOrEventChanged();
              }}
              style={styles.select}
            >
              {events.length === 0 && <option value="">No events yet — click + Event</option>}
              {events.map((ev) => (
                <option key={ev.id} value={ev.id}>
                  {ev.name} ({ev.date})
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* 3. Viewport Controls & Telemetry */}
      <div style={styles.card}>
        <div style={styles.rowBetween}>
          <span style={styles.sectionTitle}>3D View & Telemetry</span>
          <button onClick={toggleGrid} style={showGrid ? styles.btnActive : styles.smallBtn}>
            Grid {showGrid ? 'ON' : 'OFF'}
          </button>
        </div>

        <div style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
          {(['start', 'turn', 'grandstand', 'ortho'] as const).map((view) => (
            <button
              key={view}
              onClick={() => setActivePreset(view)}
              style={activePreset === view ? styles.btnActive : styles.smallBtn}
            >
              {view.toUpperCase()}
            </button>
          ))}
        </div>

        <div style={styles.telemetryBox}>
          <span>Pos: ({cameraPose.x}m, {cameraPose.y}m, {cameraPose.z}m)</span>
          <span>Pitch/Yaw: {cameraPose.pitch}° / {cameraPose.yaw}°</span>
        </div>
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
    gap: 10,
    zIndex: 10,
    width: 310,
    fontFamily: 'Inter, system-ui, sans-serif',
  },
  card: {
    background: 'rgba(15, 23, 42, 0.9)',
    backdropFilter: 'blur(8px)',
    border: '1px solid rgba(255, 255, 255, 0.12)',
    borderRadius: 8,
    padding: 12,
    color: '#e2e8f0',
  },
  rowBetween: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    color: '#38bdf8',
  },
  select: {
    width: '100%',
    marginTop: 6,
    background: '#0f172a',
    color: '#f8fafc',
    border: '1px solid #334155',
    borderRadius: 4,
    padding: '5px 8px',
    fontSize: 12,
  },
  editorBox: {
    marginTop: 8,
    padding: 8,
    background: '#090d16',
    borderRadius: 6,
    border: '1px solid #1e293b',
  },
  fieldLabel: {
    display: 'block',
    fontSize: 10,
    color: '#94a3b8',
    marginTop: 6,
    marginBottom: 2,
  },
  input: {
    width: '100%',
    background: '#0f172a',
    color: '#fff',
    border: '1px solid #334155',
    borderRadius: 4,
    padding: '4px 6px',
    fontSize: 12,
  },
  grid2: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 6,
  },
  smallBtn: {
    background: '#1e293b',
    border: '1px solid #334155',
    color: '#cbd5e1',
    borderRadius: 4,
    padding: '3px 7px',
    fontSize: 11,
    cursor: 'pointer',
  },
  primarySmallBtn: {
    background: '#0284c7',
    border: '1px solid #38bdf8',
    color: '#fff',
    borderRadius: 4,
    padding: '3px 7px',
    fontSize: 11,
    cursor: 'pointer',
    fontWeight: 600,
  },
  btnActive: {
    background: '#0284c7',
    border: '1px solid #38bdf8',
    color: '#fff',
    borderRadius: 4,
    padding: '3px 7px',
    fontSize: 11,
    cursor: 'pointer',
  },
  saveBtn: {
    marginTop: 8,
    width: '100%',
    background: '#16a34a',
    color: '#fff',
    border: 'none',
    borderRadius: 4,
    padding: '6px 0',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
  },
  telemetryBox: {
    marginTop: 8,
    padding: '6px 8px',
    background: '#090d16',
    borderRadius: 4,
    fontSize: 11,
    fontFamily: 'monospace',
    color: '#94a3b8',
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
};