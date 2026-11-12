import React, { useEffect, useState, useMemo } from 'react';
import * as THREE from 'three';
import { db, EventPhoto } from '../../db/poolDatabase';

interface Props {
  photo: EventPhoto | null;
  opacity: number;
  distance?: number; // Distance along local -Z optical axis in meters
}

export const CameraPhotoOverlay3D: React.FC<Props> = ({
  photo,
  opacity,
  distance = 8,
}) => {
  const [texture, setTexture] = useState<THREE.Texture | null>(null);

  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;
    let loadedTex: THREE.Texture | null = null;

    if (!photo?.solvedCamera || opacity <= 0) {
      setTexture(null);
      return;
    }

    db.photoBlobs.get(photo.id).then((rec) => {
      if (!active || !rec) return;
      objectUrl = URL.createObjectURL(rec.blob);
      const loader = new THREE.TextureLoader();
      loader.load(objectUrl, (tex) => {
        if (!active) {
          tex.dispose();
          return;
        }
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.minFilter = THREE.LinearFilter;
        loadedTex = tex;
        setTexture(tex);
      });
    });

    return () => {
      active = false;
      if (loadedTex) loadedTex.dispose();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [photo?.id, photo?.solvedCamera, opacity]);

  // Exact frustum plane dimensions matching PnP vertical FOV & photo aspect ratio
  const geometryData = useMemo(() => {
    if (!photo?.solvedCamera) return null;
    const fovRad = THREE.MathUtils.degToRad(photo.solvedCamera.fov);
    const planeHeight = 2 * distance * Math.tan(fovRad / 2);
    const aspect = photo.width / photo.height;
    const planeWidth = planeHeight * aspect;

    const hw = planeWidth / 2;
    const hh = planeHeight / 2;
    const z = -distance;

    // 4 frustum rays from camera optical center (0,0,0) to image plane corners
    const rayPoints = new Float32Array([
      0, 0, 0, -hw,  hh, z,
      0, 0, 0,  hw,  hh, z,
      0, 0, 0,  hw, -hh, z,
      0, 0, 0, -hw, -hh, z,
    ]);

    const rayGeo = new THREE.BufferGeometry();
    rayGeo.setAttribute('position', new THREE.BufferAttribute(rayPoints, 3));

    return { planeWidth, planeHeight, rayGeo };
  }, [photo?.width, photo?.height, photo?.solvedCamera, distance]);

  if (!photo?.solvedCamera || !texture || !geometryData || opacity <= 0) {
    return null;
  }

  const { position, quaternion } = photo.solvedCamera;
  const quat = new THREE.Quaternion(...quaternion);

  return (
    <group position={position} quaternion={quat}>
      {/* Semi-transparent calibrated photo plane */}
      <mesh position={[0, 0, -distance]} renderOrder={10}>
        <planeGeometry args={[geometryData.planeWidth, geometryData.planeHeight]} />
        <meshBasicMaterial
          map={texture}
          transparent
          opacity={opacity}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Border frame around projected photo */}
      <lineSegments position={[0, 0, -distance]}>
        <edgesGeometry
          args={[new THREE.PlaneGeometry(geometryData.planeWidth, geometryData.planeHeight)]}
        />
        <lineBasicMaterial color="#38bdf8" transparent opacity={0.85} />
      </lineSegments>

      {/* Frustum rays from camera center to image corners */}
      <lineSegments geometry={geometryData.rayGeo}>
        <lineBasicMaterial color="#38bdf8" transparent opacity={0.45} />
      </lineSegments>
    </group>
  );
};