import { PoolConfig } from '../types/pool';
import { LandmarkMapping } from '../db/poolDatabase';

export interface PoolLinePreset {
  id: string;
  label: string;
  axis: 'x' | 'z';
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
      label: `Near Side Edge — Partial or Full (Z = 0m, Y = 0.04m)`,
      axis: 'x',
      start: { x: 0, y: yWater, z: 0 },
      end: { x: length, y: yWater, z: 0 },
    },
    {
      id: 'edge_far_zmax',
      label: `Far Side Edge — Partial or Full (Z = ${maxW}m, Y = 0.04m)`,
      axis: 'x',
      start: { x: 0, y: yWater, z: maxW },
      end: { x: length, y: yWater, z: maxW },
    },
    {
      id: 'edge_start_x0',
      label: `Start Wall Edge — Partial or Full (X = 0m, Y = 0.04m)`,
      axis: 'z',
      start: { x: 0, y: yWater, z: 0 },
      end: { x: 0, y: yWater, z: maxW },
    },
    {
      id: 'edge_turn_xmax',
      label: `Turn Wall Edge — Partial or Full (X = ${length}m, Y = 0.04m)`,
      axis: 'z',
      start: { x: length, y: yWater, z: 0 },
      end: { x: length, y: yWater, z: maxW },
    },
  ];
}

/**
 * Intersects a pixel (u, v) ray from `solvedCamera` with the horizontal water plane (Y = 0.04m)
 * and projects onto the exact canonical pool wall line (`Z = const` or `X = const`),
 * supporting any arbitrary partial segment of the edge visible in frame.
 */
function raycastPixelOntoPoolWall(
  u: number,
  v: number,
  preset: PoolLinePreset,
  solvedCamera: {
    position: [number, number, number];
    quaternion: [number, number, number, number];
    fov: number;
  },
  imageWidth: number,
  imageHeight: number
): { x: number; y: number; z: number } | null {
  const camPos = solvedCamera.position;
  const fovRad = (solvedCamera.fov * Math.PI) / 180;
  const fy = imageHeight / (2 * Math.tan(fovRad / 2));
  const fx = fy;
  const cx = imageWidth / 2;
  const cy = imageHeight / 2;

  // OpenCV camera ray (+X right, +Y down, +Z forward) -> Three.js local (+X, -Y, -Z)
  const vx = (u - cx) / fx;
  const vy = -(v - cy) / fy;
  const vz = -1;

  const [qx, qy, qz, qw] = solvedCamera.quaternion;
  const ix = qw * vx + qy * vz - qz * vy;
  const iy = qw * vy + qz * vx - qx * vz;
  const iz = qw * vz + qx * vy - qy * vx;
  const iw = -qx * vx - qy * vy - qz * vz;

  const dx = ix * qw + iw * -qx + iy * -qz - iz * -qy;
  const dy = iy * qw + iw * -qy + iz * -qx - ix * -qz;
  const dz = iz * qw + iw * -qz + ix * -qy - iy * -qx;

  if (Math.abs(dy) < 1e-4) return null;
  const s = (preset.start.y - camPos[1]) / dy;
  if (s <= 0.2 || s > 200) return null;

  const hitX = camPos[0] + dx * s;
  const hitZ = camPos[2] + dz * s;

  const minBound =
    preset.axis === 'x'
      ? Math.min(preset.start.x, preset.end.x)
      : Math.min(preset.start.z, preset.end.z);
  const maxBound =
    preset.axis === 'x'
      ? Math.max(preset.start.x, preset.end.x)
      : Math.max(preset.start.z, preset.end.z);

  if (preset.axis === 'x') {
    const clampedX = Math.max(minBound, Math.min(maxBound, hitX));
    return {
      x: Number(clampedX.toFixed(3)),
      y: preset.start.y,
      z: preset.start.z,
    };
  } else {
    const clampedZ = Math.max(minBound, Math.min(maxBound, hitZ));
    return {
      x: preset.start.x,
      y: preset.start.y,
      z: Number(clampedZ.toFixed(3)),
    };
  }
}

/**
 * Expands partial or full 2-dot pool edge lines into 3D correspondences along the
 * exact wall line. Requires an initial camera pose (from point anchors) so partial
 * edges are never falsely stretched to the 0m/50m corners.
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
  // Do NOT fabricate 0m..50m endpoints before an initial camera pose exists,
  // because partial edges only cover a sub-segment of the wall.
  if (!solvedCamera || lines.length === 0) return [];

  const synthetic: LandmarkMapping[] = [];

  for (const line of lines) {
    const preset = presets.find((p) => p.id === line.lineId);
    if (!preset) continue;

    // Sample 4 evenly spaced points along the user's partial 2-dot segment
    const samples = [0, 0.333, 0.667, 1];
    samples.forEach((t, idx) => {
      const u = Math.round(line.p1.u + (line.p2.u - line.p1.u) * t);
      const v = Math.round(line.p1.v + (line.p2.v - line.p1.v) * t);

      const world = raycastPixelOntoPoolWall(
        u,
        v,
        preset,
        solvedCamera,
        imageWidth,
        imageHeight
      );
      if (!world) return;

      synthetic.push({
        id: `${line.id}_pt_${idx}`,
        anchorId: `${line.lineId}_pt_${idx}`,
        label: `${line.label} [${idx + 1}/4]`,
        pixel: { u, v },
        world,
      });
    });
  }

  return synthetic;
}