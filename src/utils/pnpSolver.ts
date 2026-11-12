import cvModule from '@techstark/opencv-js';
import * as THREE from 'three';
import { LandmarkMapping } from '../db/poolDatabase';

let cvPromise: Promise<any> | null = null;

export function getCv(): Promise<any> {
  if (cvPromise) return cvPromise;

  cvPromise = new Promise(async (resolve, reject) => {
    try {
      const resolvedModule = cvModule instanceof Promise ? await cvModule : cvModule;

      if (resolvedModule && resolvedModule.Mat) {
        resolve(resolvedModule);
        return;
      }

      resolvedModule.onRuntimeInitialized = () => {
        resolve(resolvedModule);
      };

      setTimeout(() => {
        if (resolvedModule && resolvedModule.Mat) {
          resolve(resolvedModule);
        } else {
          reject(new Error('OpenCV WASM initialization timed out.'));
        }
      }, 10000);
    } catch (err) {
      reject(err);
    }
  });

  return cvPromise;
}

interface CandidatePose {
  position: [number, number, number];
  quaternion: [number, number, number, number];
  fov: number;
  reprojectionError: number;
  score: number;
}

function evaluatePose(
  cv: any,
  rvec: any,
  tvec: any,
  cameraMatrix: any,
  distCoeffs: any,
  objectPoints: any,
  correspondences: LandmarkMapping[],
  fovDeg: number
): CandidatePose | null {
  const R = new cv.Mat();
  cv.Rodrigues(rvec, R);

  const rData = R.data64F;
  const tData = tvec.data64F;

  // Check cheirality: every mapped 3D point must have positive depth Z_cam > 0.2m in front of camera
  for (let i = 0; i < correspondences.length; i++) {
    const { x, y, z } = correspondences[i].world;
    const zCam = rData[6] * x + rData[7] * y + rData[8] * z + tData[2];
    if (zCam <= 0.2) {
      R.delete();
      return null;
    }
  }

  // Camera world position: C = -R^T * t
  const rotMat3 = new THREE.Matrix3().set(
    rData[0], rData[1], rData[2],
    rData[3], rData[4], rData[5],
    rData[6], rData[7], rData[8]
  );
  const rotTranspose = rotMat3.clone().transpose();
  const tVec3 = new THREE.Vector3(tData[0], tData[1], tData[2]);
  const camWorldPos = tVec3.clone().applyMatrix3(rotTranspose).negate();

  // Reject impossible underground / underwater camera positions (photographer is above deck Y > 0.2m)
  if (!Number.isFinite(camWorldPos.x) || camWorldPos.y <= 0.2 || camWorldPos.y > 60) {
    R.delete();
    return null;
  }

  // Compute pixel reprojection error
  const projectedPts = new cv.Mat();
  cv.projectPoints(objectPoints, rvec, tvec, cameraMatrix, distCoeffs, projectedPts);

  let totalError = 0;
  for (let i = 0; i < correspondences.length; i++) {
    const projU = projectedPts.data64F[i * 2];
    const projV = projectedPts.data64F[i * 2 + 1];
    const du = projU - correspondences[i].pixel.u;
    const dv = projV - correspondences[i].pixel.v;
    totalError += Math.sqrt(du * du + dv * dv);
  }
  const reprojectionError = totalError / correspondences.length;

  // Convert OpenCV camera axes (+X right, +Y down, +Z forward) to Three.js (+X right, +Y up, -Z forward)
  const basisMatrix = new THREE.Matrix4().set(
    rData[0], rData[3], rData[6], 0,
    rData[1], rData[4], rData[7], 0,
    rData[2], rData[5], rData[8], 0,
    0,        0,        0,        1
  );
  const cvToThree = new THREE.Matrix4().makeScale(1, -1, -1);
  basisMatrix.multiply(cvToThree);
  const quaternion = new THREE.Quaternion().setFromRotationMatrix(basisMatrix);

  projectedPts.delete();
  R.delete();

  // Penalize poses standing directly inside the water basin (X in [0.5, 49.5], Z in [0.5, 24.5], Y < 2.5)
  const inWaterPenalty =
    camWorldPos.x > 0.5 &&
    camWorldPos.x < 49.5 &&
    camWorldPos.z > 0.5 &&
    camWorldPos.z < 24.5 &&
    camWorldPos.y < 2.5
      ? 25
      : 0;

  return {
    position: [
      parseFloat(camWorldPos.x.toFixed(2)),
      parseFloat(camWorldPos.y.toFixed(2)),
      parseFloat(camWorldPos.z.toFixed(2)),
    ],
    quaternion: [quaternion.x, quaternion.y, quaternion.z, quaternion.w],
    fov: fovDeg,
    reprojectionError: parseFloat(reprojectionError.toFixed(2)),
    score: reprojectionError + inWaterPenalty,
  };
}

export async function solvePhotoCameraPose(
  imageWidth: number,
  imageHeight: number,
  correspondences: LandmarkMapping[],
  estimatedFovDeg = 52
) {
  if (correspondences.length < 4) {
    throw new Error('At least 4 landmark correspondences are required.');
  }

  const cv = await getCv();

  const objPtsArray: number[] = [];
  const imgPtsArray: number[] = [];

  correspondences.forEach((c) => {
    objPtsArray.push(c.world.x, c.world.y, c.world.z);
    imgPtsArray.push(c.pixel.u, c.pixel.v);
  });

  const objectPoints = cv.matFromArray(correspondences.length, 1, cv.CV_64FC3, objPtsArray);
  const imagePoints = cv.matFromArray(correspondences.length, 1, cv.CV_64FC2, imgPtsArray);
  const distCoeffs = cv.Mat.zeros(4, 1, cv.CV_64F);

  // Test user's FOV plus a sweep across telephoto (24°) to wide-angle (76°) lenses
  // so zoomed shots don't falsely push the camera forward past the 25m ladder
  const candidateFovs = Array.from(
    new Set([
      estimatedFovDeg,
      24, 28, 32, 36, 40, 44, 48, 52, 56, 60, 66, 72,
    ])
  );

  let bestCandidate: CandidatePose | null = null;

  for (const fovDeg of candidateFovs) {
    const fovRad = THREE.MathUtils.degToRad(fovDeg);
    const fy = imageHeight / (2 * Math.tan(fovRad / 2));
    const fx = fy;
    const cx = imageWidth / 2;
    const cy = imageHeight / 2;

    const cameraMatrix = cv.matFromArray(3, 3, cv.CV_64F, [
      fx, 0, cx,
      0, fy, cy,
      0, 0, 1,
    ]);

    // 1. Try solvePnPGeneric to evaluate ALL geometric branches (avoids mirrored/flipped solutions)
    if (typeof cv.solvePnPGeneric === 'function') {
      const rvecs = new cv.MatVector();
      const tvecs = new cv.MatVector();
      try {
        const method =
          cv.SOLVEPNP_SQPNP !== undefined ? cv.SOLVEPNP_SQPNP : cv.SOLVEPNP_ITERATIVE;
        const solutions = cv.solvePnPGeneric(
          objectPoints,
          imagePoints,
          cameraMatrix,
          distCoeffs,
          rvecs,
          tvecs,
          false,
          method
        );

        for (let s = 0; s < solutions; s++) {
          const rv = rvecs.get(s);
          const tv = tvecs.get(s);
          // Refine each candidate with Levenberg-Marquardt / iterative PnP
          cv.solvePnP(
            objectPoints,
            imagePoints,
            cameraMatrix,
            distCoeffs,
            rv,
            tv,
            true,
            cv.SOLVEPNP_ITERATIVE
          );
          const cand = evaluatePose(
            cv,
            rv,
            tv,
            cameraMatrix,
            distCoeffs,
            objectPoints,
            correspondences,
            fovDeg
          );
          // Slight preference (0.15px) toward the user's specified FOV when errors are tied
          if (cand) {
            cand.score += Math.abs(fovDeg - estimatedFovDeg) * 0.03;
            if (!bestCandidate || cand.score < bestCandidate.score) {
              bestCandidate = cand;
            }
          }
          rv.delete();
          tv.delete();
        }
      } catch {
        // Fallback below
      }
      rvecs.delete();
      tvecs.delete();
    }

    // 2. Fallback standard solvePnP
    const rvec = new cv.Mat();
    const tvec = new cv.Mat();
    try {
      const ok = cv.solvePnP(
        objectPoints,
        imagePoints,
        cameraMatrix,
        distCoeffs,
        rvec,
        tvec,
        false,
        cv.SOLVEPNP_ITERATIVE
      );
      if (ok) {
        const cand = evaluatePose(
          cv,
          rvec,
          tvec,
          cameraMatrix,
          distCoeffs,
          objectPoints,
          correspondences,
          fovDeg
        );
        if (cand) {
          cand.score += Math.abs(fovDeg - estimatedFovDeg) * 0.03;
          if (!bestCandidate || cand.score < bestCandidate.score) {
            bestCandidate = cand;
          }
        }
      }
    } catch {
      // Ignore failed FOV candidate
    }

    rvec.delete();
    tvec.delete();
    cameraMatrix.delete();
  }

  distCoeffs.delete();
  objectPoints.delete();
  imagePoints.delete();

  if (!bestCandidate) {
    throw new Error(
      'PnP solver could not find a valid above-deck camera pose. Ensure at least 1 non-coplanar point (like a flag pole top or ladder top) is mapped.'
    );
  }

  return {
    position: bestCandidate.position,
    quaternion: bestCandidate.quaternion,
    fov: bestCandidate.fov,
    reprojectionError: bestCandidate.reprojectionError,
  };
}