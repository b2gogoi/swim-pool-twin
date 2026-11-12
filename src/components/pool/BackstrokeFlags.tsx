import React, { useMemo } from 'react';
import { usePoolStore } from '../../store/usePoolStore';

export const BackstrokeFlags: React.FC = () => {
  const { length, flagDistance, laneCount, laneWidth, flagHeight } = usePoolStore(
    (s) => s.activePool
  );
  const poolWidth = laneCount * laneWidth;

  const flagPositions = useMemo(() => {
    const count = Math.floor(poolWidth / 0.35);
    return Array.from({ length: count }).map((_, i) => (i + 0.5) * (poolWidth / count));
  }, [poolWidth]);

  // 5m & 45m have backstroke flags; 15m & 35m have white rope only (no flags)
  const poleLines = [
    { x: flagDistance, hasFlags: true },
    { x: length - flagDistance, hasFlags: true },
    { x: 15, hasFlags: false },
    { x: length - 15, hasFlags: false },
  ];

  return (
    <group>
      {poleLines.map(({ x: xPos, hasFlags }, idx) => (
        <group key={`pole-line-${idx}`}>
          {/* Near & Far Stanchion Poles */}
          {[-0.6, poolWidth + 0.6].map((zPos, pIdx) => (
            <mesh key={pIdx} position={[xPos, flagHeight / 2, zPos]} castShadow>
              <cylinderGeometry args={[0.04, 0.04, flagHeight, 12]} />
              <meshStandardMaterial color="#94a3b8" metalness={0.6} roughness={0.3} />
            </mesh>
          ))}

          {/* Overhead White Line */}
          <mesh position={[xPos, flagHeight, poolWidth / 2]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.014, 0.014, poolWidth + 1.2, 8]} />
            <meshStandardMaterial color="#ffffff" roughness={0.4} />
          </mesh>

          {/* Triangular Pennants (Only on 5m & 45m lines) */}
          {hasFlags &&
            flagPositions.map((z, fIdx) => (
              <mesh
                key={fIdx}
                position={[xPos, flagHeight - 0.14, z]}
                rotation={[0, Math.PI / 2, Math.PI]}
              >
                <coneGeometry args={[0.1, 0.28, 3]} />
                <meshStandardMaterial
                  color={fIdx % 2 === 0 ? '#ef4444' : '#ffffff'}
                  side={2}
                />
              </mesh>
            ))}
        </group>
      ))}
    </group>
  );
};