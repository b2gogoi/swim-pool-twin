import React from 'react';
import { usePoolStore } from '../../store/usePoolStore';

export const WaterSurface: React.FC = () => {
  const { length, laneCount, laneWidth } = usePoolStore((s) => s.config);
  const poolWidth = laneCount * laneWidth;

  return (
    <group position={[length / 2, 0, poolWidth / 2]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[length, poolWidth]} />
        <meshPhysicalMaterial
          color="#0066aa"
          transmission={0.65}
          opacity={0.9}
          transparent
          roughness={0.1}
          metalness={0.1}
          reflectivity={0.9}
        />
      </mesh>
    </group>
  );
};
