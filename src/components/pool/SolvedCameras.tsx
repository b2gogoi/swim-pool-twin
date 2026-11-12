import React from 'react';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { CalibratedPhotoMeta } from '../../types/calibration';

interface SolvedCamerasProps {
  photos: CalibratedPhotoMeta[];
  activePhotoId: string | null;
  onSelectPhoto: (photo: CalibratedPhotoMeta) => void;
}

export const SolvedCameras: React.FC<SolvedCamerasProps> = ({
  photos,
  activePhotoId,
  onSelectPhoto,
}) => {
  return (
    <group>
      {photos.map((photo) => {
        if (!photo.solvedCamera) return null;
        const { position, quaternion } = photo.solvedCamera;
        const isActive = photo.id === activePhotoId;
        const quat = new THREE.Quaternion(...quaternion);

        return (
          <group
            key={photo.id}
            position={position}
            quaternion={quat}
            onClick={(e) => {
              e.stopPropagation();
              onSelectPhoto(photo);
            }}
          >
            {/* Camera Body */}
            <mesh>
              <boxGeometry args={[0.45, 0.3, 0.35]} />
              <meshStandardMaterial color={isActive ? '#38bdf8' : '#f59e0b'} />
            </mesh>

            {/* Lens Cone pointing down -Z */}
            <mesh position={[0, 0, -0.3]} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.14, 0.08, 0.25, 16]} />
              <meshStandardMaterial color="#0f172a" />
            </mesh>

            {/* Floating Label */}
            <Html position={[0, 0.45, 0]} center distanceFactor={25}>
              <div
                style={{
                  background: isActive ? '#0284c7' : 'rgba(15, 23, 42, 0.85)',
                  color: '#fff',
                  padding: '2px 6px',
                  borderRadius: 4,
                  fontSize: 11,
                  whiteSpace: 'nowrap',
                  border: '1px solid rgba(255,255,255,0.2)',
                  cursor: 'pointer',
                }}
              >
                {photo.name} ({position[0]}m, {position[1]}m, {position[2]}m)
              </div>
            </Html>
          </group>
        );
      })}
    </group>
  );
};
