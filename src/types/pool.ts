export interface PoolConfig {
    length: number;           // Standard 50m
    laneCount: number;        // Number of swimming lanes
    laneWidth: number;        // 2.5m
    deckBorder: number;       // 3.5m deck apron
    flagDistance: number;     // 5m from each wall
    flagHeight: number;       // 1.85m above water
  }
  
  export interface CameraPose {
    x: number;
    y: number;
    z: number;
    pitch: number;
    yaw: number;
    fov: number;
  }
  
