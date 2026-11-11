import React from 'react';
import { PoolCanvas } from './components/PoolCanvas';
import { TelemetryOverlay } from './components/TelemetryOverlay';

export const App: React.FC = () => {
  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden' }}>
      <TelemetryOverlay />
      <PoolCanvas />
    </div>
  );
};

export default App;
