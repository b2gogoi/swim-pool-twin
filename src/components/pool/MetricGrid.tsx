import React from 'react';
import { Text } from '@react-three/drei';
import { usePoolStore } from '../../store/usePoolStore';

export const MetricGrid: React.FC = () => {
  const { laneCount, laneWidth } = usePoolStore((s) => s.config);
  const showGrid = usePoolStore((s) => s.showGrid);
  const poolWidth = laneCount * laneWidth;

  if (!showGrid) return null;

  const keyDistances = [0, 5, 15, 25, 35, 45, 50];

  return (
    <group position={[0, 0.01, 0]}>
      {keyDistances.map((dist) => (
        <group key={`dist-${dist}`} position={[dist, 0, 0]}>
          {/* Transverse Meter Line */}
          <mesh position={[0, 0, poolWidth / 2]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[0.05, poolWidth]} />
            <meshBasicMaterial
              color={dist === 15 || dist === 35 ? '#ef4444' : '#38bdf8'}
              transparent
              opacity={0.6}
            />
          </mesh>

          {/* Metric Label on Deck */}
          <Text
            position={[0, 0.05, -0.7]}
            rotation={[-Math.PI / 2, 0, 0]}
            fontSize={0.45}
            color="#0f172a"
            anchorX="center"
            anchorY="middle"
          >
            {`${dist}m`}
          </Text>
        </group>
      ))}
    </group>
  );
};
