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

  // 1. Pool basin corners at water level (Z = 0 and Z = maxW)
  [0, maxW].forEach((z, edgeIdx) => {
    const sideLabel = edgeIdx === 0 ? 'Near Wall Edge (Z=0)' : `Far Wall Edge (Z=${maxW}m)`;
    anchors.push(
      {
        id: `start_corner_${edgeIdx}`,
        label: `Start Wall Corner - ${sideLabel}`,
        world: { x: 0, y: 0.04, z },
      },
      {
        id: `turn_corner_${edgeIdx}`,
        label: `Turn Wall Corner - ${sideLabel}`,
        world: { x: length, y: 0.04, z },
      }
    );
  });

  // 2. Interior lane ropes: r = 1 .. laneCount - 1
  for (let r = 1; r < laneCount; r++) {
    const z = r * laneWidth;
    anchors.push(
      {
        id: `start_wall_rope_${r}`,
        label: `Start Wall - Rope ${r} (0m, Z=${z}m)`,
        world: { x: 0, y: 0.04, z },
      },
      {
        id: `turn_wall_rope_${r}`,
        label: `Turn Wall - Rope ${r} (50m, Z=${z}m)`,
        world: { x: length, y: 0.04, z },
      },
      {
        id: `15m_rope_${r}`,
        label: `15m Red Marker - Rope ${r}`,
        world: { x: 15, y: 0.04, z },
      },
      {
        id: `35m_rope_${r}`,
        label: `35m Red Marker - Rope ${r}`,
        world: { x: 35, y: 0.04, z },
      },
      {
        id: `25m_rope_${r}`,
        label: `25m Midpoint - Rope ${r}`,
        world: { x: 25, y: 0.04, z },
      }
    );
  }

  // 3. 25m Midpoint Ladders (60cm wide -> X = 24.70m and 25.30m, deck anchor 5cm off wall edge)
  const midX = length / 2; // 25.0m
  const ladderRails = [
    { key: 'left', x: Number((midX - 0.3).toFixed(2)), railLabel: `${(midX - 0.3).toFixed(2)}m Rail` },
    { key: 'right', x: Number((midX + 0.3).toFixed(2)), railLabel: `${(midX + 0.3).toFixed(2)}m Rail` },
  ];
  const wallSides = [
    { key: 'near', entryZ: 0.12, deckZ: -0.05, sideLabel: 'Near' },
    { key: 'far', entryZ: Number((maxW - 0.12).toFixed(2)), deckZ: Number((maxW + 0.05).toFixed(2)), sideLabel: 'Far' },
  ];

  for (const side of wallSides) {
    for (const rail of ladderRails) {
      anchors.push(
        {
          id: `ladder_25m_${side.key}_${rail.key}_deck`,
          label: `25m Ladder Deck Base - ${rail.railLabel} (${side.sideLabel}, Z=${side.deckZ})`,
          world: { x: rail.x, y: 0.02, z: side.deckZ },
        },
        {
          id: `ladder_25m_${side.key}_${rail.key}_top`,
          label: `25m Ladder Top Loop - ${rail.railLabel} (${side.sideLabel}, Y=0.65m)`,
          world: { x: rail.x, y: 0.65, z: side.deckZ },
        },
        {
          id: `ladder_25m_${side.key}_${rail.key}`,
          label: `25m Ladder In-Pool Rail - ${rail.railLabel} (${side.sideLabel}, Z=${side.entryZ})`,
          world: { x: rail.x, y: 0.02, z: side.entryZ },
        }
      );
    }
  }

  // 4. Elevated & Ground-Base Pole Landmarks (5m, 15m, 35m, 45m — 20cm off pool edge)
  const poleStations = [
    { key: '5m', x: flagDistance, name: `${flagDistance}m Flag Pole` },
    { key: '15m', x: 15, name: '15m Rope Pole' },
    { key: '35m', x: length - 15, name: `${length - 15}m Rope Pole` },
    { key: '45m', x: length - flagDistance, name: `${length - flagDistance}m Flag Pole` },
  ];

  const poleSides = [
    { key: 'near', z: -0.2, sideLabel: 'Near / Z=-0.2' },
    { key: 'far', z: Number((maxW + 0.2).toFixed(2)), sideLabel: `Far / Z=${Number((maxW + 0.2).toFixed(2))}` },
  ];

  for (const station of poleStations) {
    for (const side of poleSides) {
      anchors.push(
        {
          id: `pole_${station.key}_${side.key}_top`,
          label: `${station.name} Top (${side.sideLabel})`,
          world: { x: station.x, y: flagHeight, z: side.z },
        },
        {
          id: `pole_${station.key}_${side.key}_bottom`,
          label: `${station.name} Bottom / Ground (${side.sideLabel})`,
          world: { x: station.x, y: 0.02, z: side.z },
        }
      );
    }
  }

  // 5. Starting block top-front edges (Y = 0.50m)
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