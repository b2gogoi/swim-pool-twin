import React, { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { Building2, Check, ChevronRight, Images, Pencil, Plus, RefreshCw, Waves, X } from 'lucide-react';
import { CompetitionEvent, db, EventPhoto, PoolVenue } from '../db/poolDatabase';
import { DEFAULT_POOL_TEMPLATE, PoolItemVisibility, usePoolStore } from '../store/usePoolStore';
import { PoolTopView } from './PoolConfigPage';

const PREVIEW_VISIBILITY: PoolItemVisibility = {
  deck: true,
  water: true,
  walls: true,
  laneRopes: true,
  startingBlocks: true,
  backstrokeFlags: true,
  extraPoles: true,
  ladders: true,
  distanceMarkers: true,
  bulkhead: true,
};

function createDraft(): PoolVenue {
  return {
    ...DEFAULT_POOL_TEMPLATE,
    id: 'pool-venue-preview',
    name: '',
    customLaneColors: Array.from({ length: DEFAULT_POOL_TEMPLATE.laneCount - 1 }, () => '#1688bf'),
    updatedAt: Date.now(),
    syncStatus: 'dirty',
  };
}

export const PoolVenuePage: React.FC<{ onTriggerSync: () => void }> = ({ onTriggerSync }) => {
  const [venues, setVenues] = useState<PoolVenue[]>([]);
  const [events, setEvents] = useState<CompetitionEvent[]>([]);
  const [selectedVenueId, setSelectedVenueId] = useState<string | null>(null);
  const [draft, setDraft] = useState<PoolVenue>(createDraft);
  const [eventName, setEventName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [editingVenueId, setEditingVenueId] = useState<string | null>(null);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const setActivePool = usePoolStore((state) => state.setActivePool);
  const setActiveEvent = usePoolStore((state) => state.setActiveEvent);

  const refreshVenues = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage('');
    try {
      const [storedVenues, storedEvents] = await Promise.all([
        db.pools.toArray(),
        db.events.toArray(),
      ]);
      setVenues(storedVenues.sort((a, b) => a.name.localeCompare(b.name)));
      setEvents(storedEvents);
      setSelectedVenueId((currentId) =>
        currentId && storedVenues.some((venue) => venue.id === currentId)
          ? currentId
          : storedVenues[0]?.id ?? null
      );
    } catch (error) {
      console.error('Unable to load saved pool venues:', error);
      setErrorMessage('Could not read pool venues from this browser’s IndexedDB.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshVenues();
  }, [refreshVenues]);

  const eventByPool = useMemo(() => {
    const result = new Map<string, CompetitionEvent>();
    events.forEach((event) => {
      const current = result.get(event.poolId);
      if (!current || event.updatedAt > current.updatedAt) result.set(event.poolId, event);
    });
    return result;
  }, [events]);

  const updateLaneCount = (laneCount: number) => {
    setDraft((current) => ({
      ...current,
      laneCount,
      customLaneColors: Array.from({ length: Math.max(0, laneCount - 1) }, (_, index) =>
        current.customLaneColors?.[index] || '#1688bf'
      ),
    }));
  };

  const updateCustomLaneColor = (index: number, color: string) => {
    setDraft((current) => {
      const colors = Array.from({ length: Math.max(0, current.laneCount - 1) }, (_, colorIndex) =>
        current.customLaneColors?.[colorIndex] || '#1688bf'
      );
      colors[index] = color;
      return { ...current, customLaneColors: colors };
    });
  };

  const handleSaveVenue = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!draft.name.trim() || (!editingVenueId && !eventName.trim())) return;

    const now = Date.now();
    const poolId = editingVenueId ?? crypto.randomUUID();
    const venue: PoolVenue = {
      ...draft,
      id: poolId,
      name: draft.name.trim(),
      customLaneColors: draft.laneColorScheme === 'custom' ? draft.customLaneColors : undefined,
      updatedAt: now,
      syncStatus: 'dirty',
    };
    const priorEvent = editingEventId ? events.find((item) => item.id === editingEventId) : undefined;
    const competition = eventName.trim()
      ? {
          id: priorEvent?.id ?? crypto.randomUUID(),
          poolId,
          name: eventName.trim(),
          date: priorEvent?.date ?? new Date().toISOString().slice(0, 10),
          updatedAt: now,
          syncStatus: 'dirty' as const,
        }
      : null;

    try {
      await db.transaction('rw', db.pools, db.events, async () => {
        await db.pools.put(venue);
        if (competition) {
          if (priorEvent) await db.events.put(competition);
          else await db.events.add(competition);
        }
      });
      setActivePool(venue);
      setActiveEvent(competition);
      onTriggerSync();
      setSelectedVenueId(poolId);
      setIsCreating(false);
      setEditingVenueId(null);
      setEditingEventId(null);
      setDraft(createDraft());
      setEventName('');
      await refreshVenues();
    } catch (error) {
      console.error('Unable to save the pool venue:', error);
      setErrorMessage(`Could not ${editingVenueId ? 'update' : 'save'} this venue. Please try again.`);
    }
  };

  const startCreating = () => {
    setDraft(createDraft());
    setEventName('');
    setEditingVenueId(null);
    setEditingEventId(null);
    setErrorMessage('');
    setIsCreating(true);
  };

  const startEditing = (venue: PoolVenue) => {
    const venueEvent = eventByPool.get(venue.id);
    setDraft({
      ...DEFAULT_POOL_TEMPLATE,
      ...venue,
      startingBlocksAtStart: venue.startingBlocksAtStart ?? true,
      has15m35mPoles: venue.has15m35mPoles ?? true,
      has25mMarker: venue.has25mMarker ?? true,
      midpointEquipment: venue.midpointEquipment ?? 'ladder',
      customLaneColors: Array.from({ length: Math.max(0, venue.laneCount - 1) }, (_, index) =>
        venue.customLaneColors?.[index] || '#1688bf'
      ),
    });
    setEventName(venueEvent?.name ?? '');
    setEditingVenueId(venue.id);
    setEditingEventId(venueEvent?.id ?? null);
    setErrorMessage('');
    setIsCreating(true);
  };

  const selectVenue = async (venue: PoolVenue) => {
    setSelectedVenueId(venue.id);
    setActivePool(venue);
    const venueEvent = eventByPool.get(venue.id) ?? null;
    setActiveEvent(venueEvent);
    if (venueEvent) return;

    const storedEvents = await db.events.where('poolId').equals(venue.id).toArray();
    setActiveEvent(storedEvents[0] ?? null);
  };

  if (isCreating) {
    return (
      <main className="pool-venue-page" aria-label={editingVenueId ? 'Edit pool venue' : 'Create pool venue'}>
        <header className="pool-venue-heading">
          <div className="gallery-icon"><Building2 size={20} /></div>
          <div>
            <p className="eyebrow">VENUE SETUP</p>
            <h1>{editingVenueId ? 'Edit pool venue' : 'Create a pool venue'}</h1>
            <p>Update the venue and event details. The pool preview updates as you edit.</p>
          </div>
        </header>

        <div className="pool-venue-create-layout">
          <form className="pool-venue-form" onSubmit={handleSaveVenue}>
            <div className="pool-form-title-row">
              <div>
                <h2>Venue details</h2>
                <p>{editingVenueId ? 'Change venue details and equipment.' : 'Start with the standard 50 m pool and adjust its equipment.'}</p>
              </div>
              <span className="pool-form-base-badge">{editingVenueId ? 'EDITING VENUE' : 'DEFAULT POOL BASE'}</span>
            </div>

            {errorMessage && <div className="pool-form-error" role="alert">{errorMessage}</div>}

            <div className="pool-form-field-grid">
              <label className="pool-form-field span-two">
                <span>Venue name</span>
                <input autoFocus required maxLength={100} value={draft.name} placeholder="e.g. Riverside Aquatic Centre" onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
              </label>
              <label className="pool-form-field span-two">
                <span>Event name</span>
                <input required={!editingVenueId || Boolean(editingEventId)} maxLength={100} value={eventName} placeholder={editingVenueId ? 'Optional event name' : 'e.g. Regional Championships 2026'} onChange={(e) => setEventName(e.target.value)} />
              </label>
              <label className="pool-form-field">
                <span>Pool length (m)</span>
                <input type="number" min="10" max="100" step="1" required value={draft.length} onChange={(e) => setDraft({ ...draft, length: Number(e.target.value) })} />
              </label>
              <label className="pool-form-field">
                <span>Number of lanes</span>
                <input type="number" min="1" max="16" step="1" required value={draft.laneCount} onChange={(e) => updateLaneCount(Math.min(16, Math.max(1, Number(e.target.value) || 1)))} />
              </label>
            </div>

            <div className="pool-form-section">
              <h3>Starting blocks</h3>
              <div className="pool-form-choice-row">
                <label className="venue-choice">
                  <input type="checkbox" checked={draft.startingBlocksAtStart !== false} onChange={(e) => setDraft({ ...draft, startingBlocksAtStart: e.target.checked })} />
                  <span className="venue-choice-check"><Check size={12} /></span>
                  <span>Start end</span>
                </label>
                <label className="venue-choice">
                  <input type="checkbox" checked={Boolean(draft.startingBlocksAtTurn)} onChange={(e) => setDraft({ ...draft, startingBlocksAtTurn: e.target.checked })} />
                  <span className="venue-choice-check"><Check size={12} /></span>
                  <span>Turn end</span>
                </label>
              </div>
            </div>

            <div className="pool-form-section">
              <h3>Pool markers & equipment</h3>
              <div className="pool-form-choice-row">
                <label className="venue-choice">
                  <input type="checkbox" checked={Boolean(draft.hasBulkhead)} onChange={(e) => setDraft({ ...draft, hasBulkhead: e.target.checked })} />
                  <span className="venue-choice-check"><Check size={12} /></span>
                  <span>Movable bulkhead</span>
                </label>
                <label className="venue-choice">
                  <input type="checkbox" checked={draft.has15m35mPoles !== false} onChange={(e) => setDraft({ ...draft, has15m35mPoles: e.target.checked })} />
                  <span className="venue-choice-check"><Check size={12} /></span>
                  <span>Extra poles at 15 m &amp; 35 m</span>
                </label>
                <label className="venue-choice">
                  <input type="checkbox" checked={draft.has25mMarker !== false} onChange={(e) => setDraft({ ...draft, has25mMarker: e.target.checked })} />
                  <span className="venue-choice-check"><Check size={12} /></span>
                  <span>25 m midpoint marker</span>
                </label>
              </div>
              <label className="pool-form-field midpoint-select">
                <span>Midpoint equipment</span>
                <select value={draft.midpointEquipment ?? 'ladder'} onChange={(e) => setDraft({ ...draft, midpointEquipment: e.target.value as PoolVenue['midpointEquipment'] })}>
                  <option value="ladder">Ladder</option>
                  <option value="pole">Pole</option>
                  <option value="none">None</option>
                </select>
              </label>
            </div>

            <div className="pool-form-section">
              <h3>Lane rope colors</h3>
              <div className="pool-form-choice-row rope-scheme-row">
                <label className={`rope-scheme-option${draft.laneColorScheme === 'olympic' ? ' selected' : ''}`}>
                  <input type="radio" name="laneColorScheme" checked={draft.laneColorScheme === 'olympic'} onChange={() => setDraft({ ...draft, laneColorScheme: 'olympic' })} />
                  <span className="rope-swatch olympic-swatch" />
                  <span><strong>Olympic</strong><small>Competition standard colors</small></span>
                </label>
                <label className={`rope-scheme-option${draft.laneColorScheme === 'custom' ? ' selected' : ''}`}>
                  <input type="radio" name="laneColorScheme" checked={draft.laneColorScheme === 'custom'} onChange={() => setDraft({ ...draft, laneColorScheme: 'custom' })} />
                  <span className="rope-swatch custom-swatch" />
                  <span><strong>Custom</strong><small>Choose each lane rope color</small></span>
                </label>
              </div>
              {draft.laneColorScheme === 'custom' && (
                <div className="custom-rope-colors" aria-label="Custom lane rope colors">
                  {Array.from({ length: Math.max(0, draft.laneCount - 1) }).map((_, index) => (
                    <label key={index} className="custom-rope-color">
                      <input type="color" value={draft.customLaneColors?.[index] || '#1688bf'} onChange={(e) => updateCustomLaneColor(index, e.target.value)} />
                      <span>Rope {index + 1}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            <div className="pool-form-actions">
              <button type="button" className="pool-form-cancel" onClick={() => { setIsCreating(false); setEditingVenueId(null); setEditingEventId(null); }}>Cancel</button>
              <button type="submit" className="pool-form-submit">{editingVenueId ? <Check size={15} /> : <Plus size={15} />}{editingVenueId ? ' Save changes' : ' Save venue & event'}</button>
            </div>
          </form>

          <PoolTopView pool={draft} visibility={{ ...PREVIEW_VISIBILITY, bulkhead: draft.hasBulkhead }} />
          <VenuePhotoGallery poolId={editingVenueId ?? draft.id} />
        </div>
      </main>
    );
  }

  return (
    <main className="pool-venue-page" aria-label="Pool venues">
      <header className="pool-venue-heading">
        <div className="gallery-icon"><Building2 size={20} /></div>
        <div className="pool-venue-title">
          <p className="eyebrow">WORKSPACE</p>
          <h1>Pool venue</h1>
          <p>Set up venue details, competition equipment, and lane rope colors.</p>
        </div>
        {venues.length > 0 && <button className="pool-new-venue-button" onClick={startCreating}><Plus size={16} /> New venue</button>}
      </header>

      {errorMessage && <div className="pool-venue-page-error" role="alert">{errorMessage}</div>}
      {isLoading ? (
        <div className="pool-venue-empty">Checking saved venues…</div>
      ) : venues.length === 0 ? (
        <div className="pool-venue-empty-state">
          <div className="pool-venue-empty-icon"><Waves size={25} /></div>
          <h2>No pool venues yet</h2>
          <p>No venue records were found in IndexedDB for this site and browser profile.</p>
          <button className="pool-form-submit" onClick={startCreating}><Plus size={15} /> Create your first venue</button>
        </div>
      ) : (
        <div className="pool-venue-list-layout">
          <section className="pool-venue-list" aria-label="Saved pool venues">
            <p className="pool-venue-list-label">SAVED VENUES · {venues.length}</p>
            {venues.map((venue) => {
              const venueEvent = eventByPool.get(venue.id);
              return (
                <div className="pool-venue-list-row" key={venue.id}>
                  <button className={`pool-venue-list-item${selectedVenueId === venue.id ? ' selected' : ''}`} onClick={() => selectVenue(venue)}>
                    <span className="venue-list-mark"><Waves size={17} /></span>
                    <span className="venue-list-copy">
                      <strong>{venue.name}</strong>
                      <small>{venue.length} m · {venue.laneCount} lanes{venueEvent ? ` · ${venueEvent.name}` : ''}</small>
                    </span>
                    <ChevronRight size={16} />
                  </button>
                  <button className="pool-venue-edit-button" onClick={() => startEditing(venue)} aria-label={`Edit ${venue.name}`} title="Edit venue">
                    <Pencil size={14} />
                  </button>
                </div>
              );
            })}
          </section>
          {(() => {
            const selectedVenue = venues.find((venue) => venue.id === selectedVenueId) ?? venues[0];
            return selectedVenue ? (
              <>
                <PoolTopView pool={selectedVenue} visibility={{ ...PREVIEW_VISIBILITY, bulkhead: selectedVenue.hasBulkhead }} />
                <VenuePhotoGallery poolId={selectedVenue.id} />
              </>
            ) : null;
          })()}
        </div>
      )}
    </main>
  );
};

interface VenuePhoto extends EventPhoto {
  previewUrl: string | null;
  eventName: string;
}

const VenuePhotoGallery: React.FC<{ poolId: string }> = ({ poolId }) => {
  const [photos, setPhotos] = useState<VenuePhoto[]>([]);
  const [selectedPhotoId, setSelectedPhotoId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let isCurrent = true;
    const objectUrls: string[] = [];

    const loadPhotos = async () => {
      setIsLoading(true);
      setHasError(false);
      try {
        const poolPhotos = await db.photos.where('poolId').equals(poolId).toArray();
        poolPhotos.sort((left, right) => right.createdAt - left.createdAt);
        const [blobs, events] = await Promise.all([
          db.photoBlobs.bulkGet(poolPhotos.map((photo) => photo.id)),
          db.events.bulkGet([...new Set(poolPhotos.map((photo) => photo.eventId))]),
        ]);
        if (!isCurrent) return;

        const eventNames = new Map<string, string>();
        events.forEach((event) => {
          if (event) eventNames.set(event.id, event.name);
        });
        const venuePhotos = poolPhotos.map((photo, index) => {
          const blob = blobs[index]?.blob;
          const previewUrl = blob ? URL.createObjectURL(blob) : null;
          if (previewUrl) objectUrls.push(previewUrl);
          return {
            ...photo,
            previewUrl,
            eventName: eventNames.get(photo.eventId) || 'Pool photo',
          };
        });
        setPhotos(venuePhotos);
        setSelectedPhotoId((currentId) =>
          currentId && venuePhotos.some((photo) => photo.id === currentId)
            ? currentId
            : null
        );
      } catch (error) {
        console.error('Unable to load pool venue photos:', error);
        if (isCurrent) setHasError(true);
      } finally {
        if (isCurrent) setIsLoading(false);
      }
    };

    loadPhotos();
    return () => {
      isCurrent = false;
      objectUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [poolId, refreshKey]);

  const selectedPhoto = photos.find((photo) => photo.id === selectedPhotoId) ?? null;

  return (
    <aside className="pool-photo-gallery" aria-label="Photos for this pool venue">
      <div className="pool-photo-gallery-heading">
        <div>
          <p className="eyebrow">VENUE MEDIA</p>
          <h2><Images size={14} /> Photos <span>{photos.length}</span></h2>
        </div>
        <button
          className="pool-photo-refresh"
          onClick={() => setRefreshKey((key) => key + 1)}
          disabled={isLoading}
          aria-label="Refresh venue photos"
          title="Refresh photos"
        >
          <RefreshCw size={14} className={isLoading ? 'refresh-spinning' : ''} />
        </button>
      </div>

      {isLoading ? (
        <div className="pool-photo-empty">Loading pool photos…</div>
      ) : hasError ? (
        <div className="pool-photo-empty">Could not load photos from IndexedDB.</div>
      ) : photos.length === 0 ? (
        <div className="pool-photo-empty">
          <Images size={21} />
          <span>No photos uploaded for this venue yet.</span>
        </div>
      ) : (
        <div className="pool-photo-list">
          {photos.map((photo) => (
            <button
              className={`pool-photo-card${selectedPhotoId === photo.id ? ' selected' : ''}`}
              key={photo.id}
              onClick={() => setSelectedPhotoId(photo.id)}
              aria-label={`View ${photo.filename}`}
            >
              <span className="pool-photo-thumbnail">
                {photo.previewUrl ? <img src={photo.previewUrl} alt="" loading="lazy" /> : <Images size={20} />}
              </span>
              <span className="pool-photo-copy">
                <strong title={photo.filename}>{photo.filename}</strong>
                <small>{photo.eventName}</small>
              </span>
            </button>
          ))}
        </div>
      )}

      {selectedPhoto?.previewUrl && (
        <div className="pool-photo-lightbox" role="dialog" aria-modal="true" aria-label={`${selectedPhoto.filename} preview`} onClick={() => setSelectedPhotoId(null)}>
          <button className="pool-photo-lightbox-close" onClick={() => setSelectedPhotoId(null)} aria-label="Close photo preview"><X size={20} /></button>
          <img src={selectedPhoto.previewUrl} alt={selectedPhoto.filename} onClick={(event) => event.stopPropagation()} />
          <p>{selectedPhoto.filename} · {selectedPhoto.eventName}</p>
        </div>
      )}
    </aside>
  );
};
