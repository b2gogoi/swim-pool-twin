import React from 'react';
import { usePoolStore } from '../../store/usePoolStore';

export const PoolLadders: React.FC = () => {
  const { length, laneCount, laneWidth } = usePoolStore((s) => s.activePool);
  const poolWidth = laneCount * laneWidth;
  const centerX = length / 2; // 25.0m
  const halfWidth = 0.3;      // 60cm wide -> +/- 0.30m from 25m
  const railOffsets = [-halfWidth, halfWidth];
  const rungHeights = [-0.25, -0.55, -0.85, -1.15];

  const sides = [
    { key: 'near', zEdge: 0, deckDir: -1 },
    { key: 'far', zEdge: poolWidth, deckDir: 1 },
  ];

  return (
    <group>
      {sides.map(({ key, zEdge, deckDir }) => {
        const innerZ = zEdge - deckDir * 0.06; // Just inside pool wall
        const outerZ = zEdge + deckDir * 0.42; // Anchored into pool deck

        return (
          <group key={`ladder-${key}`}>
            {/* Left (24.70m) & Right (25.30m) Uprights + Deck Loops */}
            {railOffsets.map((dx, rIdx) => {
              const railX = centerX + dx;
              return (
                <group key={rIdx} position={[railX, 0, 0]}>
                  {/* Vertical In-Pool Rail */}
                  <mesh position={[0, -0.35, innerZ]} castShadow>
                    <cylinderGeometry args={[0.022, 0.022, 2.0, 12]} />
                    <meshStandardMaterial color="#cbd5e1" metalness={0.85} roughness={0.2} />
                  </mesh>

                  {/* Top Horizontal Gooseneck Bridge */}
                  <mesh
                    position={[0, 0.65, (innerZ + outerZ) / 2]}
                    rotation={[Math.PI / 2, 0, 0]}
                    castShadow
                  >
                    <cylinderGeometry args={[0.022, 0.022, Math.abs(outerZ - innerZ), 12]} />
                    <meshStandardMaterial color="#cbd5e1" metalness={0.85} roughness={0.2} />
                  </mesh>

                  {/* Rear Deck Anchor Post (Y = 0 to 0.65m) */}
                  <mesh position={[0, 0.325, outerZ]} castShadow>
                    <cylinderGeometry args={[0.022, 0.022, 0.65, 12]} />
                    <meshStandardMaterial color="#cbd5e1" metalness={0.85} roughness={0.2} />
                  </mesh>

                  {/* Deck Flange Escutcheon */}
                  <mesh position={[0, 0.01, outerZ]}>
                    <cylinderGeometry args={[0.055, 0.065, 0.02, 16]} />
                    <meshStandardMaterial color="#94a3b8" metalness={0.7} roughness={0.3} />
                  </mesh>
                </group>
              );
            })}

            {/* Horizontal Steps (60cm wide) */}
            {rungHeights.map((yPos, sIdx) => (
              <mesh
                key={sIdx}
                position={[centerX, yPos, innerZ]}
                rotation={[0, 0, Math.PI / 2]}
              >
                <cylinderGeometry args={[0.018, 0.018, 0.6, 12]} />
                <meshStandardMaterial color="#e2e8f0" metalness={0.8} roughness={0.25} />
              </mesh>
            ))}
          </group>
        );
      })}
    </group>
  );
};