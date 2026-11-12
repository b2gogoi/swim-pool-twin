import React, { useState } from 'react';
import { PoolCanvas } from './components/PoolCanvas';
import { TelemetryOverlay } from './components/TelemetryOverlay';
import { CalibrationDrawer } from './components/CalibrationDrawer';
import { CalibratedPhotoMeta } from './types/calibration';

export const App: React.FC = () => {
  const [photos, setPhotos] = useState<CalibratedPhotoMeta[]>([]);
  const [activePhoto, setActivePhoto] = useState<CalibratedPhotoMeta | null>(null);
  const [snapRequest, setSnapRequest] = useState<{
    photo: CalibratedPhotoMeta;
    timestamp: number;
  } | null>(null);

  const handleSnapCameraToPhoto = (photo: CalibratedPhotoMeta) => {
    setActivePhoto(photo);
    setSnapRequest({ photo, timestamp: Date.now() });
  };

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden' }}>
      <TelemetryOverlay />
      <CalibrationDrawer
        photos={photos}
        setPhotos={setPhotos}
        activePhoto={activePhoto}
        setActivePhoto={setActivePhoto}
        onSnapCameraToPhoto={handleSnapCameraToPhoto}
      />
      <PoolCanvas
        photos={photos}
        activePhotoId={activePhoto?.id ?? null}
        onSelectPhoto={handleSnapCameraToPhoto}
        snapRequest={snapRequest}
      />
    </div>
  );
};

export default App;
