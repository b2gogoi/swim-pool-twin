import React, { useState, useEffect, useRef } from 'react';
import { db, EventPhoto, LandmarkMapping } from '../db/poolDatabase';
import { getPoolAnchors } from '../utils/poolLandmarks';
import { solvePhotoCameraPose } from '../utils/pnpSolver';
import { usePoolStore } from '../store/usePoolStore';

interface Props {
  photos: EventPhoto[];
  activePhoto: EventPhoto | null;
  setActivePhoto: (p: EventPhoto | null) => void;
  onPhotosMutated: () => void;
  onSnapCameraToPhoto: (photo: EventPhoto) => void;
}

const MAX_ZOOM = 16; // 1600%

export const EventGalleryMapper: React.FC<Props> = ({
  photos,
  activePhoto,
  setActivePhoto,
  onPhotosMutated,
  onSnapCameraToPhoto,
}) => {
  const {
    activePool,
    activeEvent,
    selectedAnchorId,
    setSelectedAnchorId,
  } = usePoolStore();

  const anchors = getPoolAnchors(activePool);

  const [isCollapsed, setIsCollapsed] = useState(false);
  const [galleryScale, setGalleryScale] = useState<number>(1.0); // 0.5 (50%) to 1.0 (100%)
  const [panelOpacity, setPanelOpacity] = useState<number>(0.92); // 0.1 (10%) to 1.0 (100%)

  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [fovEstimate, setFovEstimate] = useState<number>(52);
  const [isSolving, setIsSolving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Image Zoom & Pan (1x to 16x / 1600%)
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const viewportRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const dragStartRef = useRef({ x: 0, y: 0, panX: 0, panY: 0 });
  const didDragRef = useRef(false);

  // Load image blob & sync solved FOV from Dexie when activePhoto changes
  useEffect(() => {
    let mounted = true;
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setErrorMsg(null);

    if (!activePhoto) {
      setImageUrl(null);
      return;
    }

    if (activePhoto.solvedCamera?.fov) {
      setFovEstimate(activePhoto.solvedCamera.fov);
    }

    let createdUrl: string | null = null;
    db.photoBlobs.get(activePhoto.id).then((rec) => {
      if (!mounted || !rec) return;
      createdUrl = URL.createObjectURL(rec.blob);
      setImageUrl(createdUrl);
    });

    return () => {
      mounted = false;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [activePhoto?.id]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length || !activeEvent) return;
    const files = Array.from(e.target.files);
    let firstCreated: EventPhoto | null = null;

    for (const file of files) {
      const dims = await getImageDimensions(file);
      const id = crypto.randomUUID();
      const record: EventPhoto = {
        id,
        poolId: activePool.id,
        eventId: activeEvent.id,
        filename: file.name,
        width: dims.width,
        height: dims.height,
        mappings: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
        syncStatus: 'dirty',
        blobSynced: false,
      };
      await db.transaction('rw', db.photos, db.photoBlobs, async () => {
        await db.photos.add(record);
        await db.photoBlobs.add({ photoId: id, blob: file });
      });
      if (!firstCreated) firstCreated = record;
    }

    setIsCollapsed(false);
    onPhotosMutated();
    if (!activePhoto && firstCreated) setActivePhoto(firstCreated);
  };

  // Cursor-centered scroll wheel zoom up to 1600%
  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (!viewportRef.current) return;
    const rect = viewportRef.current.getBoundingClientRect();
    const cx = (e.clientX - rect.left) / galleryScale;
    const cy = (e.clientY - rect.top) / galleryScale;

    const factor = e.deltaY < 0 ? 1.3 : 0.77;
    const nextZoom = Math.min(MAX_ZOOM, Math.max(1, Number((zoom * factor).toFixed(2))));

    if (nextZoom === 1) {
      setZoom(1);
      setPan({ x: 0, y: 0 });
      return;
    }

    const ratio = nextZoom / zoom;
    setZoom(nextZoom);
    setPan({
      x: cx - (cx - pan.x) * ratio,
      y: cy - (cy - pan.y) * ratio,
    });
  };

  const stepZoom = (direction: 1 | -1) => {
    const increment = zoom >= 4 ? 2 : 1;
    const next = Math.min(MAX_ZOOM, Math.max(1, Number((zoom + direction * increment).toFixed(2))));
    setZoom(next);
    if (next === 1) setPan({ x: 0, y: 0 });
  };

  const handleImageClick = async (e: React.MouseEvent<HTMLImageElement>) => {
    if (didDragRef.current) {
      didDragRef.current = false;
      return;
    }
    if (!activePhoto || !imgRef.current) return;

    const rect = imgRef.current.getBoundingClientRect();
    const u = Math.round(((e.clientX - rect.left) * activePhoto.width) / rect.width);
    const v = Math.round(((e.clientY - rect.top) * activePhoto.height) / rect.height);

    const anchor = anchors.find((a) => a.id === selectedAnchorId);
    if (!anchor) return;

    const mapping: LandmarkMapping = {
      id: crypto.randomUUID(),
      anchorId: anchor.id,
      label: anchor.label,
      pixel: { u, v },
      world: anchor.world,
    };

    const filtered = activePhoto.mappings.filter((m) => m.anchorId !== anchor.id);
    const nextMappings = [...filtered, mapping];

    let nextSolvedCamera = activePhoto.solvedCamera;
    if (nextMappings.length >= 4) {
      try {
        nextSolvedCamera = await solvePhotoCameraPose(
          activePhoto.width,
          activePhoto.height,
          nextMappings,
          fovEstimate
        );
        setFovEstimate(nextSolvedCamera.fov);
        setErrorMsg(null);
      } catch (err: any) {
        setErrorMsg(err.message || 'PnP Solver error');
      }
    }

    const updated: EventPhoto = {
      ...activePhoto,
      mappings: nextMappings,
      solvedCamera: nextSolvedCamera,
      updatedAt: Date.now(),
      syncStatus: 'dirty',
    };

    await db.photos.put(updated);
    setActivePhoto(updated);
    onPhotosMutated();
  };

  const handleSolvePose = async () => {
    if (!activePhoto || isSolving) return;
    setIsSolving(true);
    setErrorMsg(null);
    try {
      const solved = await solvePhotoCameraPose(
        activePhoto.width,
        activePhoto.height,
        activePhoto.mappings,
        fovEstimate
      );
      setFovEstimate(solved.fov);
      const updated: EventPhoto = {
        ...activePhoto,
        solvedCamera: solved,
        updatedAt: Date.now(),
        syncStatus: 'dirty',
      };
      await db.photos.put(updated);
      setActivePhoto(updated);
      onPhotosMutated();
      onSnapCameraToPhoto(updated);
    } catch (err: any) {
      setErrorMsg(err.message || 'PnP Solver error');
    } finally {
      setIsSolving(false);
    }
  };

  const handleRemoveMapping = async (mappingId: string) => {
    if (!activePhoto) return;
    const nextMappings = activePhoto.mappings.filter((m) => m.id !== mappingId);

    let nextSolvedCamera = activePhoto.solvedCamera;
    if (nextMappings.length >= 4) {
      try {
        nextSolvedCamera = await solvePhotoCameraPose(
          activePhoto.width,
          activePhoto.height,
          nextMappings,
          fovEstimate
        );
        setFovEstimate(nextSolvedCamera.fov);
        setErrorMsg(null);
      } catch (err: any) {
        setErrorMsg(err.message || 'PnP Solver error');
      }
    } else {
      nextSolvedCamera = undefined;
    }

    const updated: EventPhoto = {
      ...activePhoto,
      mappings: nextMappings,
      solvedCamera: nextSolvedCamera,
      updatedAt: Date.now(),
      syncStatus: 'dirty',
    };

    await db.photos.put(updated);
    setActivePhoto(updated);
    onPhotosMutated();
  };

  const handleDeletePhoto = async (photoId: string) => {
    await db.transaction('rw', db.photos, db.photoBlobs, async () => {
      await db.photos.delete(photoId);
      await db.photoBlobs.delete(photoId);
    });
    if (activePhoto?.id === photoId) setActivePhoto(null);
    onPhotosMutated();
  };

  const solvedCount = photos.filter((p) => Boolean(p.solvedCamera)).length;

  const dynamicPanelStyle: React.CSSProperties = isCollapsed
    ? {
        position: 'absolute',
        top: 56,
        right: 16,
        width: 'auto',
        background: `rgba(15, 23, 42, ${Math.max(0.4, panelOpacity)})`,
        backdropFilter: panelOpacity > 0.25 ? 'blur(8px)' : 'none',
        border: '1px solid rgba(255, 255, 255, 0.14)',
        borderRadius: 8,
        padding: '8px 12px',
        color: '#e2e8f0',
        zIndex: 10,
        fontFamily: 'Inter, system-ui, sans-serif',
      }
    : {
        position: 'absolute',
        top: 56,
        right: 16,
        width: '46vw',
        minWidth: 740,
        maxWidth: 960,
        maxHeight: `calc((100vh - 72px) / ${galleryScale})`,
        overflowY: 'auto',
        transform: `scale(${galleryScale})`,
        transformOrigin: 'top right',
        background: `rgba(15, 23, 42, ${panelOpacity})`,
        backdropFilter: panelOpacity > 0.25 ? 'blur(8px)' : 'none',
        border: '1px solid rgba(255, 255, 255, 0.14)',
        borderRadius: 8,
        padding: 14,
        color: '#e2e8f0',
        zIndex: 10,
        fontFamily: 'Inter, system-ui, sans-serif',
        transition: 'transform 0.12s ease-out, background 0.12s ease-out',
      };

  return (
    <div style={dynamicPanelStyle}>
      {/* Header Bar with Scale (50%-100%) & Opacity (10%-100%) Controls */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 10,
          flexWrap: 'wrap',
        }}
      >
        <div
          onClick={() => setIsCollapsed((prev) => !prev)}
          style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}
        >
          <span style={sectionTitle}>
            3. Event Gallery ({solvedCount}/{photos.length} mapped)
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {!isCollapsed && (
            <>
              <div style={sliderGroupStyle} title="Scale Event Gallery Size (50% - 100%)">
                <span style={sliderLabelStyle}>Size:</span>
                <input
                  type="range"
                  min={0.5}
                  max={1.0}
                  step={0.05}
                  value={galleryScale}
                  onChange={(e) => setGalleryScale(Number(e.target.value))}
                  style={{ width: 64, accentColor: '#38bdf8', cursor: 'pointer' }}
                />
                <span style={sliderValStyle}>{Math.round(galleryScale * 100)}%</span>
              </div>

              <div style={sliderGroupStyle} title="Gallery Layer Opacity (10% - 100%)">
                <span style={sliderLabelStyle}>Opacity:</span>
                <input
                  type="range"
                  min={0.1}
                  max={1.0}
                  step={0.05}
                  value={panelOpacity}
                  onChange={(e) => setPanelOpacity(Number(e.target.value))}
                  style={{ width: 64, accentColor: '#38bdf8', cursor: 'pointer' }}
                />
                <span style={sliderValStyle}>{Math.round(panelOpacity * 100)}%</span>
              </div>
            </>
          )}

          <label
            style={{
              background: activeEvent ? '#0284c7' : '#334155',
              color: '#fff',
              padding: '4px 10px',
              borderRadius: 4,
              fontSize: 11,
              fontWeight: 600,
              cursor: activeEvent ? 'pointer' : 'not-allowed',
            }}
          >
            + Upload
            <input
              type="file"
              accept="image/*"
              multiple
              disabled={!activeEvent}
              onChange={handleUpload}
              style={{ display: 'none' }}
            />
          </label>

          <button
            onClick={() => setIsCollapsed((prev) => !prev)}
            style={collapseBtnStyle}
            title={isCollapsed ? 'Expand Photo Gallery' : 'Collapse Photo Gallery'}
          >
            {isCollapsed ? 'Expand ▾' : 'Collapse ▴'}
          </button>
        </div>
      </div>

      {/* Collapsible Body */}
      {!isCollapsed && (
        <div style={{ opacity: Math.max(0.22, panelOpacity) }}>
          {/* Horizontal Photo Strip */}
          <div style={{ display: 'flex', gap: 6, overflowX: 'auto', padding: '8px 0' }}>
            {photos.length === 0 && (
              <span style={{ fontSize: 12, color: '#94a3b8' }}>
                Upload photos for "{activeEvent?.name || 'selected event'}"
              </span>
            )}
            {photos.map((p) => (
              <div
                key={p.id}
                onClick={() => {
                  setActivePhoto(p);
                  if (p.solvedCamera) {
                    onSnapCameraToPhoto(p);
                  }
                }}
                style={{
                  padding: '5px 10px',
                  borderRadius: 4,
                  fontSize: 12,
                  cursor: 'pointer',
                  background: activePhoto?.id === p.id ? '#0284c7' : '#1e293b',
                  border: p.solvedCamera ? '1px solid #22c55e' : '1px solid #334155',
                  whiteSpace: 'nowrap',
                }}
              >
                {p.filename} {p.solvedCamera ? '📷 ✓' : `(${p.mappings.length}/4)`}
              </div>
            ))}
          </div>

          {/* Landmark Mapping Workspace */}
          {activePhoto && imageUrl && (
            <div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                <select
                  value={selectedAnchorId}
                  onChange={(e) => setSelectedAnchorId(e.target.value)}
                  style={selectStyle}
                >
                  {anchors.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.label}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  value={fovEstimate}
                  onChange={(e) => setFovEstimate(Number(e.target.value))}
                  title="Vertical FOV (degrees)"
                  style={{
                    width: 60,
                    background: '#0f172a',
                    color: '#fff',
                    border: '1px solid #334155',
                    borderRadius: 4,
                    padding: '0 8px',
                    fontSize: 12,
                  }}
                />
              </div>

              {/* Zoom Bar (up to 1600%) */}
              <div style={zoomBar}>
                <span style={{ fontSize: 11, color: '#facc15', fontWeight: 500 }}>
                  Yellow node in 3D = active target • Wheel zoom (up to 1600%) • Drag pan
                </span>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button onClick={() => stepZoom(-1)} style={zoomBtn}>
                    −
                  </button>
                  <button
                    onClick={() => {
                      setZoom(1);
                      setPan({ x: 0, y: 0 });
                    }}
                    style={zoomBtn}
                    title="Reset to 100%"
                  >
                    {Math.round(zoom * 100)}%
                  </button>
                  <button onClick={() => stepZoom(1)} style={zoomBtn}>
                    +
                  </button>
                  <button onClick={() => setZoom(8)} style={zoomBtn} title="Jump to 800%">
                    8x
                  </button>
                  <button onClick={() => setZoom(16)} style={zoomBtn} title="Jump to 1600%">
                    16x
                  </button>
                </div>
              </div>

              {/* Zoomable Image Viewport */}
              <div
                ref={viewportRef}
                onWheel={handleWheel}
                onMouseDown={(e) => {
                  setIsDragging(true);
                  didDragRef.current = false;
                  dragStartRef.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
                }}
                onMouseMove={(e) => {
                  if (!isDragging) return;
                  const dx = (e.clientX - dragStartRef.current.x) / galleryScale;
                  const dy = (e.clientY - dragStartRef.current.y) / galleryScale;
                  if (Math.abs(dx) > 4 || Math.abs(dy) > 4) didDragRef.current = true;
                  if (zoom > 1) {
                    setPan({ x: dragStartRef.current.panX + dx, y: dragStartRef.current.panY + dy });
                  }
                }}
                onMouseUp={() => setIsDragging(false)}
                onMouseLeave={() => setIsDragging(false)}
                style={{
                  position: 'relative',
                  width: '100%',
                  height: '56vh',
                  minHeight: 480,
                  overflow: 'hidden',
                  borderRadius: 6,
                  border: '1px solid #334155',
                  background: `rgba(2, 6, 23, ${panelOpacity})`,
                  userSelect: 'none',
                }}
              >
                <div
                  style={{
                    position: 'relative',
                    width: '100%',
                    transformOrigin: '0 0',
                    transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                  }}
                >
                  <img
                    ref={imgRef}
                    src={imageUrl}
                    alt={activePhoto.filename}
                    draggable={false}
                    onClick={handleImageClick}
                    style={{
                      position: 'relative',
                      zIndex: 1,
                      width: '100%',
                      display: 'block',
                      opacity: Math.max(0.15, panelOpacity),
                      cursor: isDragging && zoom > 1 ? 'grabbing' : 'crosshair',
                      imageRendering: zoom >= 8 ? 'pixelated' : 'auto',
                    }}
                  />
                  {activePhoto.mappings.map((m, idx) => {
                    const isCurrentTarget = m.anchorId === selectedAnchorId;
                    const markerScale = Math.max(0.35, 1 / zoom);

                    return (
                      <div
                        key={m.id}
                        title={m.label}
                        style={{
                          position: 'absolute',
                          zIndex: 10,
                          left: `${(m.pixel.u / activePhoto.width) * 100}%`,
                          top: `${(m.pixel.v / activePhoto.height) * 100}%`,
                          transform: `translate(-50%, -50%) scale(${markerScale})`,
                          width: 18,
                          height: 18,
                          borderRadius: '50%',
                          background: isCurrentTarget ? '#eab308' : '#ef4444',
                          border: '2px solid #fff',
                          color: '#fff',
                          fontSize: 10,
                          fontWeight: 700,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          pointerEvents: 'none',
                          boxShadow: '0 0 4px rgba(0, 0, 0, 0.9)',
                        }}
                      >
                        {idx + 1}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Mapped Points List */}
              <div style={{ maxHeight: 110, overflowY: 'auto', marginTop: 8, fontSize: 11 }}>
                {activePhoto.mappings.map((m, idx) => (
                  <div
                    key={m.id}
                    onClick={() => setSelectedAnchorId(m.anchorId)}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      padding: '2px 4px',
                      borderRadius: 3,
                      cursor: 'pointer',
                      background:
                        m.anchorId === selectedAnchorId ? 'rgba(250, 204, 21, 0.15)' : 'transparent',
                    }}
                  >
                    <span>
                      #{idx + 1} {m.label} ({m.pixel.u}, {m.pixel.v})
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemoveMapping(m.id);
                      }}
                      style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer' }}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>

              {activePhoto.solvedCamera && (
                <div style={{ fontSize: 12, color: '#22c55e', marginTop: 4, fontWeight: 600 }}>
                  Pose: [{activePhoto.solvedCamera.position.join('m, ')}m] • FOV:{' '}
                  {activePhoto.solvedCamera.fov}° • Err:{' '}
                  {activePhoto.solvedCamera.reprojectionError}px
                </div>
              )}

              {errorMsg && (
                <div style={{ color: '#f87171', fontSize: 11, marginTop: 4 }}>{errorMsg}</div>
              )}

              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button
                  onClick={handleSolvePose}
                  disabled={activePhoto.mappings.length < 4 || isSolving}
                  style={{
                    flex: 1,
                    padding: 8,
                    background: activePhoto.mappings.length >= 4 ? '#16a34a' : '#334155',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 4,
                    fontWeight: 600,
                    fontSize: 12,
                    cursor: 'pointer',
                  }}
                >
                  {isSolving ? 'Solving 3D Pose...' : 'Solve & Map to 3D Pool'}
                </button>

                {activePhoto.solvedCamera && (
                  <button
                    onClick={() => onSnapCameraToPhoto(activePhoto)}
                    style={{
                      padding: '8px 12px',
                      background: '#0284c7',
                      color: '#fff',
                      border: '1px solid #38bdf8',
                      borderRadius: 4,
                      fontWeight: 600,
                      fontSize: 12,
                      cursor: 'pointer',
                    }}
                  >
                    View 3D
                  </button>
                )}

                <button
                  onClick={() => handleDeletePhoto(activePhoto.id)}
                  style={{
                    padding: '8px 12px',
                    background: '#7f1d1d',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 4,
                    fontSize: 12,
                    cursor: 'pointer',
                  }}
                >
                  Delete
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

function getImageDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
      URL.revokeObjectURL(url);
    };
    img.src = url;
  });
}

const sliderGroupStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  background: 'rgba(15, 23, 42, 0.7)',
  padding: '2px 6px',
  borderRadius: 4,
  border: '1px solid #334155',
};

const sliderLabelStyle: React.CSSProperties = {
  fontSize: 10,
  color: '#94a3b8',
};

const sliderValStyle: React.CSSProperties = {
  fontSize: 10,
  color: '#e2e8f0',
  width: 28,
  textAlign: 'right',
  fontFamily: 'monospace',
};

const collapseBtnStyle: React.CSSProperties = {
  background: '#1e293b',
  border: '1px solid #475569',
  color: '#e2e8f0',
  borderRadius: 4,
  padding: '4px 8px',
  fontSize: 11,
  fontWeight: 600,
  cursor: 'pointer',
};

const sectionTitle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  color: '#38bdf8',
};

const selectStyle: React.CSSProperties = {
  flex: 1,
  background: '#0f172a',
  color: '#facc15',
  fontWeight: 600,
  border: '1px solid #475569',
  borderRadius: 4,
  padding: '5px 8px',
  fontSize: 12,
};

const zoomBar: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: 6,
  padding: '4px 8px',
  background: '#0f172a',
  borderRadius: 4,
};

const zoomBtn: React.CSSProperties = {
  background: '#1e293b',
  border: '1px solid #334155',
  color: '#e2e8f0',
  borderRadius: 3,
  padding: '2px 7px',
  fontSize: 11,
  cursor: 'pointer',
};