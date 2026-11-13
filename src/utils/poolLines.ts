import { PoolConfig } from '../types/pool';
import { LandmarkMapping } from '../db/poolDatabase';

export interface PoolLinePreset {
  id: string;
  label: string;
  axis: 'x' | 'z'; // Which coordinate varies along the edge
  start: { x: number; y: number; z: number };
  end: { x: number; y: number; z: number };
}

export interface LineMapping {
  id: string;
  lineId: string;
  label: string;
  p1: { u: number; v: number };
  p2: { u: number; v: number };
}

export function getPoolEdgeLines(config: PoolConfig): PoolLinePreset[] {
  const { length, laneCount, laneWidth } = config;
  const maxW = laneCount * laneWidth;
  const yWater = 0.04;

  return [
    {
      id: 'edge_near_z0',
      label: `Near Side Edge (Z = 0m, Y = 0.04m)`,
      axis: 'x',
      start: { x: 0, y: yWater, z: 0 },
      end: { x: length, y: yWater, z: 0 },
    },
    {
      id: 'edge_far_zmax',
      label: `Far Side Edge (Z = ${maxW}m, Y = 0.04m)`,
      axis: 'x',
      start: { x: 0, y: yWater, z: maxW },
      end: { x: length, y: yWater, z: maxW },
    },
    {
      id: 'edge_start_x0',
      label: `Start Wall Edge (X = 0m, Y = 0.04m)`,
      axis: 'z',
      start: { x: 0, y: yWater, z: 0 },
      end: { x: 0, y: yWater, z: maxW },
    },
    {
      id: 'edge_turn_xmax',
      label: `Turn Wall Edge (X = ${length}m, Y = 0.04m)`,
      axis: 'z',
      start: { x: length, y: yWater, z: 0 },
      end: { x: length, y: yWater, z: maxW },
    },
  ];
}

/**
 * Projects a 3D line segment onto the current solved camera (if available) to find the
 * exact 3D coordinate along the pool wall corresponding to any clicked pixel (u, v),
 * or falls back to proportional span along the wall so PnP receives accurate 3D points.
 */
export function expandLinesToPnPMappings(
  lines: LineMapping[],
  presets: PoolLinePreset[],
  solvedCamera?: {
    position: [number, number, number];
    quaternion: [number, number, number, number];
    fov: number;
  },
  imageWidth = 1920,
  imageHeight = 1080
): LandmarkMapping[] {
  const synthetic: LandmarkMapping[] = [];

  for (const line of lines) {
    const preset = presets.find((p) => p.id === line.lineId);
    if (!preset) continue;

    // Sample 3 collinear points along the 2-dot user segment (start, midpoint, end)
    const samples = [0, 0.5, 1];
    samples.forEach((t, idx) => {
      const u = Math.round(line.p1.u + (line.p2.u - line.p1.u) * t);
      const v = Math.round(line.p1.v + (line.p2.v - line.p1.v) * t);

      // Estimate 3D coordinate along the pool edge line
      let world = {
        x: preset.start.x + (preset.end.x - preset.start.x) * t,
        y: preset.start.y,
        z: preset.start.z + (preset.end.z - preset.start.z) * t,
      };

      // If we have an initial camera estimate, intersect the pixel ray with the exact
      // pool edge line (closest point on the 3D wall line to the camera ray)
      if (solvedCamera) {
        const camPos = solvedCamera.position;
        const fovRad = (solvedCamera.fov * Math.PI) / 180;
        const fy = imageHeight / (2 * Math.tan(fovRad / 2));
        const fx = fy;
        const cx = imageWidth / 2;
        const cy = imageHeight / 2;

        // Ray in OpenCV camera coordinates (+X right, +Y down, +Z forward)
        const rx = (u - cx) / fx;
        const ry = (v - cy) / fy;
        const rz = 1;

        // Rotate ray into Three.js world space
        const [qx, qy, qz, qw] = solvedCamera.quaternion;
        // Convert CV ray (rx, -ry, -rz) by quaternion q
        const vx = rx;
        const vy = -ry;
        const vz = -rz;

        const ix = qw * vx + qy * vz - qz * vy;
        const iy = qw * vy + qz * vx - qx * vz;
        const iz = qw * vz + qx * vy - qy * vx;
        const iw = -qx * vx - qy * vy - qz * vz;

        const dx = ix * qw + iw * -qx + iy * -qz - iz * -qy;
        const dy = iy * qw + iw * -qy + iz * -qx - ix * -qz;
        const dz = iz * qw + iw * -qz + ix * -qy - iy * -qx;

        // Intersect ray with horizontal water plane Y = preset.start.y (0.04m)
        if (Math.abs(dy) > 1e-4) {
          const s = (preset.start.y - camPos[1]) / dy;
          if (s > 0.2 && s < 150) {
            const hitX = camPos[0] + dx * s;
            const hitZ = camPos[2] + dz * s;
            if (preset.axis === 'x') {
              const clampedX = Math.max(
                Math.min(preset.start.x, preset.end.x),
                Math.min(Math.max(preset.start.x, preset.end.x), hitX)
              );
              world = { x: Number(clampedX.toFixed(3)), y: preset.start.y, z: preset.start.z };
            } else {
              const clampedZ = Math.max(
                Math.min(preset.start.z, preset.end.z),
                Math.min(Math.max(preset.start.z, preset.end.z), hitZ)
              );
              world = { x: preset.start.x, y: preset.start.y, z: Number(clampedZ.toFixed(3)) };
            }
          }
        }
      }

      synthetic.push({
        id: `${line.id}_pt_${idx}`,
        anchorId: `${line.lineId}_pt_${idx}`,
        label: `${line.label} [${idx + 1}/3]`,
        pixel: { u, v },
        world,
      });
    });
  }

  return synthetic;
}