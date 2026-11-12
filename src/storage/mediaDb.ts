import { get, set, del } from 'idb-keyval';
import { CalibratedPhotoMeta } from '../types/calibration';

const META_LIST_KEY = 'swim_twin_photo_meta_list';
const BLOB_PREFIX = 'swim_twin_blob_';

export async function savePhotoOffline(file: File): Promise<CalibratedPhotoMeta> {
  const id = crypto.randomUUID();
  const dimensions = await getImageDimensions(file);

  // 1. Store raw binary File/Blob in IndexedDB
  await set(`${BLOB_PREFIX}${id}`, file);

  // 2. Append metadata record
  const meta: CalibratedPhotoMeta = {
    id,
    name: file.name,
    width: dimensions.width,
    height: dimensions.height,
    createdAt: Date.now(),
    correspondences: [],
  };

  const existing = await getAllPhotoMeta();
  await set(META_LIST_KEY, [...existing, meta]);
  return meta;
}

export async function getAllPhotoMeta(): Promise<CalibratedPhotoMeta[]> {
  return (await get<CalibratedPhotoMeta[]>(META_LIST_KEY)) || [];
}

export async function updatePhotoMeta(updated: CalibratedPhotoMeta): Promise<void> {
  const all = await getAllPhotoMeta();
  const next = all.map((item) => (item.id === updated.id ? updated : item));
  await set(META_LIST_KEY, next);
}

export async function getPhotoObjectUrl(id: string): Promise<string | null> {
  const blob = await get<Blob>(`${BLOB_PREFIX}${id}`);
  return blob ? URL.createObjectURL(blob) : null;
}

export async function deletePhotoOffline(id: string): Promise<void> {
  await del(`${BLOB_PREFIX}${id}`);
  const all = await getAllPhotoMeta();
  await set(
    META_LIST_KEY,
    all.filter((item) => item.id !== id)
  );
}

function getImageDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
      URL.revokeObjectURL(url);
    };
    img.src = url;
  });
}
