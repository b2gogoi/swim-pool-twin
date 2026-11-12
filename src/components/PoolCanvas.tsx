import React, { useRef, useEffect } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { usePoolStore } from '../store/usePoolStore';
import { CalibratedPhotoMeta } from '../types/calibration';
import { PoolDeck } from './pool/PoolDeck';
import { WaterSurface } from './pool/WaterSurface';
import { LaneRopes } from './pool/LaneRopes';
import { StartingBlocks } from './pool/StartingBlocks';
import { BackstrokeFlags } from './pool/BackstrokeFlags';
import { MetricGrid } from './pool/MetricGrid';
import { SolvedCameras } from './pool/SolvedCameras';

interface PoolCanvasProps {
  photos: CalibratedPhotoMeta[];
  activePhotoId: string | null;
  onSelectPhoto: (photo: CalibratedPhotoMeta) => void;
  snapRequest: { photo: CalibratedPhotoMeta; timestamp: number } | null;
}

const CameraController: React.FC<{
  controlsRef: React.RefObject<OrbitControlsImpl>;
  snapRequest: { photo: CalibratedPhotoMeta; timestamp: number } | null;
}> = ({ controlsRef, snapRequest }) => {
  const { camera } = useThree();
  const setCameraPose = usePoolStore((s) => s.setCameraPose);

  // Snap Three.js camera to the solved photo pose
  useEffect(() => {
    if (!snapRequest?.photo.solvedCamera || !controlsRef.current) return;
    const { position, quaternion, fov } = snapRequest.photo.solvedCamera;

    camera.position.set(...position);
    camera.quaternion.set(...quaternion);
    if (camera instanceof THREE.PerspectiveCamera) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }

    // Place OrbitControls target 15m along the camera's forward look vector
    const forward = new THREE.Vector3(0, 0, -15).applyQuaternion(camera.quaternion);
    controlsRef.current.target.copy(camera.position).add(forward);
    controlsRef.current.update();
  }, [snapRequest, camera, controlsRef]);

  useFrame(() => {
    const euler = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ');
    setCameraPose({
      x: parseFloat(camera.position.x.toFixed(2)),
      y: parseFloat(camera.position.y.toFixed(2)),
      z: parseFloat(camera.position.z.toFixed(2)),
      pitch: parseFloat(THREE.MathUtils.radToDeg(euler.x).toFixed(1)),
      yaw: parseFloat(THREE.MathUtils.radToDeg(euler.y).toFixed(1)),
      fov: (camera as THREE.PerspectiveCamera).fov,
    });
  });

  return null;
};

export const PoolCanvas: React.FC<PoolCanvasProps> = ({
  photos,
  activePhotoId,
  onSelectPhoto,
  snapRequest,
}) => {
  const controlsRef = useRef<OrbitControlsImpl>(null);
  const activePreset = usePoolStore((s) => s.activePreset);
  const { length, laneCount, laneWidth } = usePoolStore((s) => s.config);
  const poolWidth = laneCount * laneWidth;

  useEffect(() => {
    if (!controlsRef.current) return;
    const ctrl = controlsRef.current;

    switch (activePreset) {
      case 'start':
        ctrl.object.position.set(-8, 9, poolWidth / 2);
        ctrl.target.set(15, 0, poolWidth / 2);
        break;
      case 'turn':
        ctrl.object.position.set(length + 8, 9, poolWidth / 2);
        ctrl.target.set(length - 15, 0, poolWidth / 2);
        break;
      case 'grandstand':
        ctrl.object.position.set(length / 2, 14, poolWidth + 18);
        ctrl.target.set(length / 2, 0, poolWidth / 2);
        break;
      case 'ortho':
        ctrl.object.position.set(length / 2, 42, poolWidth / 2 + 0.01);
        ctrl.target.set(length / 2, 0, poolWidth / 2);
        break;
    }
    ctrl.update();
  }, [activePreset, length, poolWidth]);

  return (
    <Canvas
      camera={{ position: [-8, 9, 12.5], fov: 45, near: 0.1, far: 500 }}
      shadows
      style={{ width: '100vw', height: '100vh', background: '#0b1120' }}
    >
      <ambientLight intensity={0.7} />
      <directionalLight
        position={[25, 30, 20]}
        intensity={1.2}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
      />
      <directionalLight position={[-10, 20, -10]} intensity={0.4} />

      <PoolDeck />
      <WaterSurface />
      <LaneRopes />
      <StartingBlocks />
      <BackstrokeFlags />
      <MetricGrid />

      <SolvedCameras
        photos={photos}
        activePhotoId={activePhotoId}
        onSelectPhoto={onSelectPhoto}
      />

      <OrbitControls
        ref={controlsRef}
        target={[length / 2, 0, poolWidth / 2]}
        maxPolarAngle={Math.PI / 2 - 0.01}
        minDistance={2}
        maxDistance={120}
      />
      <CameraController controlsRef={controlsRef} snapRequest={snapRequest} />
    </Canvas>
  );
};
