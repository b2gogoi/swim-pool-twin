import React, { useMemo } from 'react';
import * as THREE from 'three';
import { usePoolStore } from '../../store/usePoolStore';

// World Aquatics lane color sequences (outer to center)
const LANE_COLORS = [
  '#0284c7', // 0-1
  '#0369a1',
  '#2563eb',
  '#f59e0b', // Center Lanes (4, 5)
  '#f59e0b',
  '#2563eb',
  '#0369a1',
  '#0284c7',
  '#0284c7',
  '#0284c7',
  '#0284c7',
];

export const LaneRopes: React.FC = () => {
  const { length, laneCount, laneWidth } = usePoolStore((s) => s.config);
  const totalRopes = laneCount + 1;

  // Generate segmented floats matching World Aquatics specs
  const ropeSegments = useMemo(() => {
    const segments: Array<{ x: number; length: number; color: string }> = [];
    const step = 0.5;

    for (let x = 0; x < length; x += step) {
      const mid = x + step / 2;
      let color = '#2563eb'; // Default lane float color

      // Solid red at start and turn ends (0-5m and 45-50m)
      if (mid <= 5.0 || mid >= 45.0) {
        color = '#ef4444';
      }
      // 15m breakout indicator floats
      else if ((mid >= 14.75 && mid <= 15.25) || (mid >= 34.75 && mid <= 35.25)) {
        color = '#dc2626';
      }
      // 25m midpoint indicator floats
      else if (mid >= 24.5 && mid <= 25.5) {
        color = '#ffffff';
      }

      segments.push({ x: mid, length: step * 0.9, color });
    }
    return segments;
  }, [length]);

  return (
    <group>
      {Array.from({ length: totalRopes }).map((_, rIdx) => {
        const zPos = rIdx * laneWidth;
        const defaultColor = LANE_COLORS[rIdx] || '#2563eb';

        return (
          <group key={`rope-${rIdx}`} position={[0, 0.04, zPos]}>
            {ropeSegments.map((seg, sIdx) => (
              <mesh
                key={sIdx}
                position={[seg.x, 0, 0]}
                rotation={[0, 0, Math.PI / 2]}
              >
                <cylinderGeometry args={[0.045, 0.045, seg.length, 8]} />
                <meshStandardMaterial
                  color={seg.color === '#2563eb' ? defaultColor : seg.color}
                  roughness={0.3}
                />
              </mesh>
            ))}
          </group>
        );
      })}
    </group>
  );
};
