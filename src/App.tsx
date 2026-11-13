import React, { useState, useEffect, useRef, useCallback } from 'react';
import { db, EventPhoto } from './db/poolDatabase';
import { usePoolStore } from './store/usePoolStore';
import { analyzePoolCoverage } from './utils/coverageAnalyzer';
import { getCv } from './utils/pnpSolver';
import { VenueEventPanel } from './components/VenueEventPanel';
import { CoverageSyncBar } from './components/CoverageSyncBar';
import { EventGalleryMapper } from './components/EventGalleryMapper';
import { PoolCanvas } from './components/PoolCanvas';
import { CameraViewfinderOverlay } from './components/CameraViewfinderOverlay';

export const App: React.FC = () => {
  const {
    activePool,
    activeEvent,
    showCoverage3D,
    setSelectedAnchorId,
  } = usePoolStore();

  const [eventPhotos, setEventPhotos] = useState<EventPhoto[]>([]);
  const [activePhoto, setActivePhoto] = useState<EventPhoto | null>(null);
  const [snapRequest, setSnapRequest] = useState<{
    photo: EventPhoto;
    timestamp: number;
  } | null>(null);

  const [activeLineId, setActiveLineId] = useState<string | null>(null);

  // Inside App() in src/App.tsx:
  const [lockedPhotoId, setLockedPhotoId] = useState<string | null>(null);
  const [overlayOpacity, setOverlayOpacity] = useState<number>(0.1);

  const lockedPhoto =
    eventPhotos.find((p) => p.id === lockedPhotoId) || null;

  const handleSnapCameraToPhoto = (photo: EventPhoto) => {
    setActivePhoto(photo);
    if (photo.solvedCamera) {
      setLockedPhotoId(photo.id);
      setOverlayOpacity(0.1); // Default 10% overlay on lock
    }
    setSnapRequest({ photo, timestamp: Date.now() });
  };

  const handleUnlockCamera = () => {
    setLockedPhotoId(null);
  };

  // Offline / Sync Worker State
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const [syncState, setSyncState] = useState<'idle' | 'syncing' | 'error'>('idle');
  const [pendingCount, setPendingCount] = useState<number>(0);
  const workerRef = useRef<Worker | null>(null);

  // Pre-warm OpenCV WASM runtime silently on boot
  useEffect(() => {
    getCv().catch(() => {});
  }, []);

  // Initialize Background Sync Web Worker
  useEffect(() => {
    const worker = new Worker(new URL('./workers/syncWorker.ts', import.meta.url), {
      type: 'module',
    });
    workerRef.current = worker;

    worker.onmessage = (e: MessageEvent) => {
      if (e.data?.type === 'SYNC_STATUS') {
        setSyncState(e.data.state);
        refreshPendingCount();
      }
    };

    const handleOnline = () => {
      setIsOnline(true);
      worker.postMessage({ type: 'TRIGGER_NOW' });
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      worker.terminate();
    };
  }, []);

  const refreshPendingCount = useCallback(async () => {
    const dirtyPools = await db.pools.where('syncStatus').equals('dirty').count();
    const dirtyEvents = await db.events.where('syncStatus').equals('dirty').count();
    const dirtyPhotos = await db.photos.where('syncStatus').equals('dirty').count();
    const unsyncedBlobs = await db.photos.filter((p) => !p.blobSynced).count();
    setPendingCount(dirtyPools + dirtyEvents + dirtyPhotos + unsyncedBlobs);
  }, []);

  const reloadEventPhotos = useCallback(async () => {
    refreshPendingCount();
    if (!activeEvent) {
      setEventPhotos([]);
      setActivePhoto(null);
      return;
    }
    const list = await db.photos
      .where('[poolId+eventId]')
      .equals([activePool.id, activeEvent.id])
      .toArray();
    setEventPhotos(list);
    setActivePhoto((prev) =>
      prev && list.some((item) => item.id === prev.id)
        ? list.find((item) => item.id === prev.id)!
        : list[0] || null
    );
  }, [activePool.id, activeEvent?.id, refreshPendingCount]);

  useEffect(() => {
    reloadEventPhotos();
  }, [reloadEventPhotos]);

  const coverage = analyzePoolCoverage(activePool, eventPhotos);

  const triggerSyncNow = () => {
    workerRef.current?.postMessage({ type: 'TRIGGER_NOW' });
  };

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden' }}>
      {/* Top-Left: Venue Configurator + Event Selector + 3D View Controls */}
      <VenueEventPanel
        onPoolOrEventChanged={reloadEventPhotos}
        onTriggerSync={triggerSyncNow}
      />

      {/* Top-Center: Offline Sync Indicator + 3D Multi-Photo Coverage Meter */}
      <CoverageSyncBar
        coverage={coverage}
        isOnline={isOnline}
        syncState={syncState}
        pendingCount={pendingCount}
        onSyncNow={triggerSyncNow}
        overlayOpacity={overlayOpacity}
        onChangeOverlayOpacity={setOverlayOpacity}
      />

      {/* Top-Right: Per-Event Photo Gallery + Zoomable Landmark Mapper */}
      <EventGalleryMapper
        photos={eventPhotos}
        activePhoto={activePhoto}
        setActivePhoto={setActivePhoto}
        onPhotosMutated={reloadEventPhotos}
        onSnapCameraToPhoto={handleSnapCameraToPhoto}
        activeLineId={activeLineId}
        setActiveLineId={setActiveLineId}
      />

      {/* Fullscreen 3D Pool Viewport with Solved Camera Frustums & 3D Coverage Spheres */}
      <CameraViewfinderOverlay
        photo={lockedPhoto}
        opacity={overlayOpacity}
        onUnlock={handleUnlockCamera}
      />

      <PoolCanvas
        photos={eventPhotos}
        activePhotoId={activePhoto?.id ?? null}
        lockedPhotoId={lockedPhotoId}
        onSelectPhoto={handleSnapCameraToPhoto}
        onUnlockCamera={handleUnlockCamera}
        snapRequest={snapRequest}
        coverageAnchors={coverage.anchors}
        showCoverage3D={showCoverage3D}
        onSelectCoverageAnchor={(anchorId: string) => setSelectedAnchorId(anchorId)}
        overlayOpacity={overlayOpacity}
        projectedPhoto={activePhoto?.solvedCamera ? activePhoto : null}
        activeLineId={activeLineId}
        activePhotoLines={activePhoto?.lineMappings || []}
      />
    </div>
  );
}

export default App;