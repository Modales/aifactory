import type { DetectedPose } from '../../pose/types.ts'
import {
  SQUAT_LANDMARK_INDEXES,
  extractSideLandmarks,
  isFiniteLandmark,
  type AnalysisPoint,
} from './landmarks.ts'
import type { SquatSide } from './types.ts'

export interface Point2 {
  x: number
  y: number
}

export interface SquatGeometry {
  kneeAngle: number
  hipAngle: number
  torsoInclination: number
  shinInclination: number
  thighLength: number
  normalizedDepth: number
  hipVerticalRatio: number
  confidence: number
  angleSpace: 'world' | 'image'
}

export function isFinitePoint(point: AnalysisPoint | Point2 | null | undefined): point is AnalysisPoint {
  return Boolean(
    point &&
      Number.isFinite(point.x) &&
      Number.isFinite(point.y) &&
      (!('z' in point) || point.z === undefined || Number.isFinite(point.z)),
  )
}

export function toImagePoint(point: AnalysisPoint, width: number, height: number): Point2 | null {
  if (!isFinitePoint(point) || !Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return null
  }
  return { x: point.x * width, y: point.y * height }
}

export function distance(a: AnalysisPoint | Point2, b: AnalysisPoint | Point2): number | null {
  if (!isFinitePoint(a) || !isFinitePoint(b)) return null
  const az = 'z' in a && a.z !== undefined ? a.z : 0
  const bz = 'z' in b && b.z !== undefined ? b.z : 0
  const value = Math.hypot(a.x - b.x, a.y - b.y, az - bz)
  return Number.isFinite(value) ? value : null
}

export function angle(a: AnalysisPoint | Point2, vertex: AnalysisPoint | Point2, c: AnalysisPoint | Point2): number | null {
  if (!isFinitePoint(a) || !isFinitePoint(vertex) || !isFinitePoint(c)) return null
  const az = 'z' in a && a.z !== undefined ? a.z : 0
  const vz = 'z' in vertex && vertex.z !== undefined ? vertex.z : 0
  const cz = 'z' in c && c.z !== undefined ? c.z : 0
  const first = { x: a.x - vertex.x, y: a.y - vertex.y, z: az - vz }
  const second = { x: c.x - vertex.x, y: c.y - vertex.y, z: cz - vz }
  const firstLength = Math.hypot(first.x, first.y, first.z)
  const secondLength = Math.hypot(second.x, second.y, second.z)
  if (firstLength <= Number.EPSILON || secondLength <= Number.EPSILON) return null
  const cosine =
    (first.x * second.x + first.y * second.y + first.z * second.z) /
    (firstLength * secondLength)
  return (Math.acos(Math.max(-1, Math.min(1, cosine))) * 180) / Math.PI
}

export function inclinationFromVertical(start: Point2, end: Point2): number | null {
  if (!isFinitePoint(start) || !isFinitePoint(end)) return null
  const dx = end.x - start.x
  const dy = end.y - start.y
  const length = Math.hypot(dx, dy)
  if (length <= Number.EPSILON) return null
  return (Math.acos(Math.max(-1, Math.min(1, -dy / length))) * 180) / Math.PI
}

/** Image y increases downward; positive depth means the hip is below the knee. */
export function normalizedHipToKneeDepth(hip: Point2, knee: Point2, thighLength: number): number | null {
  if (!isFinitePoint(hip) || !isFinitePoint(knee) || !Number.isFinite(thighLength) || thighLength <= Number.EPSILON) return null
  return (hip.y - knee.y) / thighLength
}

export function calculateSquatGeometry(
  pose: DetectedPose,
  side: SquatSide,
  videoSize: { width: number; height: number },
  minimumVisibility: number,
): SquatGeometry | null {
  const landmarks = extractSideLandmarks(pose, side, minimumVisibility)
  if (!landmarks) return null
  const shoulder = toImagePoint(landmarks.shoulder, videoSize.width, videoSize.height)
  const hip = toImagePoint(landmarks.hip, videoSize.width, videoSize.height)
  const knee = toImagePoint(landmarks.knee, videoSize.width, videoSize.height)
  const ankle = toImagePoint(landmarks.ankle, videoSize.width, videoSize.height)
  if (!shoulder || !hip || !knee || !ankle) return null

  const worldReady =
    isFinitePoint(landmarks.worldShoulder) &&
    isFinitePoint(landmarks.worldHip) &&
    isFinitePoint(landmarks.worldKnee) &&
    isFinitePoint(landmarks.worldAnkle)
  const kneeAngle = worldReady
    ? angle(landmarks.worldHip!, landmarks.worldKnee!, landmarks.worldAnkle!)
    : angle(hip, knee, ankle)
  const hipAngle = worldReady
    ? angle(landmarks.worldShoulder!, landmarks.worldHip!, landmarks.worldKnee!)
    : angle(shoulder, hip, knee)
  const torsoInclination = inclinationFromVertical(hip, shoulder)
  const shinInclination = inclinationFromVertical(ankle, knee)
  const thighLength = distance(hip, knee)
  if (
    kneeAngle === null ||
    hipAngle === null ||
    torsoInclination === null ||
    shinInclination === null ||
    thighLength === null ||
    thighLength <= Number.EPSILON
  ) return null
  const normalizedDepth = normalizedHipToKneeDepth(hip, knee, thighLength)
  if (normalizedDepth === null) return null

  return {
    kneeAngle,
    hipAngle,
    torsoInclination,
    shinInclination,
    thighLength,
    normalizedDepth,
    hipVerticalRatio: hip.y / thighLength,
    confidence: landmarks.quality,
    angleSpace: worldReady ? 'world' : 'image',
  }
}

export function bilateralSeparation(
  pose: DetectedPose,
  videoSize: { width: number; height: number },
): number | null {
  const names = ['shoulder', 'hip', 'knee', 'ankle'] as const
  const pairs: Array<[Point2, Point2]> = []
  for (const name of names) {
    const left = pose.landmarks[SQUAT_LANDMARK_INDEXES.left[name]]
    const right = pose.landmarks[SQUAT_LANDMARK_INDEXES.right[name]]
    if (!isFiniteLandmark(left) || !isFiniteLandmark(right)) return null
    const leftPoint = toImagePoint(left, videoSize.width, videoSize.height)
    const rightPoint = toImagePoint(right, videoSize.width, videoSize.height)
    if (!leftPoint || !rightPoint) return null
    pairs.push([leftPoint, rightPoint])
  }
  const leftShoulder = pairs[0]?.[0]
  const rightShoulder = pairs[0]?.[1]
  const leftHip = pairs[1]?.[0]
  const rightHip = pairs[1]?.[1]
  if (!leftShoulder || !rightShoulder || !leftHip || !rightHip) return null
  const leftTorso = distance(leftShoulder, leftHip)
  const rightTorso = distance(rightShoulder, rightHip)
  if (leftTorso === null || rightTorso === null || leftTorso + rightTorso <= Number.EPSILON) return null
  const meanPairSeparation = pairs.reduce((sum, [left, right]) => sum + (distance(left, right) ?? 0), 0) / pairs.length
  return meanPairSeparation / ((leftTorso + rightTorso) / 2)
}
