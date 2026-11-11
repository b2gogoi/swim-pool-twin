import React from 'react';
import { usePoolStore } from '../../store/usePoolStore';

export const PoolDeck: React.FC = () => {
  const { length, laneCount, laneWidth, deckBorder } = usePoolStore((s) => s.config);
  const poolWidth = laneCount * laneWidth;
  const totalLength = length + deckBorder * 2;
  const totalWidth = poolWidth + deckBorder * 2;

  return (
    <group position={[length / 2, -0.05, poolWidth / 2]}>
      {/* Surrounding Pool Deck Tile */}
      <mesh receiveShadow position={[0, -0.05, 0]}>
        <boxGeometry args={[totalLength, 0.1, totalWidth]} />
        <meshStandardMaterial color="#cbd5e1" roughness={0.7} />
      </mesh>

      {/* Starting Wall Curb / Bulkhead (X = 0) */}
      <mesh position={[-length / 2 - 0.25, 0.2, 0]}>
        <boxGeometry args={[0.5, 0.4, poolWidth]} />
        <meshStandardMaterial color="#94a3b8" />
      </mesh>

      {/* Turning Wall Curb (X = 50) */}
      <mesh position={[length / 2 + 0.25, 0.2, 0]}>
        <boxGeometry args={[0.5, 0.4, poolWidth]} />
        <meshStandardMaterial color="#94a3b8" />
      </mesh>
    </group>
  );
};
