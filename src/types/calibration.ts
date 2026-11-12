export interface LandmarkCorrespondence {
    id: string;
    label: string;
    // 2D pixel coordinates on the uploaded photo
    pixel: { u: number; v: number };
    // 3D metric coordinates in the 50m pool twin (X: 0-50m, Y: height, Z: width)
    world: { x: number; y: number; z: number };
  }
  
  export interface CalibratedPhotoMeta {
    id: string;
    name: string;
    width: number;
    height: number;
    createdAt: number;
    correspondences: LandmarkCorrespondence[];
    solvedCamera?: {
      position: [number, number, number]; // [X, Y, Z] in meters
      quaternion: [number, number, number, number]; // Three.js camera orientation
      fov: number;
      reprojectionError?: number;
    };
  }
  