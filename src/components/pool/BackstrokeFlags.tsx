import React from 'react';
import { usePoolStore } from '../../store/usePoolStore';

interface FlagLineProps {
  xPos: number;
}

const FlagLine: React.FC<FlagLineProps> = ({ xPos }) => {
  const { laneCount, laneWidth, flagHeight } = usePoolStore((s) => s.config);
  const poolWidth = laneCount * laneWidth;
  const flagSpacing = 0.6;
  const flagCount = Math.floor(poolWidth / flagSpacing);

  return (
    <group position={[xPos, 0, 0]}>
      {/* Deck Mounting Poles */}
      <mesh position={[0, flagHeight / 2, -0.6]}>
        <cylinderGeometry args={[0.03, 0.03, flagHeight, 16]} />
        <meshStandardMaterial color="#64748b" metalness={0.8} />
      </mesh>
      <mesh position={[0, flagHeight / 2, poolWidth + 0.6]}>
        <cylinderGeometry args={[0.03, 0.03, flagHeight, 16]} />
        <meshStandardMaterial color="#64748b" metalness={0.8} />
      </mesh>

      {/* Flag Line Cable */}
      <mesh
        position={[0, flagHeight, poolWidth / 2]}
        rotation={[Math.PI / 2, 0, 0]}
      >
        <cylinderGeometry args={[0.005, 0.005, poolWidth + 1.2, 8]} />
        <meshStandardMaterial color="#0f172a" />
      </mesh>

      {/* Triangular Pennants */}
      {Array.from({ length: flagCount }).map((_, fIdx) => {
        const z = fIdx * flagSpacing + flagSpacing / 2;
        const isAlternate = fIdx % 2 === 0;

        return (
          <mesh
            key={`flag-${fIdx}`}
            position={[0, flagHeight - 0.15, z]}
            rotation={[0, 0, Math.PI]}
          >
            <coneGeometry args={[0.12, 0.3, 3]} />
            <meshStandardMaterial
              color={isAlternate ? '#ef4444' : '#f59e0b'}
              roughness={0.4}
            />
          </mesh>
        );
      })}
    </group>
  );
};

export const BackstrokeFlags: React.FC = () => {
  const { length, flagDistance } = usePoolStore((s) => s.config);

  return (
    <group>
      <FlagLine xPos={flagDistance} />
      <FlagLine xPos={length - flagDistance} />
    </group>
  );
};
