import React, { useEffect, useState } from 'react';
import { db, EventPhoto } from '../db/poolDatabase';

interface Props {
  photo: EventPhoto | null;
  opacity: number;
  onUnlock: () => void;
}

export const CameraViewfinderOverlay: React.FC<Props> = ({
  photo,
  opacity,
  onUnlock,
}) => {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [viewport, setViewport] = useState({
    w: window.innerWidth,
    h: window.innerHeight,
  });

  useEffect(() => {
    const onResize = () =>
      setViewport({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    let active = true;
    let url: string | null = null;

    if (!photo?.solvedCamera) {
      setImageUrl(null);
      return;
    }

    db.photoBlobs.get(photo.id).then((rec) => {
      if (!active || !rec) return;
      url = URL.createObjectURL(rec.blob);
      setImageUrl(url);
    });

    return () => {
      active = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [photo?.id, photo?.solvedCamera]);

  if (!photo?.solvedCamera || !imageUrl) return null;

  const photoAspect = photo.width / photo.height;
  const viewAspect = viewport.w / viewport.h;

  // Exact pixel box on screen matching the camera sensor's aspect ratio
  let frameW = viewport.w;
  let frameH = viewport.h;
  if (photoAspect > viewAspect) {
    frameW = viewport.w;
    frameH = viewport.w / photoAspect;
  } else {
    frameH = viewport.h;
    frameW = viewport.h * photoAspect;
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 6,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {/* Dimmed mask outside the camera's image boundary */}
      <div
        style={{
          position: 'relative',
          width: frameW,
          height: frameH,
          border: '2px solid #38bdf8',
          boxShadow: '0 0 0 9999px rgba(2, 6, 23, 0.65)',
          boxSizing: 'border-box',
        }}
      >
        {/* Translucent Photo Overlay (Default 10%) */}
        <img
          src={imageUrl}
          alt={photo.filename}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'fill',
            opacity,
            display: 'block',
          }}
        />

        {/* Optical Center Crosshair */}
        <div
          style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            width: 18,
            height: 18,
            transform: 'translate(-50%, -50%)',
            borderLeft: '1px solid rgba(56, 189, 248, 0.7)',
            borderTop: '1px solid rgba(56, 189, 248, 0.7)',
          }}
        />

        {/* Bottom Status Badge inside Image Boundary */}
        <div
          style={{
            position: 'absolute',
            bottom: 10,
            left: 12,
            background: 'rgba(15, 23, 42, 0.85)',
            border: '1px solid #38bdf8',
            borderRadius: 4,
            padding: '4px 10px',
            fontSize: 11,
            color: '#e2e8f0',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            pointerEvents: 'auto',
          }}
        >
          <span>
            <strong style={{ color: '#38bdf8' }}>LOCKED VIEW:</strong> {photo.filename} (
            {photo.width}×{photo.height}) • Err {photo.solvedCamera.reprojectionError}px
          </span>
          <span style={{ color: '#94a3b8' }}>Drag or scroll to exit</span>
          <button
            onClick={onUnlock}
            style={{
              background: '#1e293b',
              border: '1px solid #475569',
              color: '#fff',
              borderRadius: 3,
              padding: '1px 6px',
              fontSize: 10,
              cursor: 'pointer',
            }}
          >
            Exit View
          </button>
        </div>
      </div>
    </div>
  );
};