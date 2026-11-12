import React, { useMemo } from 'react';
import { usePoolStore } from '../../store/usePoolStore';

// Interior divider color sequences (for ropes 1 .. laneCount - 1)
// In a 10-lane pool (lanes 0-9), ropes 4 and 5 frame the center lanes
const INTERIOR_ROPE_COLORS = [
  '#0284c7', // Rope 1 (between lane 0 & 1)
  '#0369a1', // Rope 2 (between lane 1 & 2)
  '#2563eb', // Rope 3 (between lane 2 & 3)
  '#f59e0b', // Rope 4 (center lane framing)
  '#f59e0b', // Rope 5 (center lane framing)
  '#f59e0b', // Rope 6 (center lane framing)
  '#0369a1', // Rope 7
  '#0284c7', // Rope 8
  '#0284c7', // Rope 9 (between lane 8 & 9)
];

export const LaneRopes: React.FC = () => {
  const { length, laneCount, laneWidth, laneColorScheme } = usePoolStore((s) => s.activePool);
  const totalRopes = Math.max(0, laneCount - 1);

  const ropeSegments = useMemo(() => {
    const segments: Array<{ x: number; length: number; color: string }> = [];
    const step = 0.5;

    for (let x = 0; x < length; x += step) {
      const mid = x + step / 2;
      let color = '#2563eb';

      if (mid <= 5.0 || mid >= 45.0) {
        color = '#ef4444';
      } else if ((mid >= 14.75 && mid <= 15.25) || (mid >= 34.75 && mid <= 35.25)) {
        color = '#dc2626';
      } else if (mid >= 24.5 && mid <= 25.5) {
        color = '#ffffff';
      }

      segments.push({ x: mid, length: step * 0.9, color });
    }
    return segments;
  }, [length]);

  return (
    <group>
      {Array.from({ length: totalRopes }).map((_, idx) => {
        // Interior ropes sit at 1 * laneWidth up to (laneCount - 1) * laneWidth
        const ropeNumber = idx + 1;
        const zPos = ropeNumber * laneWidth;
        const defaultColor =
          laneColorScheme === 'uniform_blue'
            ? '#2563eb'
            : INTERIOR_ROPE_COLORS[idx] || '#2563eb';

        return (
          <group key={`rope-${ropeNumber}`} position={[0, 0.04, zPos]}>
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