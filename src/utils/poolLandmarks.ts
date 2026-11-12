import { PoolConfig } from '../types/pool';

export interface PoolAnchorPreset {
  id: string;
  label: string;
  world: { x: number; y: number; z: number };
}

export function getPoolAnchors(config: PoolConfig): PoolAnchorPreset[] {
  const { length, laneCount, laneWidth, flagDistance, flagHeight } = config;
  const maxW = laneCount * laneWidth;
  const anchors: PoolAnchorPreset[] = [];

  // 1. Water-level corners & lane rope wall anchors (X = 0 and X = 50)
  for (let r = 0; r <= laneCount; r++) {
    const z = r * laneWidth;
    anchors.push({
      id: `start_wall_rope_${r}`,
      label: `Start Wall - Rope ${r} (0m, Z=${z}m)`,
      world: { x: 0, y: 0.04, z },
    });
    anchors.push({
      id: `turn_wall_rope_${r}`,
      label: `Turn Wall - Rope ${r} (50m, Z=${z}m)`,
      world: { x: length, y: 0.04, z },
    });
    // 15m and 35m red breakout float markers
    anchors.push({
      id: `15m_rope_${r}`,
      label: `15m Red Marker - Rope ${r}`,
      world: { x: 15, y: 0.04, z },
    });
    anchors.push({
      id: `35m_rope_${r}`,
      label: `35m Red Marker - Rope ${r}`,
      world: { x: 35, y: 0.04, z },
    });
    // 25m white midpoint marker
    anchors.push({
      id: `25m_rope_${r}`,
      label: `25m Midpoint - Rope ${r}`,
      world: { x: 25, y: 0.04, z },
    });
  }

  // 2. Elevated 3D points (Crucial for non-planar PnP stability)
  anchors.push(
    {
      id: 'flag_pole_start_near',
      label: '5m Flag Pole Top (Near / Z=0)',
      world: { x: flagDistance, y: flagHeight, z: -0.6 },
    },
    {
      id: 'flag_pole_start_far',
      label: '5m Flag Pole Top (Far / Max Z)',
      world: { x: flagDistance, y: flagHeight, z: maxW + 0.6 },
    },
    {
      id: 'flag_pole_turn_near',
      label: '45m Flag Pole Top (Near / Z=0)',
      world: { x: length - flagDistance, y: flagHeight, z: -0.6 },
    },
    {
      id: 'flag_pole_turn_far',
      label: '45m Flag Pole Top (Far / Max Z)',
      world: { x: length - flagDistance, y: flagHeight, z: maxW + 0.6 },
    }
  );

  // 3. Starting block top-front edges (Y = 0.52m)
  for (let idx = 0; idx < laneCount; idx++) {
    const laneNum = idx + (laneCount === 10 ? 0 : 1);
    const zCenter = idx * laneWidth + laneWidth / 2;
    anchors.push({
      id: `block_front_${laneNum}`,
      label: `Block ${laneNum} Front Edge`,
      world: { x: -0.18, y: 0.5, z: zCenter },
    });
  }

  return anchors;
}
