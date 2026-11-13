import React from 'react';
import { usePoolStore } from '../../store/usePoolStore';
import { getPoolEdgeLines, LineMapping } from '../../utils/poolLines';

interface Props {
  activeLineId: string | null;
  mappedLines: LineMapping[];
}

export const CalibrationLines3D: React.FC<Props> = ({
  activeLineId,
  mappedLines,
}) => {
  const activePool = usePoolStore((s) => s.activePool);
  const presets = getPoolEdgeLines(activePool);
  const mappedIds = new Set(mappedLines.map((l) => l.lineId));

  return (
    <group>
      {presets.map((line) => {
        const isSelected = line.id === activeLineId;
        const isMapped = mappedIds.has(line.id);
        if (!isSelected && !isMapped) return null;

        const cx = (line.start.x + line.end.x) / 2;
        const cy = line.start.y + 0.015;
        const cz = (line.start.z + line.end.z) / 2;
        const span = Math.hypot(
          line.end.x - line.start.x,
          line.end.z - line.start.z
        );
        const rotY = line.axis === 'x' ? 0 : Math.PI / 2;
        const color = isSelected ? '#facc15' : '#22c55e';

        return (
          <mesh
            key={line.id}
            position={[cx, cy, cz]}
            rotation={[0, rotY, Math.PI / 2]}
            renderOrder={18}
          >
            <cylinderGeometry args={[isSelected ? 0.045 : 0.03, isSelected ? 0.045 : 0.03, span, 12]} />
            <meshStandardMaterial
              color={color}
              emissive={color}
              emissiveIntensity={isSelected ? 0.9 : 0.5}
              depthTest={false}
              transparent
              opacity={0.9}
            />
          </mesh>
        );
      })}
    </group>
  );
};