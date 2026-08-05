import type { DetectedPose, PoseLandmark } from '../../pose/types.ts'
import type { SquatSide } from './types.ts'

export interface AnalysisPoint {
  x: number
  y: number
  z?: number
}

export interface SideLandmarks {
  side: SquatSide
  shoulder: AnalysisPoint
  hip: AnalysisPoint
  knee: AnalysisPoint
  ankle: AnalysisPoint
  heel: AnalysisPoint | null
  footIndex: AnalysisPoint | null
  worldShoulder: AnalysisPoint | null
  worldHip: AnalysisPoint | null
  worldKnee: AnalysisPoint | null
  worldAnkle: AnalysisPoint | null
  quality: number
}

export const SQUAT_LANDMARK_INDEXES = {
  left: { shoulder: 11, hip: 23, knee: 25, ankle: 27, heel: 29, footIndex: 31 },
  right: { shoulder: 12, hip: 24, knee: 26, ankle: 28, heel: 30, footIndex: 32 },
} as const

const CORE_NAMES = ['shoulder', 'hip', 'knee', 'ankle'] as const

export function isFiniteLandmark(landmark: PoseLandmark | undefined): landmark is PoseLandmark {
  return Boolean(
    landmark &&
      Number.isFinite(landmark.x) &&
      Number.isFinite(landmark.y) &&
      (landmark.z === undefined || Number.isFinite(landmark.z)),
  )
}

function point(landmark: PoseLandmark | undefined): AnalysisPoint | null {
  if (!isFiniteLandmark(landmark)) return null
  return {
    x: landmark.x,
    y: landmark.y,
    ...(landmark.z === undefined ? {} : { z: landmark.z }),
  }
}

/** Missing visibility is treated as zero because the adapter does not guarantee it. */
export function landmarkConfidence(landmark: PoseLandmark | undefined): number {
  if (!isFiniteLandmark(landmark) || !Number.isFinite(landmark.visibility)) return 0
  return Math.max(0, Math.min(1, landmark.visibility ?? 0))
}

export function sideQuality(pose: DetectedPose, side: SquatSide): number {
  const indexes = SQUAT_LANDMARK_INDEXES[side]
  const confidences = CORE_NAMES.map((name) => landmarkConfidence(pose.landmarks[indexes[name]]))
  return confidences.reduce((sum, value) => sum + value, 0) / confidences.length
}

export function extractSideLandmarks(
  pose: DetectedPose,
  side: SquatSide,
  minimumVisibility: number,
): SideLandmarks | null {
  const indexes = SQUAT_LANDMARK_INDEXES[side]
  const image = Object.fromEntries(
    CORE_NAMES.map((name) => [name, pose.landmarks[indexes[name]]]),
  ) as Record<(typeof CORE_NAMES)[number], PoseLandmark | undefined>

  if (
    CORE_NAMES.some(
      (name) => !isFiniteLandmark(image[name]) || landmarkConfidence(image[name]) < minimumVisibility,
    )
  ) {
    return null
  }

  const world = pose.worldLandmarks
  return {
    side,
    shoulder: point(image.shoulder)!,
    hip: point(image.hip)!,
    knee: point(image.knee)!,
    ankle: point(image.ankle)!,
    heel: point(pose.landmarks[indexes.heel]),
    footIndex: point(pose.landmarks[indexes.footIndex]),
    worldShoulder: point(world?.[indexes.shoulder]),
    worldHip: point(world?.[indexes.hip]),
    worldKnee: point(world?.[indexes.knee]),
    worldAnkle: point(world?.[indexes.ankle]),
    quality: sideQuality(pose, side),
  }
}
