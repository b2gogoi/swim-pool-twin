import { db, EventPhoto, LandmarkMapping, MappingFeatureRecord } from '../db/poolDatabase';
import { getCv } from './pnpSolver';

export interface MappingSuggestion extends LandmarkMapping {
  matchDistance: number;
  matchRatio: number;
}

interface OrbFeature {
  pixel: { u: number; v: number };
  descriptor: number[];
}

const featureCache = new Map<string, Promise<OrbFeature[]>>();
const MAX_IMAGE_SIDE = 1600;
const DESCRIPTORS_PER_MAPPING = 4;

async function getOrbFeatures(photoId: string, blob: Blob): Promise<OrbFeature[]> {
  const cached = featureCache.get(photoId);
  if (cached) return cached;

  const extraction = (async () => {
    const bitmap = await createImageBitmap(blob);
    const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('Could not create a canvas for image feature extraction.');
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();

    const cv = await getCv();
    const image = cv.imread(canvas);
    const gray = new cv.Mat();
    const keypoints = new cv.KeyPointVector();
    const descriptors = new cv.Mat();
    const mask = new cv.Mat();
    const orb = new cv.ORB(1800);
    try {
      cv.cvtColor(image, gray, cv.COLOR_RGBA2GRAY);
      orb.detectAndCompute(gray, mask, keypoints, descriptors);
      const data: Uint8Array = descriptors.data;
      const descriptorLength = descriptors.cols;
      const found: OrbFeature[] = [];
      const featureCount = Math.min(keypoints.size(), descriptors.rows);
      for (let i = 0; i < featureCount; i++) {
        const point = keypoints.get(i).pt;
        const start = i * descriptorLength;
        if (start + descriptorLength > data.length) break;
        found.push({
          pixel: { u: Math.round((point.x / scale)), v: Math.round((point.y / scale)) },
          descriptor: Array.from(data.slice(start, start + descriptorLength)),
        });
      }
      return found;
    } finally {
      orb.delete();
      mask.delete();
      descriptors.delete();
      keypoints.delete();
      gray.delete();
      image.delete();
    }
  })();

  featureCache.set(photoId, extraction);
  try {
    return await extraction;
  } catch (error) {
    featureCache.delete(photoId);
    throw error;
  }
}

/** Replace a photo's local visual references from its currently confirmed point mappings. */
export async function refreshPhotoMappingFeatures(
  photo: EventPhoto,
  blob: Blob,
  additionalMappings: LandmarkMapping[] = []
): Promise<void> {
  const mappings = [...photo.mappings, ...additionalMappings];
  if (!mappings.length) {
    await db.mappingFeatures.where('photoId').equals(photo.id).delete();
    return;
  }

  const features = await getOrbFeatures(photo.id, blob);
  const records: MappingFeatureRecord[] = [];
  for (const mapping of mappings) {
    const nearest = features
      .map((feature) => ({ feature, distance: Math.hypot(feature.pixel.u - mapping.pixel.u, feature.pixel.v - mapping.pixel.v) }))
      .filter((candidate) => candidate.distance <= 52)
      .sort((a, b) => a.distance - b.distance)
      .slice(0, DESCRIPTORS_PER_MAPPING);

    nearest.forEach(({ feature }, index) => records.push({
      id: `${photo.id}:${mapping.anchorId}:${index}`,
      poolId: photo.poolId,
      photoId: photo.id,
      anchorId: mapping.anchorId,
      label: mapping.label,
      pixel: mapping.pixel,
      world: mapping.world,
      descriptor: feature.descriptor,
      createdAt: Date.now(),
    }));
  }
  await db.transaction('rw', db.mappingFeatures, async () => {
    await db.mappingFeatures.where('photoId').equals(photo.id).delete();
    if (records.length) await db.mappingFeatures.bulkPut(records);
  });
}

export function forgetPhotoFeatureCache(photoId: string): void {
  featureCache.delete(photoId);
}

function hammingDistance(a: number[], b: number[]): number {
  let distance = 0;
  for (let index = 0; index < Math.min(a.length, b.length); index++) {
    let value = a[index] ^ b[index];
    while (value) {
      distance++;
      value &= value - 1;
    }
  }
  return distance;
}

/** Match local ORB descriptors against confirmed references from other photos in this pool. */
export async function findMappingSuggestions(
  target: EventPhoto,
  blob: Blob,
  excludedAnchorIds: string[]
): Promise<{ suggestions: MappingSuggestion[]; referenceCount: number }> {
  const references = await db.mappingFeatures.where('poolId').equals(target.poolId).toArray();
  const usableReferences = references.filter((reference) => reference.photoId !== target.id);
  if (!usableReferences.length) return { suggestions: [], referenceCount: 0 };

  const targetFeatures = await getOrbFeatures(target.id, blob);
  if (targetFeatures.length < 2) return { suggestions: [], referenceCount: usableReferences.length };

  const candidates: Array<{
    reference: MappingFeatureRecord;
    featureIndex: number;
    distance: number;
    ratio: number;
  }> = [];

  for (const reference of usableReferences) {
    let bestIndex = -1;
    let best = Infinity;
    let second = Infinity;
    for (let index = 0; index < targetFeatures.length; index++) {
      const distance = hammingDistance(reference.descriptor, targetFeatures[index].descriptor);
      if (distance < best) {
        second = best;
        best = distance;
        bestIndex = index;
      } else if (distance < second) second = distance;
    }
    const ratio = second > 0 ? best / second : 1;
    if (bestIndex >= 0 && best <= 88 && ratio < 0.82) {
      candidates.push({ reference, featureIndex: bestIndex, distance: best, ratio });
    }
  }

  candidates.sort((a, b) => a.distance - b.distance || a.ratio - b.ratio);
  const usedFeatures = new Set<number>();
  const usedAnchors = new Set(excludedAnchorIds);
  const selected = new Map<string, typeof candidates[number]>();
  for (const candidate of candidates) {
    const anchorId = candidate.reference.anchorId;
    if (usedFeatures.has(candidate.featureIndex) || usedAnchors.has(anchorId)) continue;
    usedFeatures.add(candidate.featureIndex);
    usedAnchors.add(anchorId);
    selected.set(anchorId, candidate);
  }

  const suggestions = Array.from(selected.values()).map(({ reference, featureIndex, distance, ratio }) => ({
    id: crypto.randomUUID(),
    anchorId: reference.anchorId,
    label: reference.label,
    pixel: targetFeatures[featureIndex].pixel,
    world: reference.world,
    matchDistance: distance,
    matchRatio: ratio,
  }));

  return { suggestions, referenceCount: usableReferences.length };
}
