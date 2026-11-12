import { EventPhoto, PoolVenue } from '../db/poolDatabase';
import { getPoolAnchors, PoolAnchorPreset } from './poolLandmarks';

export interface AnchorCoverageStat extends PoolAnchorPreset {
  observationCount: number;
  photoIds: string[];
  status: 'uncovered' | 'single' | 'multi'; // 0, 1, or >=2 photos
}

export interface PoolCoverageSummary {
  totalAnchors: number;
  coveredCount: number;
  multiViewCount: number;
  coveragePercent: number;
  zoneBreakdown: {
    startZone0to15m: number;   // % covered
    midZone15to35m: number;    // % covered
    turnZone35to50m: number;   // % covered
  };
  anchors: AnchorCoverageStat[];
}

export function analyzePoolCoverage(
  venue: PoolVenue,
  photos: EventPhoto[]
): PoolCoverageSummary {
  const canonicalAnchors = getPoolAnchors(venue);
  const map = new Map<string, string[]>();

  photos.forEach((photo) => {
    photo.mappings.forEach((m) => {
      const list = map.get(m.anchorId) || [];
      if (!list.includes(photo.id)) list.push(photo.id);
      map.set(m.anchorId, list);
    });
  });

  const stats: AnchorCoverageStat[] = canonicalAnchors.map((anchor) => {
    const photoIds = map.get(anchor.id) || [];
    const count = photoIds.length;
    return {
      ...anchor,
      observationCount: count,
      photoIds,
      status: count === 0 ? 'uncovered' : count === 1 ? 'single' : 'multi',
    };
  });

  const coveredCount = stats.filter((s) => s.observationCount > 0).length;
  const multiViewCount = stats.filter((s) => s.observationCount >= 2).length;

  const calcZone = (minX: number, maxX: number) => {
    const zoneItems = stats.filter((s) => s.world.x >= minX && s.world.x <= maxX);
    if (!zoneItems.length) return 0;
    const hit = zoneItems.filter((s) => s.observationCount > 0).length;
    return Math.round((hit / zoneItems.length) * 100);
  };

  return {
    totalAnchors: stats.length,
    coveredCount,
    multiViewCount,
    coveragePercent: stats.length ? Math.round((coveredCount / stats.length) * 100) : 0,
    zoneBreakdown: {
      startZone0to15m: calcZone(0, 15),
      midZone15to35m: calcZone(15.01, 34.99),
      turnZone35to50m: calcZone(35, 50),
    },
    anchors: stats,
  };
}