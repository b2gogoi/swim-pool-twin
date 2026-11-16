import { create } from 'zustand';
import { PoolVenue, CompetitionEvent } from '../db/poolDatabase';
import { CameraPose } from '../types/pool';

export const DEFAULT_POOL_TEMPLATE: Omit<PoolVenue, 'id' | 'updatedAt' | 'syncStatus'> = {
  name: 'Standard 50m Olympic Pool',
  city: '',
  length: 50,
  laneCount: 10,
  laneWidth: 2.5,
  deckBorder: 3.5,
  flagDistance: 5.0,
  flagHeight: 1.85,
  hasBulkhead: false,
  startingBlocksAtStart: true,
  startingBlocksAtTurn: false,
  has15m35mPoles: true,
  has25mMarker: true,
  midpointEquipment: 'ladder',
  laneColorScheme: 'olympic',
};

export type PoolItemVisibility = {
  deck: boolean;
  water: boolean;
  walls: boolean;
  laneRopes: boolean;
  startingBlocks: boolean;
  backstrokeFlags: boolean;
  extraPoles: boolean;
  ladders: boolean;
  distanceMarkers: boolean;
  bulkhead: boolean;
};

const DEFAULT_POOL_ITEM_VISIBILITY: PoolItemVisibility = {
  deck: true,
  water: true,
  walls: true,
  laneRopes: true,
  startingBlocks: true,
  backstrokeFlags: true,
  extraPoles: true,
  ladders: true,
  distanceMarkers: true,
  bulkhead: false,
};

interface PoolState {
  activePool: PoolVenue;
  activeEvent: CompetitionEvent | null;
  cameraPose: CameraPose;
  showGrid: boolean;
  showCoverage3D: boolean;
  activePreset: string;
  selectedAnchorId: string;
  poolItemVisibility: PoolItemVisibility;

  setActivePool: (pool: PoolVenue) => void;
  setActiveEvent: (event: CompetitionEvent | null) => void;
  toggleGrid: () => void;
  toggleCoverage3D: () => void;
  setCameraPose: (pose: Partial<CameraPose>) => void;
  setActivePreset: (preset: string) => void;
  setSelectedAnchorId: (id: string) => void;
  setPoolItemVisibility: (item: keyof PoolItemVisibility, visible: boolean) => void;
}

export const usePoolStore = create<PoolState>((set) => ({
  activePool: {
    ...DEFAULT_POOL_TEMPLATE,
    id: 'default-50m-olympic',
    updatedAt: Date.now(),
    syncStatus: 'synced',
  },
  activeEvent: null,
  cameraPose: {
    x: -8,
    y: 9,
    z: 12.5,
    pitch: 0,
    yaw: 0,
    fov: 45,
  },
  showGrid: true,
  showCoverage3D: true,
  activePreset: 'start',
  selectedAnchorId: 'start_wall_rope_0',
  poolItemVisibility: DEFAULT_POOL_ITEM_VISIBILITY,

  setActivePool: (activePool) => set({ activePool }),
  setActiveEvent: (activeEvent) => set({ activeEvent }),
  toggleGrid: () => set((s) => ({ showGrid: !s.showGrid })),
  toggleCoverage3D: () => set((s) => ({ showCoverage3D: !s.showCoverage3D })),
  setCameraPose: (pose) =>
    set((s) => ({ cameraPose: { ...s.cameraPose, ...pose } })),
  setActivePreset: (activePreset) => set({ activePreset }),
  setSelectedAnchorId: (selectedAnchorId) => set({ selectedAnchorId }),
  setPoolItemVisibility: (item, visible) =>
    set((state) => ({
      poolItemVisibility: { ...state.poolItemVisibility, [item]: visible },
    })),
}));
