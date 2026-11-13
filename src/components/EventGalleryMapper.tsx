import React, { useState, useEffect, useRef } from 'react';
import { db, EventPhoto, LandmarkMapping } from '../db/poolDatabase';
import { getPoolAnchors } from '../utils/poolLandmarks';
import {
  getPoolEdgeLines,
  LineMapping,
  expandLinesToPnPMappings,
} from '../utils/poolLines';
import { solvePhotoCameraPose } from '../utils/pnpSolver';
import { usePoolStore } from '../store/usePoolStore';

interface Props {
  photos: EventPhoto[];
  activePhoto: EventPhoto | null;
  setActivePhoto: (p: EventPhoto | null) => void;
  onPhotosMutated: () => void;
  onSnapCameraToPhoto: (photo: EventPhoto) => void;
  activeLineId: string | null;
  setActiveLineId: (id: string | null) => void;
}

const MAX_ZOOM = 16; // 1600%
const GALLERY_SCALE_OPTIONS = [0.4, 0.6, 0.8, 1.0] as const;

export const EventGalleryMapper: React.FC<Props> = ({
  photos,
  activePhoto,
  setActivePhoto,
  onPhotosMutated,
  onSnapCameraToPhoto,
  activeLineId,
  setActiveLineId,
}) => {
  const {
    activePool,
    activeEvent,
    selectedAnchorId,
    setSelectedAnchorId,
  } = usePoolStore();

  const anchors = getPoolAnchors(activePool);
  const edgeLines = getPoolEdgeLines(activePool);

  const [toolMode, setToolMode] = useState<'point' | 'line'>('point');
  const [selectedLineId, setSelectedLineId] = useState<string>(edgeLines[0]?.id || 'edge_near_z0');
  const [pendingDot1, setPendingDot1] = useState<{ u: number; v: number } | null>(null);

  const [isCollapsed, setIsCollapsed] = useState(false);
  const [galleryScale, setGalleryScale] = useState<number>(1.0);
  const [panelOpacity, setPanelOpacity] = useState<number>(0.92);

  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [fovEstimate, setFovEstimate] = useState<number>(52);
  const [isSolving, setIsSolving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const viewportRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const dragStartRef = useRef({ x: 0, y: 0, panX: 0, panY: 0 });
  const didDragRef = useRef(false);

  // Sync activeLineId to 3D canvas only when in 'line' mode
  useEffect(() => {
    setActiveLineId(toolMode === 'line' ? selectedLineId : null);
  }, [toolMode, selectedLineId, setActiveLineId]);

  useEffect(() => {
    let mounted = true;
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setPendingDot1(null);
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

  // Helper: combine explicit point mappings + 2-dot line samples and solve PnP
  const recomputePose = async (
    photo: EventPhoto,
    points: LandmarkMapping[],
    lines: LineMapping[],
    fov: number
  ) => {
    const lineSamples = expandLinesToPnPMappings(
      lines,
      edgeLines,
      photo.solvedCamera,
      photo.width,
      photo.height
    );
    const combined = [...points, ...lineSamples];
    if (combined.length < 4) return undefined;

    // Pass 1: solve with current correspondences
    let solved = await solvePhotoCameraPose(photo.width, photo.height, combined, fov);

    // Pass 2: if lines exist, refine their 3D contact points along the pool walls using Pass 1 pose
    if (lines.length > 0) {
      const refinedSamples = expandLinesToPnPMappings(
        lines,
        edgeLines,
        solved,
        photo.width,
        photo.height
      );
      solved = await solvePhotoCameraPose(
        photo.width,
        photo.height,
        [...points, ...refinedSamples],
        solved.fov
      );
    }
    return solved;
  };

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
        lineMappings: [],
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

    // MODE A: 2-Dot Pool Edge Line Connector
    if (toolMode === 'line') {
      if (!pendingDot1) {
        setPendingDot1({ u, v });
        return;
      }

      const linePreset = edgeLines.find((l) => l.id === selectedLineId);
      if (!linePreset) return;

      const newLine: LineMapping = {
        id: crypto.randomUUID(),
        lineId: linePreset.id,
        label: linePreset.label,
        p1: pendingDot1,
        p2: { u, v },
      };

      const existingLines = (activePhoto.lineMappings || []).filter(
        (l) => l.lineId !== linePreset.id
      );
      const nextLines = [...existingLines, newLine];
      setPendingDot1(null);

      let nextSolved = activePhoto.solvedCamera;
      try {
        nextSolved = await recomputePose(
          activePhoto,
          activePhoto.mappings,
          nextLines,
          fovEstimate
        );
        if (nextSolved) setFovEstimate(nextSolved.fov);
        setErrorMsg(null);
      } catch (err: any) {
        setErrorMsg(err.message || 'PnP Solver error');
      }

      const updated: EventPhoto = {
        ...activePhoto,
        lineMappings: nextLines,
        solvedCamera: nextSolved,
        updatedAt: Date.now(),
        syncStatus: 'dirty',
      };

      await db.photos.put(updated);
      setActivePhoto(updated);
      onPhotosMutated();
      return;
    }

    // MODE B: Single 3D Anchor Point
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

    let nextSolved = activePhoto.solvedCamera;
    try {
      nextSolved = await recomputePose(
        activePhoto,
        nextMappings,
        activePhoto.lineMappings || [],
        fovEstimate
      );
      if (nextSolved) setFovEstimate(nextSolved.fov);
      setErrorMsg(null);
    } catch (err: any) {
      setErrorMsg(err.message || 'PnP Solver error');
    }

    const updated: EventPhoto = {
      ...activePhoto,
      mappings: nextMappings,
      solvedCamera: nextSolved,
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
      const solved = await recomputePose(
        activePhoto,
        activePhoto.mappings,
        activePhoto.lineMappings || [],
        fovEstimate
      );
      if (!solved) {
        throw new Error('Add at least 4 points (or points + pool edge lines) to solve.');
      }
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
    let nextSolved = activePhoto.solvedCamera;
    try {
      nextSolved = await recomputePose(
        activePhoto,
        nextMappings,
        activePhoto.lineMappings || [],
        fovEstimate
      );
    } catch {
      nextSolved = undefined;
    }

    const updated: EventPhoto = {
      ...activePhoto,
      mappings: nextMappings,
      solvedCamera: nextSolved,
      updatedAt: Date.now(),
      syncStatus: 'dirty',
    };
    await db.photos.put(updated);
    setActivePhoto(updated);
    onPhotosMutated();
  };

  const handleRemoveLine = async (lineRecordId: string) => {
    if (!activePhoto) return;
    const nextLines = (activePhoto.lineMappings || []).filter((l) => l.id !== lineRecordId);
    let nextSolved = activePhoto.solvedCamera;
    try {
      nextSolved = await recomputePose(
        activePhoto,
        activePhoto.mappings,
        nextLines,
        fovEstimate
      );
    } catch {
      nextSolved = undefined;
    }

    const updated: EventPhoto = {
      ...activePhoto,
      lineMappings: nextLines,
      solvedCamera: nextSolved,
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
  const activeLines = activePhoto?.lineMappings || [];
  const totalConstraints =
    (activePhoto?.mappings.length || 0) + activeLines.length * 3;

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
      {/* Header Bar */}
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
              <div style={sliderGroupStyle}>
                <span style={sliderLabelStyle}>Size:</span>
                {GALLERY_SCALE_OPTIONS.map((opt) => {
                  const isActive = galleryScale === opt;
                  return (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => setGalleryScale(opt)}
                      style={{
                        background: isActive ? '#0284c7' : 'transparent',
                        color: isActive ? '#fff' : '#cbd5e1',
                        border: isActive ? '1px solid #38bdf8' : '1px solid transparent',
                        borderRadius: 3,
                        padding: '1px 5px',
                        fontSize: 10,
                        fontWeight: isActive ? 700 : 500,
                        fontFamily: 'monospace',
                        cursor: 'pointer',
                      }}
                    >
                      {Math.round(opt * 100)}%
                    </button>
                  );
                })}
                {/* <span style={sliderValStyle}>{Math.round(galleryScale * 100)}%</span> */}
              </div>

              <div style={sliderGroupStyle}>
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
          >
            {isCollapsed ? 'Expand ▾' : 'Collapse ▴'}
          </button>
        </div>
      </div>

      {/* Collapsible Body */}
      {!isCollapsed && (
        <div style={{ opacity: Math.max(0.22, panelOpacity) }}>
          {/* Photo Strip */}
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

          {/* Calibration Mode Switch: 3D Points vs 2-Dot Pool Edge Lines */}
          {activePhoto && imageUrl && (
            <div>
              <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                <button
                  onClick={() => {
                    setToolMode('point');
                    setPendingDot1(null);
                  }}
                  style={{
                    padding: '5px 10px',
                    borderRadius: 4,
                    fontSize: 11,
                    fontWeight: 700,
                    cursor: 'pointer',
                    background: toolMode === 'point' ? '#0284c7' : '#1e293b',
                    border: toolMode === 'point' ? '1px solid #38bdf8' : '1px solid #334155',
                    color: '#fff',
                  }}
                >
                  • 3D Node ({activePhoto.mappings.length})
                </button>
                <button
                  onClick={() => {
                    setToolMode('line');
                    setPendingDot1(null);
                  }}
                  style={{
                    padding: '5px 10px',
                    borderRadius: 4,
                    fontSize: 11,
                    fontWeight: 700,
                    cursor: 'pointer',
                    background: toolMode === 'line' ? '#059669' : '#1e293b',
                    border: toolMode === 'line' ? '1px solid #34d399' : '1px solid #334155',
                    color: '#fff',
                  }}
                >
                  ╱ Pool Edge Line ({activeLines.length})
                </button>

                {toolMode === 'point' ? (
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
                ) : (
                  <select
                    value={selectedLineId}
                    onChange={(e) => {
                      setSelectedLineId(e.target.value);
                      setPendingDot1(null);
                    }}
                    style={{ ...selectStyle, color: '#34d399' }}
                  >
                    {edgeLines.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.label}
                      </option>
                    ))}
                  </select>
                )}

                <input
                  type="number"
                  value={fovEstimate}
                  onChange={(e) => setFovEstimate(Number(e.target.value))}
                  title="Vertical FOV (degrees)"
                  style={{
                    width: 56,
                    background: '#0f172a',
                    color: '#fff',
                    border: '1px solid #334155',
                    borderRadius: 4,
                    padding: '0 6px',
                    fontSize: 12,
                  }}
                />
              </div>

              {/* Zoom Bar */}
              <div style={zoomBar}>
                <span style={{ fontSize: 11, color: toolMode === 'line' ? '#34d399' : '#facc15', fontWeight: 500 }}>
                  {toolMode === 'line'
                    ? pendingDot1
                      ? `Dot 1 set (${pendingDot1.u}, ${pendingDot1.v}) — click 2nd point along the pool edge`
                      : 'Click 2 dots along the selected water-level pool edge'
                    : 'Yellow node in 3D = active target • Wheel zoom (up to 1600%) • Drag pan'}
                </span>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button onClick={() => stepZoom(-1)} style={zoomBtn}>−</button>
                  <button
                    onClick={() => {
                      setZoom(1);
                      setPan({ x: 0, y: 0 });
                    }}
                    style={zoomBtn}
                  >
                    {Math.round(zoom * 100)}%
                  </button>
                  <button onClick={() => stepZoom(1)} style={zoomBtn}>+</button>
                  <button onClick={() => setZoom(8)} style={zoomBtn}>8x</button>
                  <button onClick={() => setZoom(16)} style={zoomBtn}>16x</button>
                </div>
              </div>

              {/* Zoomable Image Viewport with 3D Node Markers + 2-Dot Line Connectors */}
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
                  height: '54vh',
                  minHeight: 450,
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

                  {/* SVG Layer for 2-Dot Pool Edge Line Connectors */}
                  <svg
                    viewBox={`0 0 ${activePhoto.width} ${activePhoto.height}`}
                    style={{
                      position: 'absolute',
                      inset: 0,
                      width: '100%',
                      height: '100%',
                      zIndex: 8,
                      pointerEvents: 'none',
                    }}
                  >
                    {activeLines.map((line) => {
                      const isSel = toolMode === 'line' && line.lineId === selectedLineId;
                      const strokeColor = isSel ? '#facc15' : '#10b981';
                      const r = Math.max(4, (activePhoto.width / 160) / zoom);
                      const sw = Math.max(2, (activePhoto.width / 350) / zoom);

                      return (
                        <g key={line.id}>
                          <line
                            x1={line.p1.u}
                            y1={line.p1.v}
                            x2={line.p2.u}
                            y2={line.p2.v}
                            stroke={strokeColor}
                            strokeWidth={sw}
                          />
                          <circle cx={line.p1.u} cy={line.p1.v} r={r} fill={strokeColor} stroke="#fff" strokeWidth={sw * 0.5} />
                          <circle cx={line.p2.u} cy={line.p2.v} r={r} fill={strokeColor} stroke="#fff" strokeWidth={sw * 0.5} />
                        </g>
                      );
                    })}

                    {/* Pending Dot 1 while placing 2-dot line */}
                    {pendingDot1 && (
                      <circle
                        cx={pendingDot1.u}
                        cy={pendingDot1.v}
                        r={Math.max(5, (activePhoto.width / 140) / zoom)}
                        fill="#38bdf8"
                        stroke="#fff"
                        strokeWidth={Math.max(2, (activePhoto.width / 350) / zoom)}
                      />
                    )}
                  </svg>

                  {/* 3D Anchor Point Markers */}
                  {activePhoto.mappings.map((m, idx) => {
                    const isCurrentTarget = toolMode === 'point' && m.anchorId === selectedAnchorId;
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

              {/* Mapped Points & Edge Lines List */}
              <div style={{ maxHeight: 115, overflowY: 'auto', marginTop: 8, fontSize: 11 }}>
                {activeLines.map((l) => (
                  <div
                    key={l.id}
                    onClick={() => {
                      setToolMode('line');
                      setSelectedLineId(l.lineId);
                    }}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      padding: '2px 4px',
                      borderRadius: 3,
                      cursor: 'pointer',
                      color: '#34d399',
                      background:
                        toolMode === 'line' && l.lineId === selectedLineId
                          ? 'rgba(52, 211, 153, 0.15)'
                          : 'transparent',
                    }}
                  >
                    <span>
                      ╱ {l.label}: ({l.p1.u},{l.p1.v}) → ({l.p2.u},{l.p2.v})
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemoveLine(l.id);
                      }}
                      style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer' }}
                    >
                      ✕
                    </button>
                  </div>
                ))}

                {activePhoto.mappings.map((m, idx) => (
                  <div
                    key={m.id}
                    onClick={() => {
                      setToolMode('point');
                      setSelectedAnchorId(m.anchorId);
                    }}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      padding: '2px 4px',
                      borderRadius: 3,
                      cursor: 'pointer',
                      background:
                        toolMode === 'point' && m.anchorId === selectedAnchorId
                          ? 'rgba(250, 204, 21, 0.15)'
                          : 'transparent',
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
                  disabled={totalConstraints < 4 || isSolving}
                  style={{
                    flex: 1,
                    padding: 8,
                    background: totalConstraints >= 4 ? '#16a34a' : '#334155',
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

const sliderLabelStyle: React.CSSProperties = { fontSize: 10, color: '#94a3b8' };
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