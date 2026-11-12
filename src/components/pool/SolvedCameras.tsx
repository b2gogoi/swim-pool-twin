import React from 'react';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { EventPhoto } from '../../db/poolDatabase';

interface SolvedCamerasProps {
  photos: EventPhoto[];
  activePhotoId: string | null;
  lockedPhotoId: string | null;
  onSelectPhoto: (photo: EventPhoto) => void;
}

export const SolvedCameras: React.FC<SolvedCamerasProps> = ({
  photos,
  activePhotoId,
  lockedPhotoId,
  onSelectPhoto,
}) => {
  return (
    <group>
      {photos.map((photo) => {
        if (!photo.solvedCamera || photo.id === lockedPhotoId) return null;

        const { position, quaternion } = photo.solvedCamera;
        const isActive = photo.id === activePhotoId;
        const quat = new THREE.Quaternion(...quaternion);
        const [x, y, z] = position;

        return (
          <group key={photo.id}>
            {/* Vertical tripod/stand line to Y=0 so camera position is easy to spot */}
            {y > 0.2 && (
              <mesh position={[x, y / 2, z]}>
                <cylinderGeometry args={[0.02, 0.02, y, 8]} />
                <meshBasicMaterial
                  color={isActive ? '#38bdf8' : '#f59e0b'}
                  transparent
                  opacity={0.45}
                />
              </mesh>
            )}

            {/* Interactive Camera Body + Lens */}
            <group
              position={position}
              quaternion={quat}
              onClick={(e) => {
                e.stopPropagation();
                onSelectPhoto(photo);
              }}
            >
              <mesh>
                <boxGeometry args={[0.6, 0.4, 0.45]} />
                <meshStandardMaterial
                  color={isActive ? '#38bdf8' : '#f59e0b'}
                  emissive={isActive ? '#0284c7' : '#b45309'}
                  emissiveIntensity={0.4}
                />
              </mesh>

              {/* Lens Cone pointing down -Z */}
              <mesh position={[0, 0, -0.38]} rotation={[Math.PI / 2, 0, 0]}>
                <cylinderGeometry args={[0.18, 0.1, 0.3, 16]} />
                <meshStandardMaterial color="#0f172a" />
              </mesh>

              {/* Clickable Floating Pill */}
              <Html position={[0, 0.6, 0]} center distanceFactor={25}>
                <div
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectPhoto(photo);
                  }}
                  style={{
                    background: isActive ? '#0284c7' : 'rgba(15, 23, 42, 0.9)',
                    color: '#fff',
                    padding: '3px 8px',
                    borderRadius: 4,
                    fontSize: 11,
                    fontWeight: 600,
                    whiteSpace: 'nowrap',
                    border: '1px solid #38bdf8',
                    cursor: 'pointer',
                  }}
                >
                  📷 {photo.filename} ({x}m, {y}m, {z}m)
                </div>
              </Html>
            </group>
          </group>
        );
      })}
    </group>
  );
};