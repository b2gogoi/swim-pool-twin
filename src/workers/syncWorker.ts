/// <reference lib="webworker" />
import { db } from '../db/poolDatabase';

const SYNC_INTERVAL_MS = 30_000; // Check every 30s
let apiEndpoint = '/api/sync';
let authToken = '';
let isSyncing = false;

self.onmessage = (event: MessageEvent) => {
  const { type, payload } = event.data;
  if (type === 'CONFIGURE') {
    apiEndpoint = payload.apiEndpoint || apiEndpoint;
    authToken = payload.authToken || '';
    runSyncCycle();
  } else if (type === 'TRIGGER_NOW') {
    runSyncCycle();
  }
};

async function runSyncCycle() {
  if (isSyncing || !navigator.onLine) return;
  isSyncing = true;
  postStatus('syncing');

  try {
    // 1. Sync Dirty Pool Configurations
    const dirtyPools = await db.pools.where('syncStatus').equals('dirty').toArray();
    for (const pool of dirtyPools) {
      await pushJson(`${apiEndpoint}/pools`, pool);
      await db.pools.update(pool.id, { syncStatus: 'synced' });
    }

    // 2. Sync Dirty Events
    const dirtyEvents = await db.events.where('syncStatus').equals('dirty').toArray();
    for (const ev of dirtyEvents) {
      await pushJson(`${apiEndpoint}/events`, ev);
      await db.events.update(ev.id, { syncStatus: 'synced' });
    }

    // 3. Sync Photo Metadata & Mappings (Lightweight JSON first)
    const dirtyPhotos = await db.photos.where('syncStatus').equals('dirty').toArray();
    for (const photo of dirtyPhotos) {
      await pushJson(`${apiEndpoint}/photos/meta`, photo);
      await db.photos.update(photo.id, { syncStatus: 'synced' });
    }

    // 4. Upload Unsynced Image Blobs (One at a time to protect poolside bandwidth)
    const unsyncedBlobs = await db.photos.filter((p) => !p.blobSynced).toArray();
    for (const photo of unsyncedBlobs) {
      const record = await db.photoBlobs.get(photo.id);
      if (!record) continue;

      const formData = new FormData();
      formData.append('photoId', photo.id);
      formData.append('poolId', photo.poolId);
      formData.append('eventId', photo.eventId);
      formData.append('file', record.blob, photo.filename);

      const res = await fetch(`${apiEndpoint}/photos/upload`, {
        method: 'POST',
        headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
        body: formData,
      });

      if (res.ok) {
        await db.photos.update(photo.id, { blobSynced: true });
      }
    }

    postStatus('idle');
  } catch (err: any) {
    postStatus('error', err.message);
  } finally {
    isSyncing = false;
  }
}

async function pushJson(url: string, body: unknown) {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Sync failed: ${res.status}`);
}

function postStatus(state: 'idle' | 'syncing' | 'error', error?: string) {
  self.postMessage({ type: 'SYNC_STATUS', state, error, timestamp: Date.now() });
}

setInterval(runSyncCycle, SYNC_INTERVAL_MS);