import React from 'react';
import { Html } from '@react-three/drei';
import { AnchorCoverageStat } from '../../utils/coverageAnalyzer';
import { usePoolStore } from '../../store/usePoolStore';

interface Props {
  anchors: AnchorCoverageStat[];
  visible: boolean;
  onSelectAnchor?: (anchorId: string) => void;
}

export const CoverageNodes3D: React.FC<Props> = ({
  anchors,
  visible,
  onSelectAnchor,
}) => {
  const selectedAnchorId = usePoolStore((s) => s.selectedAnchorId);

  if (!visible) return null;

  return (
    <group>
      {anchors.map((a) => {
        const isSelected = a.id === selectedAnchorId;
        const baseColor =
          a.status === 'multi'
            ? '#22c55e'
            : a.status === 'single'
            ? '#f59e0b'
            : '#ef4444';

        const color = isSelected ? '#facc15' : baseColor;
        const radius = isSelected ? 0.32 : a.status === 'uncovered' ? 0.15 : 0.21;

        return (
          <group
            key={a.id}
            position={[a.world.x, a.world.y + 0.14, a.world.z]}
            onClick={(e) => {
              e.stopPropagation();
              onSelectAnchor?.(a.id);
            }}
          >
            {/* Main Landmark Sphere */}
            <mesh renderOrder={20}>
              <sphereGeometry args={[radius, 20, 20]} />
              <meshStandardMaterial
                color={color}
                emissive={color}
                emissiveIntensity={isSelected ? 0.95 : 0.45}
                transparent
                opacity={isSelected ? 1 : a.status === 'uncovered' ? 0.65 : 0.95}
                depthTest={false}
              />
            </mesh>

            {/* High-Visibility Selection Halo Ring */}
            {isSelected && (
              <mesh rotation={[-Math.PI / 2, 0, 0]}>
                <ringGeometry args={[0.38, 0.52, 32]} />
                <meshBasicMaterial color="#fef08a" side={2} />
              </mesh>
            )}

            {/* Label Badge */}
            {(isSelected || a.observationCount > 0) && (
              <Html center distanceFactor={22} position={[0, isSelected ? 0.5 : 0.3, 0]}>
                <span
                  style={{
                    background: isSelected ? '#ca8a04' : '#0f172a',
                    color: '#fff',
                    fontSize: isSelected ? 11 : 10,
                    padding: '2px 6px',
                    borderRadius: 4,
                    border: `1.5px solid ${color}`,
                    fontWeight: 700,
                    whiteSpace: 'nowrap',
                    boxShadow: isSelected ? '0 0 10px rgba(250, 204, 21, 0.7)' : 'none',
                  }}
                >
                  {isSelected ? `TARGET: ${a.label}` : `${a.observationCount}×`}
                </span>
              </Html>
            )}
          </group>
        );
      })}
    </group>
  );
};