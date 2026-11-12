import Dexie, { Table } from 'dexie';

export type SyncStatus = 'dirty' | 'syncing' | 'synced';

export interface PoolVenue {
  id: string;
  name: string;
  city?: string;
  // Parametric 3D Pool Specs
  length: number;            // 50.0m
  laneCount: 8 | 10;
  laneWidth: number;         // 2.5m
  deckBorder: number;
  flagDistance: number;      // 5.0m
  flagHeight: number;        // 1.85m
  hasBulkhead: boolean;
  laneColorScheme: 'olympic' | 'uniform_blue' | 'custom';
  customLaneColors?: string[];
  // Offline Sync Metadata
  updatedAt: number;
  syncStatus: SyncStatus;
}

export interface CompetitionEvent {
  id: string;
  poolId: string;            // FK -> PoolVenue.id
  name: string;              // e.g., "100m Fly Heat 3" or "Day 1 Session"
  date: string;              // ISO date
  updatedAt: number;
  syncStatus: SyncStatus;
}

export interface LandmarkMapping {
  id: string;
  anchorId: string;          // Canonical ID e.g., "15m_rope_4", "start_wall_rope_0"
  label: string;
  pixel: { u: number; v: number };
  world: { x: number; y: number; z: number };
}

export interface EventPhoto {
  id: string;
  poolId: string;            // FK -> PoolVenue.id
  eventId: string;           // FK -> CompetitionEvent.id
  filename: string;
  width: number;
  height: number;
  mappings: LandmarkMapping[];
  solvedCamera?: {
    position: [number, number, number];
    quaternion: [number, number, number, number];
    fov: number;
    reprojectionError: number;
  };
  createdAt: number;
  updatedAt: number;
  syncStatus: SyncStatus;
  blobSynced: boolean;       // Separate flag for heavy binary upload
}

export interface PhotoBlobRecord {
  photoId: string;           // PK -> EventPhoto.id
  blob: Blob;
}

export class SwimTwinDB extends Dexie {
  pools!: Table<PoolVenue, string>;
  events!: Table<CompetitionEvent, string>;
  photos!: Table<EventPhoto, string>;
  photoBlobs!: Table<PhotoBlobRecord, string>;

  constructor() {
    super('SwimPoolTwinDB');
    this.version(1).stores({
      pools: 'id, name, syncStatus, updatedAt',
      events: 'id, poolId, syncStatus, updatedAt',
      photos: 'id, poolId, eventId, [poolId+eventId], syncStatus, updatedAt',
      photoBlobs: 'photoId',
    });
  }
}

export const db = new SwimTwinDB();