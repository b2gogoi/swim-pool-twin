import React, { useState, useEffect, useRef } from 'react';
import {
  savePhotoOffline,
  getAllPhotoMeta,
  getPhotoObjectUrl,
  updatePhotoMeta,
  deletePhotoOffline,
} from '../storage/mediaDb';
import { CalibratedPhotoMeta, LandmarkCorrespondence } from '../types/calibration';
import { getPoolAnchors } from '../utils/poolLandmarks';
import { solvePhotoCameraPose } from '../utils/pnpSolver';
import { usePoolStore } from '../store/usePoolStore';

interface Props {
  photos: CalibratedPhotoMeta[];
  setPhotos: React.Dispatch<React.SetStateAction<CalibratedPhotoMeta[]>>;
  activePhoto: CalibratedPhotoMeta | null;
  setActivePhoto: (p: CalibratedPhotoMeta | null) => void;
  onSnapCameraToPhoto: (photo: CalibratedPhotoMeta) => void;
}

export const CalibrationDrawer: React.FC<Props> = ({
  photos,
  setPhotos,
  activePhoto,
  setActivePhoto,
  onSnapCameraToPhoto,
}) => {
  const config = usePoolStore((s) => s.config);
  const anchors = getPoolAnchors(config);

  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [selectedAnchorId, setSelectedAnchorId] = useState<string>(anchors[0]?.id || '');
  const [fovEstimate, setFovEstimate] = useState<number>(52);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Zoom & Pan State
  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [isSolving, setIsSolving] = useState(false);

  const viewportRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const dragStartRef = useRef<{ x: number; y: number; panX: number; panY: number }>({
    x: 0,
    y: 0,
    panX: 0,
    panY: 0,
  });
  const didDragRef = useRef<boolean>(false);

  // Load saved photos from IndexedDB on mount
  useEffect(() => {
    getAllPhotoMeta().then(setPhotos);
  }, [setPhotos]);

  // Reset zoom/pan and load Blob URL when activePhoto changes
  useEffect(() => {
    let active = true;
    setZoom(1);
    setPan({ x: 0, y: 0 });

    if (!activePhoto) {
      setImageUrl(null);
      return;
    }
    getPhotoObjectUrl(activePhoto.id).then((url) => {
      if (active) setImageUrl(url);
    });
    return () => {
      active = false;
      if (imageUrl) URL.revokeObjectURL(imageUrl);
    };
  }, [activePhoto?.id]);

  const handleSolvePose = async () => {
    if (!activePhoto || isSolving) return;
    setErrorMsg(null);
    setIsSolving(true);
    try {
      const solvedCamera = await solvePhotoCameraPose(
        activePhoto.width,
        activePhoto.height,
        activePhoto.correspondences,
        fovEstimate
      );
      const updated: CalibratedPhotoMeta = { ...activePhoto, solvedCamera };
      await updatePhotoMeta(updated);
      setActivePhoto(updated);
      setPhotos((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
      onSnapCameraToPhoto(updated);
    } catch (err: any) {
      setErrorMsg(err.message || 'Calibration error');
    } finally {
      setIsSolving(false);
    }
  };
  

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;
    const files = Array.from(e.target.files);
    const saved: CalibratedPhotoMeta[] = [];
    for (const file of files) {
      const meta = await savePhotoOffline(file);
      saved.push(meta);
    }
    const updatedList = [...photos, ...saved];
    setPhotos(updatedList);
    if (!activePhoto && saved.length > 0) {
      setActivePhoto(saved[0]);
    }
  };

  // Cursor-centered scroll wheel zoom
  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (!viewportRef.current) return;

    const rect = viewportRef.current.getBoundingClientRect();
    const cursorX = e.clientX - rect.left;
    const cursorY = e.clientY - rect.top;

    const zoomFactor = e.deltaY < 0 ? 1.25 : 0.8;
    const nextZoom = Math.min(8, Math.max(1, Number((zoom * zoomFactor).toFixed(2))));

    if (nextZoom === 1) {
      setZoom(1);
      setPan({ x: 0, y: 0 });
      return;
    }

    // Keep the image point under the cursor stationary while scaling
    const scaleRatio = nextZoom / zoom;
    const nextPanX = cursorX - (cursorX - pan.x) * scaleRatio;
    const nextPanY = cursorY - (cursorY - pan.y) * scaleRatio;

    setZoom(nextZoom);
    setPan({ x: nextPanX, y: nextPanY });
  };

  const adjustZoomButton = (delta: number) => {
    const nextZoom = Math.min(8, Math.max(1, Number((zoom + delta).toFixed(2))));
    if (nextZoom === 1) {
      setZoom(1);
      setPan({ x: 0, y: 0 });
    } else {
      setZoom(nextZoom);
    }
  };

  const resetZoom = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  // Drag-to-pan handlers
  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    setIsDragging(true);
    didDragRef.current = false;
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      panX: pan.x,
      panY: pan.y,
    };
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;

    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) {
      didDragRef.current = true;
    }

    if (zoom > 1) {
      setPan({
        x: dragStartRef.current.panX + dx,
        y: dragStartRef.current.panY + dy,
      });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Map click position on zoomed/panned <img> back to native pixel coordinates (u, v)
  const handleImageClick = async (e: React.MouseEvent<HTMLImageElement>) => {
    // Ignore click if the user was dragging to pan
    if (didDragRef.current) {
      didDragRef.current = false;
      return;
    }
    if (!activePhoto || !imgRef.current) return;

    const rect = imgRef.current.getBoundingClientRect();
    const scaleX = activePhoto.width / rect.width;
    const scaleY = activePhoto.height / rect.height;

    const u = Math.round((e.clientX - rect.left) * scaleX);
    const v = Math.round((e.clientY - rect.top) * scaleY);

    const anchor = anchors.find((a) => a.id === selectedAnchorId);
    if (!anchor) return;

    const newPoint: LandmarkCorrespondence = {
      id: crypto.randomUUID(),
      label: anchor.label,
      pixel: { u, v },
      world: anchor.world,
    };

    const filtered = activePhoto.correspondences.filter((c) => c.label !== anchor.label);
    const updated: CalibratedPhotoMeta = {
      ...activePhoto,
      correspondences: [...filtered, newPoint],
    };

    await updatePhotoMeta(updated);
    setActivePhoto(updated);
    setPhotos((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
  };

 /*  const handleSolvePose = async () => {
    if (!activePhoto) return;
    setErrorMsg(null);
    try {
      const solvedCamera = await solvePhotoCameraPose(
        activePhoto.width,
        activePhoto.height,
        activePhoto.correspondences,
        fovEstimate
      );
      const updated: CalibratedPhotoMeta = { ...activePhoto, solvedCamera };
      await updatePhotoMeta(updated);
      setActivePhoto(updated);
      setPhotos((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
      onSnapCameraToPhoto(updated);
    } catch (err: any) {
      setErrorMsg(err.message || 'Calibration error');
    }
  }; */

  const handleRemovePoint = async (ptId: string) => {
    if (!activePhoto) return;
    const updated: CalibratedPhotoMeta = {
      ...activePhoto,
      correspondences: activePhoto.correspondences.filter((c) => c.id !== ptId),
    };
    await updatePhotoMeta(updated);
    setActivePhoto(updated);
    setPhotos((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
  };

  const handleDeletePhoto = async (id: string) => {
    await deletePhotoOffline(id);
    const next = photos.filter((p) => p.id !== id);
    setPhotos(next);
    if (activePhoto?.id === id) setActivePhoto(next[0] || null);
  };

  return (
    <div style={panelStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <strong style={{ fontSize: 14 }}>Competition Photos (Offline IndexedDB)</strong>
        <label style={uploadBtnStyle}>
          + Upload Photos
          <input
            type="file"
            accept="image/*"
            multiple
            onChange={handleUpload}
            style={{ display: 'none' }}
          />
        </label>
      </div>

      {/* Photo Strip */}
      <div style={{ display: 'flex', gap: 6, overflowX: 'auto', padding: '8px 0' }}>
        {photos.map((p) => (
          <div
            key={p.id}
            onClick={() => setActivePhoto(p)}
            style={{
              padding: '4px 8px',
              borderRadius: 4,
              fontSize: 12,
              cursor: 'pointer',
              background: activePhoto?.id === p.id ? '#0284c7' : '#1e293b',
              border: p.solvedCamera ? '1px solid #22c55e' : '1px solid #334155',
              whiteSpace: 'nowrap',
            }}
          >
            {p.name} {p.solvedCamera ? '✓' : `(${p.correspondences.length}/4)`}
          </div>
        ))}
      </div>

      {/* Active Photo Calibration Canvas */}
      {activePhoto && imageUrl && (
        <div style={{ marginTop: 8 }}>
          <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
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
              title="Camera Vertical FOV (degrees)"
              style={{
                width: 54,
                background: '#0f172a',
                color: '#fff',
                border: '1px solid #334155',
                borderRadius: 4,
                padding: '0 6px',
                fontSize: 12,
              }}
            />
          </div>

          {/* Zoom Controls Bar */}
          <div style={zoomBarStyle}>
            <span style={{ fontSize: 11, color: '#94a3b8' }}>
              Scroll to zoom • Drag to pan • Click to mark
            </span>
            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              <button onClick={() => adjustZoomButton(-0.5)} style={zoomBtnStyle} title="Zoom Out">
                −
              </button>
              <button onClick={resetZoom} style={zoomBtnStyle} title="Reset Zoom">
                {Math.round(zoom * 100)}%
              </button>
              <button onClick={() => adjustZoomButton(0.5)} style={zoomBtnStyle} title="Zoom In">
                +
              </button>
            </div>
          </div>

          {/* Zoomable & Pannable Viewport */}
          <div
            ref={viewportRef}
            onWheel={handleWheel}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            style={{
              position: 'relative',
              width: '100%',
              maxHeight: 320,
              overflow: 'hidden',
              borderRadius: 6,
              border: '1px solid #334155',
              background: '#020617',
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
                alt={activePhoto.name}
                draggable={false}
                onClick={handleImageClick}
                style={{
                  width: '100%',
                  display: 'block',
                  cursor: isDragging && zoom > 1 ? 'grabbing' : 'crosshair',
                }}
              />

              {/* Marker Dots (inversely scaled so pins stay sharp at high zoom) */}
              {activePhoto.correspondences.map((c, idx) => (
                <div
                  key={c.id}
                  title={c.label}
                  style={{
                    position: 'absolute',
                    left: `${(c.pixel.u / activePhoto.width) * 100}%`,
                    top: `${(c.pixel.v / activePhoto.height) * 100}%`,
                    transform: `translate(-50%, -50%) scale(${1 / zoom})`,
                    width: 14,
                    height: 14,
                    borderRadius: '50%',
                    background: '#ef4444',
                    border: '2px solid #fff',
                    color: '#fff',
                    fontSize: 9,
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    pointerEvents: 'none',
                  }}
                >
                  {idx + 1}
                </div>
              ))}
            </div>
          </div>

          {/* Correspondence List */}
          <div style={{ maxHeight: 110, overflowY: 'auto', marginTop: 8, fontSize: 11 }}>
            {activePhoto.correspondences.map((c, idx) => (
              <div
                key={c.id}
                style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}
              >
                <span>
                  #{idx + 1} {c.label} → ({c.pixel.u}, {c.pixel.v})
                </span>
                <button
                  onClick={() => handleRemovePoint(c.id)}
                  style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer' }}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>

          {errorMsg && (
            <div style={{ color: '#f87171', fontSize: 11, marginTop: 4 }}>{errorMsg}</div>
          )}

          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
          <button
              onClick={handleSolvePose}
              disabled={activePhoto.correspondences.length < 4 || isSolving}
              style={{
                flex: 1,
                padding: '6px',
                background: activePhoto.correspondences.length >= 4 ? '#16a34a' : '#334155',
                color: '#fff',
                border: 'none',
                borderRadius: 4,
                cursor: isSolving ? 'wait' : 'pointer',
                fontWeight: 600,
              }}
            >
              {isSolving ? 'Initializing OpenCV & Solving...' : 'Solve 3D Camera Position'}
            </button>

            <button
              onClick={() => handleDeletePhoto(activePhoto.id)}
              style={{
                padding: '6px 10px',
                background: '#7f1d1d',
                color: '#fff',
                border: 'none',
                borderRadius: 4,
                cursor: 'pointer',
              }}
            >
              Delete
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

const panelStyle: React.CSSProperties = {
  position: 'absolute',
  top: 16,
  right: 16,
  width: 420,
  background: 'rgba(15, 23, 42, 0.9)',
  backdropFilter: 'blur(8px)',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 8,
  padding: 14,
  color: '#e2e8f0',
  zIndex: 10,
  fontFamily: 'Inter, system-ui, sans-serif',
};

const uploadBtnStyle: React.CSSProperties = {
  background: '#0284c7',
  color: '#fff',
  padding: '4px 10px',
  borderRadius: 4,
  fontSize: 12,
  cursor: 'pointer',
  fontWeight: 600,
};

const selectStyle: React.CSSProperties = {
  flex: 1,
  background: '#0f172a',
  color: '#e2e8f0',
  border: '1px solid #334155',
  borderRadius: 4,
  padding: '4px 6px',
  fontSize: 12,
};

const zoomBarStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: 4,
  padding: '2px 4px',
  background: '#0f172a',
  borderRadius: 4,
};

const zoomBtnStyle: React.CSSProperties = {
  background: '#1e293b',
  border: '1px solid #334155',
  color: '#e2e8f0',
  borderRadius: 3,
  padding: '1px 7px',
  fontSize: 11,
  cursor: 'pointer',
};
