import React, { useEffect, useState, useMemo } from 'react';
import * as THREE from 'three';
import { db, EventPhoto } from '../../db/poolDatabase';
import { usePoolStore } from '../../store/usePoolStore';

interface Props {
  photo: EventPhoto | null;
  opacity: number;
}

export const ProjectedPhoto3D: React.FC<Props> = ({ photo, opacity }) => {
  const { length, laneCount, laneWidth } = usePoolStore((s) => s.activePool);
  const poolWidth = laneCount * laneWidth;
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
        tex.magFilter = THREE.LinearFilter;
        // Clamp to transparent border outside [0, 1] UV range
        tex.wrapS = THREE.ClampToEdgeWrapping;
        tex.wrapT = THREE.ClampToEdgeWrapping;
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

  // Build projective UV-mapped pool plane + frustum boundary rays
  const { projectedGeo, frustumGeo } = useMemo(() => {
    if (!photo?.solvedCamera) {
      return { projectedGeo: null, frustumGeo: null };
    }

    const { position, quaternion, fov } = photo.solvedCamera;
    const camPos = new THREE.Vector3(...position);
    const threeQuat = new THREE.Quaternion(...quaternion);

    // Three.js camera looks down -Z, +Y up, +X right.
    // Convert to OpenCV camera frame (+Z forward, +Y down, +X right)
    const rotMatThree = new THREE.Matrix4().makeRotationFromQuaternion(threeQuat);
    const threeToCv = new THREE.Matrix4().makeScale(1, -1, -1);
    const cvWorldToCamRot = rotMatThree.clone().multiply(threeToCv).transpose();

    const fovRad = THREE.MathUtils.degToRad(fov);
    const fy = photo.height / (2 * Math.tan(fovRad / 2));
    const fx = fy;
    const cx = photo.width / 2;
    const cy = photo.height / 2;

    // Helper: project any 3D world point (X, Y, Z) -> normalized UV [0..1]
    const projectWorldToUV = (wx: number, wy: number, wz: number) => {
      const p = new THREE.Vector3(wx - camPos.x, wy - camPos.y, wz - camPos.z);
      p.applyMatrix4(cvWorldToCamRot);
      if (p.z <= 0.1) return null; // Behind camera
      const uPx = (fx * p.x) / p.z + cx;
      const vPx = (fy * p.y) / p.z + cy;
      // Three.js texture V=1 is top of image, V=0 is bottom
      return {
        u: uPx / photo.width,
        v: 1 - vPx / photo.height,
      };
    };

    // Subdivided plane covering pool + surrounding deck at Y = 0.045m
    const minX = -6;
    const maxX = length + 6;
    const minZ = -6;
    const maxZ = poolWidth + 6;
    const segX = 120;
    const segZ = 80;

    const positions: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];

    for (let iz = 0; iz <= segZ; iz++) {
      const wz = minZ + ((maxZ - minZ) * iz) / segZ;
      for (let ix = 0; ix <= segX; ix++) {
        const wx = minX + ((maxX - minX) * ix) / segX;
        const wy = 0.045;
        positions.push(wx, wy, wz);

        const uv = projectWorldToUV(wx, wy, wz);
        if (uv) {
          uvs.push(uv.u, uv.v);
        } else {
          uvs.push(-1, -1);
        }
      }
    }

    const rowStride = segX + 1;
    for (let iz = 0; iz < segZ; iz++) {
      for (let ix = 0; ix < segX; ix++) {
        const a = iz * rowStride + ix;
        const b = a + 1;
        const c = (iz + 1) * rowStride + ix;
        const d = c + 1;

        // Only emit triangles where at least one vertex falls inside [0..1] photo frame
        const inBounds = (idx: number) => {
          const u = uvs[idx * 2];
          const v = uvs[idx * 2 + 1];
          return u >= -0.02 && u <= 1.02 && v >= -0.02 && v <= 1.02;
        };

        if (inBounds(a) || inBounds(b) || inBounds(c)) {
          indices.push(a, c, b);
        }
        if (inBounds(b) || inBounds(c) || inBounds(d)) {
          indices.push(b, c, d);
        }
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);

    // Compute exact 3D ray intersections of the 4 image corners onto the Y = 0.045 plane
    const cornerPixels = [
      [0, 0],
      [photo.width, 0],
      [photo.width, photo.height],
      [0, photo.height],
    ];
    const cvCamToWorldRot = rotMatThree.clone().multiply(threeToCv);
    const groundCorners: THREE.Vector3[] = [];

    for (const [uPx, vPx] of cornerPixels) {
      const rayCam = new THREE.Vector3(
        (uPx - cx) / fx,
        (vPx - cy) / fy,
        1
      ).normalize();
      const rayWorld = rayCam.applyMatrix4(cvCamToWorldRot).normalize();

      // Intersect ray P = camPos + t * rayWorld with plane Y = 0.045 (clamped to max 90m)
      let hitPoint: THREE.Vector3;
      if (rayWorld.y < -0.02) {
        const t = Math.min(90, (0.045 - camPos.y) / rayWorld.y);
        hitPoint = camPos.clone().addScaledVector(rayWorld, t);
      } else {
        hitPoint = camPos.clone().addScaledVector(rayWorld, 45);
      }
      groundCorners.push(hitPoint);
    }

    // Frustum wireframe lines (4 rays from camera + 4 boundary edges on pool)
    const lineVerts: number[] = [];
    for (let i = 0; i < 4; i++) {
      const c1 = groundCorners[i];
      const c2 = groundCorners[(i + 1) % 4];
      // Ray from camera to corner
      lineVerts.push(camPos.x, camPos.y, camPos.z, c1.x, c1.y, c1.z);
      // Photo boundary edge on pool
      lineVerts.push(c1.x, c1.y, c1.z, c2.x, c2.y, c2.z);
    }

    const fGeo = new THREE.BufferGeometry();
    fGeo.setAttribute('position', new THREE.Float32BufferAttribute(lineVerts, 3));

    return { projectedGeo: geo, frustumGeo: fGeo };
  }, [photo, length, poolWidth]);

  if (!photo?.solvedCamera || !texture || !projectedGeo || opacity <= 0) {
    return null;
  }

  return (
    <group>
      {/* Projectively Mapped Photo Pinned Directly to 3D Pool Surface */}
      <mesh geometry={projectedGeo} renderOrder={5}>
        <meshBasicMaterial
          map={texture}
          transparent
          opacity={opacity}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* 3D Image Boundary Footprint & Frustum Rays */}
      {frustumGeo && (
        <lineSegments geometry={frustumGeo} renderOrder={6}>
          <lineBasicMaterial color="#38bdf8" transparent opacity={0.85} />
        </lineSegments>
      )}
    </group>
  );
};