/**
 * Central asset boundary for the browser pose runtime.
 *
 * Phase 1 intentionally fetches the version-pinned WASM runtime and the official
 * Pose Landmarker Lite model at runtime. This avoids committing a large model
 * binary, but requires network access and CSP/CORS permission for both origins.
 * These URLs can later be replaced with same-origin assets without changing the
 * estimator or UI contracts.
 */
export const POSE_ASSETS = {
  wasmBaseUrl: 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm',
  modelUrl:
    'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
} as const

export const MIN_POSE_VISIBILITY = 0.5
