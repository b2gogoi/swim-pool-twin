import React from 'react';
import { Text } from '@react-three/drei';
import { usePoolStore } from '../../store/usePoolStore';

export const StartingBlocks: React.FC = () => {
  const pool = usePoolStore((s) => s.activePool);
  const { length, laneCount, laneWidth } = pool;
  const ends = [
    ...(pool.startingBlocksAtStart === false ? [] : [{ key: 'start', x: -0.45, rotation: 0 }]),
    ...(pool.startingBlocksAtTurn ? [{ key: 'turn', x: length + 0.45, rotation: Math.PI }] : []),
  ];

  return (
    <group>
      {ends.map((end) => (
        <group key={end.key} position={[end.x, 0, 0]}>
          {Array.from({ length: laneCount }).map((_, idx) => {
            const laneNumber = idx + (laneCount === 10 ? 0 : 1);
            const zPos = idx * laneWidth + laneWidth / 2;

            return (
              <group key={`${end.key}-block-${laneNumber}`} position={[0, 0, zPos]} rotation={[0, end.rotation, 0]}>
                {/* Pedestal Base */}
                <mesh position={[0, 0.25, 0]}>
                  <boxGeometry args={[0.5, 0.5, 0.5]} />
                  <meshStandardMaterial color="#0f172a" roughness={0.3} />
                </mesh>

                {/* Angled Starting Platform: Slopes toward the pool center. */}
                <group position={[0.05, 0.52, 0]} rotation={[0, 0, -0.16]}>
                  <mesh>
                    <boxGeometry args={[0.55, 0.04, 0.5]} />
                    <meshStandardMaterial color="#0284c7" />
                  </mesh>

                  {/* Wedge / Kick-Plate positioned at the rear of the block */}
                  <mesh position={[-0.15, 0.05, 0]}>
                    <boxGeometry args={[0.12, 0.08, 0.44]} />
                    <meshStandardMaterial color="#e2e8f0" />
                  </mesh>
                </group>

                {/* Lane Number Display on Pedestal */}
                <Text
                  position={[0.26, 0.25, 0]}
                  rotation={[0, Math.PI / 2, 0]}
                  fontSize={0.24}
                  color="#ffffff"
                  anchorX="center"
                  anchorY="middle"
                >
                  {laneNumber.toString()}
                </Text>
              </group>
            );
          })}
        </group>
      ))}
    </group>
  );
};
