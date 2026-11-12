import React, { useRef, useEffect } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { usePoolStore } from '../store/usePoolStore';
import { EventPhoto } from '../db/poolDatabase';
import { AnchorCoverageStat } from '../utils/coverageAnalyzer';
import { PoolDeck } from './pool/PoolDeck';
import { WaterSurface } from './pool/WaterSurface';
import { LaneRopes } from './pool/LaneRopes';
import { StartingBlocks } from './pool/StartingBlocks';
import { BackstrokeFlags } from './pool/BackstrokeFlags';
import { MetricGrid } from './pool/MetricGrid';
import { SolvedCameras } from './pool/SolvedCameras';
import { CoverageNodes3D } from './pool/CoverageNodes3D';
import { PoolLadders } from './pool/PoolLadders';
import { ProjectedPhoto3D } from './pool/ProjectedPhoto3D';

export interface PoolCanvasProps {
  photos: EventPhoto[];
  activePhotoId: string | null;
  lockedPhotoId: string | null;
  onSelectPhoto: (photo: EventPhoto) => void;
  onUnlockCamera: () => void;
  snapRequest: { photo: EventPhoto; timestamp: number } | null;
  coverageAnchors: AnchorCoverageStat[];
  showCoverage3D: boolean;
  onSelectCoverageAnchor: (anchorId: string) => void;
  projectedPhoto: EventPhoto | null;
  overlayOpacity: number;
}

const CameraController: React.FC<{
  controlsRef: React.RefObject<OrbitControlsImpl>;
  snapRequest: { photo: EventPhoto; timestamp: number } | null;
}> = ({ controlsRef, snapRequest }) => {
  const { camera, size } = useThree();
  const setCameraPose = usePoolStore((s) => s.setCameraPose);

  useEffect(() => {
    if (!snapRequest?.photo.solvedCamera || !controlsRef.current) return;
    const { photo } = snapRequest;
    const { position, quaternion, fov } = photo.solvedCamera!;

    camera.position.set(...position);
    camera.quaternion.set(...quaternion);

    if (camera instanceof THREE.PerspectiveCamera) {
      const photoAspect = photo.width / photo.height;
      const viewAspect = size.width / size.height;

      // Match the photo's exact horizontal & vertical boundary inside the browser viewport
      if (photoAspect > viewAspect) {
        const halfVertRad = THREE.MathUtils.degToRad(fov / 2);
        const adjustedHalfVert = Math.atan(
          Math.tan(halfVertRad) * (photoAspect / viewAspect)
        );
        camera.fov = THREE.MathUtils.radToDeg(adjustedHalfVert * 2);
      } else {
        camera.fov = fov;
      }
      camera.updateProjectionMatrix();
    }

    const forward = new THREE.Vector3(0, 0, -15).applyQuaternion(camera.quaternion);
    controlsRef.current.target.copy(camera.position).add(forward);
    controlsRef.current.update();
  }, [snapRequest, camera, controlsRef, size.width, size.height]);

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
  lockedPhotoId,
  onSelectPhoto,
  onUnlockCamera,
  snapRequest,
  coverageAnchors,
  showCoverage3D,
  onSelectCoverageAnchor,
  projectedPhoto,
  overlayOpacity,
}) => {
  const controlsRef = useRef<OrbitControlsImpl>(null);
  const activePreset = usePoolStore((s) => s.activePreset);
  const { length, laneCount, laneWidth } = usePoolStore((s) => s.activePool);
  const poolWidth = laneCount * laneWidth;

  // Inside PoolCanvas in src/components/PoolCanvas.tsx:
const isSnappingRef = useRef(false);

useEffect(() => {
  if (!snapRequest) return;
  isSnappingRef.current = true;
  const timer = setTimeout(() => {
    isSnappingRef.current = false;
  }, 150);
  return () => clearTimeout(timer);
}, [snapRequest]);



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
      <PoolLadders />
      <MetricGrid />

      <SolvedCameras
        photos={photos}
        activePhotoId={activePhotoId}
        lockedPhotoId={lockedPhotoId}
        onSelectPhoto={onSelectPhoto}
      />

      <CoverageNodes3D
        anchors={coverageAnchors}
        visible={showCoverage3D}
        onSelectAnchor={onSelectCoverageAnchor}
      />
      <ProjectedPhoto3D photo={projectedPhoto} opacity={overlayOpacity} />
      <OrbitControls
        ref={controlsRef}
        target={[length / 2, 0, poolWidth / 2]}
        maxPolarAngle={Math.PI / 2 - 0.01}
        minDistance={2}
        maxDistance={120}
        onStart={() => {
          if (!isSnappingRef.current && lockedPhotoId) {
            onUnlockCamera();
          }
        }}
      />
      <CameraController controlsRef={controlsRef} snapRequest={snapRequest} />
    </Canvas>
  );
};