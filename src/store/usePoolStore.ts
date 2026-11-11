import { create } from 'zustand';
import { PoolConfig, CameraPose } from '../types/pool';

interface PoolState {
  config: PoolConfig;
  cameraPose: CameraPose;
  showGrid: boolean;
  activePreset: string;
  setLaneCount: (count: 8 | 10) => void;
  toggleGrid: () => void;
  setCameraPose: (pose: Partial<CameraPose>) => void;
  setActivePreset: (preset: string) => void;
}

export const usePoolStore = create<PoolState>((set) => ({
  config: {
    length: 50,
    laneCount: 10,
    laneWidth: 2.5,
    deckBorder: 3.5,
    flagDistance: 5.0,
    flagHeight: 1.85,
  },
  cameraPose: {
    x: -8,
    y: 8,
    z: 12.5,
    pitch: 0,
    yaw: 0,
    fov: 45,
  },
  showGrid: true,
  activePreset: 'start',
  setLaneCount: (laneCount) =>
    set((state) => ({ config: { ...state.config, laneCount } })),
  toggleGrid: () => set((state) => ({ showGrid: !state.showGrid })),
  setCameraPose: (pose) =>
    set((state) => ({ cameraPose: { ...state.cameraPose, ...pose } })),
  setActivePreset: (activePreset) => set({ activePreset }),
}));
