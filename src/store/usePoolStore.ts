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
  laneColorScheme: 'olympic',
};

interface PoolState {
  activePool: PoolVenue;
  activeEvent: CompetitionEvent | null;
  cameraPose: CameraPose;
  showGrid: boolean;
  showCoverage3D: boolean;
  activePreset: string;
  selectedAnchorId: string;

  setActivePool: (pool: PoolVenue) => void;
  setActiveEvent: (event: CompetitionEvent | null) => void;
  toggleGrid: () => void;
  toggleCoverage3D: () => void;
  setCameraPose: (pose: Partial<CameraPose>) => void;
  setActivePreset: (preset: string) => void;
  setSelectedAnchorId: (id: string) => void;
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

  setActivePool: (activePool) => set({ activePool }),
  setActiveEvent: (activeEvent) => set({ activeEvent }),
  toggleGrid: () => set((s) => ({ showGrid: !s.showGrid })),
  toggleCoverage3D: () => set((s) => ({ showCoverage3D: !s.showCoverage3D })),
  setCameraPose: (pose) =>
    set((s) => ({ cameraPose: { ...s.cameraPose, ...pose } })),
  setActivePreset: (activePreset) => set({ activePreset }),
  setSelectedAnchorId: (selectedAnchorId) => set({ selectedAnchorId }),
}));