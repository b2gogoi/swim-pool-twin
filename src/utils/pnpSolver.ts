import cvModule from '@techstark/opencv-js';
import * as THREE from 'three';
import { LandmarkCorrespondence } from '../types/calibration';

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

export async function solvePhotoCameraPose(
  imageWidth: number,
  imageHeight: number,
  correspondences: LandmarkCorrespondence[],
  estimatedFovDeg = 52
) {
  if (correspondences.length < 4) {
    throw new Error('At least 4 landmark correspondences are required.');
  }

  const cv = await getCv();

  // 1. Construct Camera Intrinsic Matrix K from image dimensions & vertical FOV
  const fovRad = THREE.MathUtils.degToRad(estimatedFovDeg);
  const fy = imageHeight / (2 * Math.tan(fovRad / 2));
  const fx = fy; // Assume square pixels
  const cx = imageWidth / 2;
  const cy = imageHeight / 2;

  const cameraMatrix = cv.matFromArray(3, 3, cv.CV_64F, [
    fx, 0, cx,
    0, fy, cy,
    0, 0, 1,
  ]);
  const distCoeffs = cv.Mat.zeros(4, 1, cv.CV_64F);

  // 2. Pack 3D World Points & 2D Image Points
  const objPtsArray: number[] = [];
  const imgPtsArray: number[] = [];

  correspondences.forEach((c) => {
    objPtsArray.push(c.world.x, c.world.y, c.world.z);
    imgPtsArray.push(c.pixel.u, c.pixel.v);
  });

  const objectPoints = cv.matFromArray(
    correspondences.length,
    1,
    cv.CV_64FC3,
    objPtsArray
  );
  const imagePoints = cv.matFromArray(
    correspondences.length,
    1,
    cv.CV_64FC2,
    imgPtsArray
  );

  const rvec = new cv.Mat();
  const tvec = new cv.Mat();

  let success = false;
  try {
    // SOLVEPNP_SQPNP handles both planar and non-planar >= 4 point configurations cleanly
    const flag = cv.SOLVEPNP_SQPNP !== undefined ? cv.SOLVEPNP_SQPNP : cv.SOLVEPNP_ITERATIVE;
    success = cv.solvePnP(
      objectPoints,
      imagePoints,
      cameraMatrix,
      distCoeffs,
      rvec,
      tvec,
      false,
      flag
    );
  } catch {
    success = cv.solvePnP(
      objectPoints,
      imagePoints,
      cameraMatrix,
      distCoeffs,
      rvec,
      tvec,
      false,
      cv.SOLVEPNP_ITERATIVE
    );
  }

  if (!success) {
    cameraMatrix.delete();
    distCoeffs.delete();
    objectPoints.delete();
    imagePoints.delete();
    rvec.delete();
    tvec.delete();
    throw new Error('PnP solver failed to converge. Check that points are not collinear.');
  }

  // 3. Calculate Mean Reprojection Error (in pixels) to verify calibration accuracy
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
  const reprojectionError = parseFloat((totalError / correspondences.length).toFixed(2));

  // 4. Convert Rodrigues rvec -> 3x3 Rotation Matrix R
  const R = new cv.Mat();
  cv.Rodrigues(rvec, R);

  const rData = R.data64F;
  const tData = tvec.data64F;

  // Camera World Position in meters: C = -R^T * t
  const rotMat3 = new THREE.Matrix3().set(
    rData[0], rData[1], rData[2],
    rData[3], rData[4], rData[5],
    rData[6], rData[7], rData[8]
  );
  const rotTranspose = rotMat3.clone().transpose();
  const tVec3 = new THREE.Vector3(tData[0], tData[1], tData[2]);
  const camWorldPos = tVec3.clone().applyMatrix3(rotTranspose).negate();

  // 5. Convert OpenCV Camera Orientation (+X right, +Y down, +Z forward)
  //    to Three.js Camera Orientation (+X right, +Y up, -Z forward)
  const basisMatrix = new THREE.Matrix4().set(
    rData[0], rData[3], rData[6], 0,
    rData[1], rData[4], rData[7], 0,
    rData[2], rData[5], rData[8], 0,
    0,        0,        0,        1
  );
  const cvToThree = new THREE.Matrix4().makeScale(1, -1, -1);
  basisMatrix.multiply(cvToThree);

  const quaternion = new THREE.Quaternion().setFromRotationMatrix(basisMatrix);

  // Clean up OpenCV WASM heap memory
  cameraMatrix.delete();
  distCoeffs.delete();
  objectPoints.delete();
  imagePoints.delete();
  projectedPts.delete();
  rvec.delete();
  tvec.delete();
  R.delete();

  return {
    position: [
      parseFloat(camWorldPos.x.toFixed(2)),
      parseFloat(camWorldPos.y.toFixed(2)),
      parseFloat(camWorldPos.z.toFixed(2)),
    ] as [number, number, number],
    quaternion: [
      quaternion.x,
      quaternion.y,
      quaternion.z,
      quaternion.w,
    ] as [number, number, number, number],
    fov: estimatedFovDeg,
    reprojectionError,
  };
}
