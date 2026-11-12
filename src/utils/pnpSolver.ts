import cvModule from '@techstark/opencv-js';
import * as THREE from 'three';
import { LandmarkCorrespondence } from '../types/calibration';

let cvPromise: Promise<any> | null = null;

export function getCv(): Promise<any> {
  if (cvPromise) return cvPromise;

  cvPromise = new Promise(async (resolve, reject) => {
    try {
      // Handle builds where cvModule is already a Promise
      const resolvedModule = cvModule instanceof Promise ? await cvModule : cvModule;

      if (resolvedModule && resolvedModule.Mat) {
        resolve(resolvedModule);
        return;
      }

      // Otherwise wait for WASM runtime callback
      resolvedModule.onRuntimeInitialized = () => {
        resolve(resolvedModule);
      };

      // Safety fallback if callback already fired
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
