import { extractFrameAngles } from './jointAngles'
import type { PoseLandmark } from './types'

export type ExerciseLabel =
  | 'SQUAT'
  | 'DEADLIFT'
  | 'BENCH_PRESS'
  | 'OVERHEAD_PRESS'
  | 'BICEP_CURL'
  | 'LUNGE'
  | 'UNKNOWN'

export interface ExerciseClassification {
  label: ExerciseLabel
  confidence: number
  source: 'heuristic'
  reason?: string
}

const UNKNOWN: ExerciseClassification = {
  label: 'UNKNOWN',
  confidence: 0,
  source: 'heuristic',
  reason: 'Insufficient or ambiguous visible pose evidence',
}

const clamp01 = (value: number) => Math.max(0, Math.min(1, value))

function pointVisibility(landmarks: PoseLandmark[], indices: number[]): number {
  if (indices.some((index) => !landmarks[index])) return 0
  return indices.reduce((sum, index) => sum + (landmarks[index].visibility ?? 1), 0) / indices.length
}

function horizontalAlignment(landmarks: PoseLandmark[], aspectRatio: number): number {
  const sides = [[11, 23, 27], [12, 24, 28]] as const
  return Math.max(...sides.map(([shoulderIndex, hipIndex, ankleIndex]) => {
    const visibility = pointVisibility(landmarks, [shoulderIndex, hipIndex, ankleIndex])
    if (visibility < 0.6) return 0
    const shoulder = landmarks[shoulderIndex]
    const ankle = landmarks[ankleIndex]
    const dx = Math.abs((ankle.x - shoulder.x) * aspectRatio)
    const dy = Math.abs(ankle.y - shoulder.y)
    return clamp01((dx - dy * 1.5) / 0.45) * visibility
  }))
}

/** Geometry-only classifier. It deliberately returns UNKNOWN when movement signatures overlap. */
export function classifyExercise(landmarks: PoseLandmark[], aspectRatio: number): ExerciseClassification {
  const angles = extractFrameAngles(landmarks, aspectRatio)
  if (!angles || angles.confidence < 0.65) return UNKNOWN

  const horizontal = horizontalAlignment(landmarks, aspectRatio)
  const upright = 1 - horizontal
  const shoulderVisibility = pointVisibility(landmarks, [11, 12, 15, 16])
  const lowerVisibility = pointVisibility(landmarks, [23, 24, 25, 26, 27, 28])
  const wristsAboveShoulders = shoulderVisibility < 0.6 ? 0 : clamp01(
    ((landmarks[11].y + landmarks[12].y) / 2 - (landmarks[15].y + landmarks[16].y) / 2 + 0.05) / 0.35,
  )
  const shoulderWidth = Math.max(0.08, Math.abs(landmarks[11].x - landmarks[12].x))
  const stanceWidth = Math.abs(landmarks[27].x - landmarks[28].x) / shoulderWidth
  const wideStance = clamp01((stanceWidth - 1.15) / 1.4) * lowerVisibility
  const kneeFlexion = clamp01((170 - angles.knee) / 75)
  const hipFlexion = clamp01((170 - angles.hip) / 80)
  const elbowFlexion = clamp01((155 - angles.elbow) / 90)
  const elbowExtension = clamp01((angles.elbow - 115) / 55)
  const torsoInclination = clamp01((angles.back - 25) / 65)

  const candidates: Array<[Exclude<ExerciseLabel, 'UNKNOWN'>, number, string]> = [
    ['BENCH_PRESS', horizontal * clamp01((angles.shoulder - 20) / 65) * (0.6 + elbowFlexion * 0.4), 'Horizontal torso with press-range shoulder and elbow geometry'],
    ['OVERHEAD_PRESS', upright * wristsAboveShoulders * (0.55 + elbowExtension * 0.45), 'Upright torso with both wrists above the shoulders'],
    ['LUNGE', upright * wideStance * kneeFlexion * (0.65 + hipFlexion * 0.35), 'Split stance with visible knee and hip flexion'],
    ['DEADLIFT', upright * torsoInclination * hipFlexion * (0.55 + (1 - kneeFlexion) * 0.45), 'Hip hinge with inclined torso and comparatively extended knees'],
    ['SQUAT', upright * kneeFlexion * hipFlexion * (0.7 + (1 - wideStance) * 0.3), 'Bilateral stance with concurrent hip and knee flexion'],
    ['BICEP_CURL', upright * elbowFlexion * (1 - wristsAboveShoulders) * clamp01((85 - angles.shoulder) / 70), 'Upright torso with elbow flexion below shoulder height'],
  ]
  candidates.sort((a, b) => b[1] - a[1])
  const [label, score, reason] = candidates[0]
  const confidence = clamp01(score * angles.confidence)
  const runnerUp = candidates[1][1] * angles.confidence
  if (confidence < 0.58 || confidence - runnerUp < 0.08) return UNKNOWN
  return { label, confidence, source: 'heuristic', reason }
}

/** Requires repeated evidence before offering a movement for user confirmation. */
export class ExerciseClassifier {
  private stable: ExerciseClassification = UNKNOWN
  private candidate: ExerciseLabel = 'UNKNOWN'
  private candidateFrames = 0

  classify(landmarks: PoseLandmark[], aspectRatio: number): ExerciseClassification {
    const next = classifyExercise(landmarks, aspectRatio)
    if (next.label === 'UNKNOWN') {
      this.candidate = 'UNKNOWN'
      this.candidateFrames = 0
      this.stable = next
      return this.stable
    }
    if (next.label !== this.candidate) {
      this.candidate = next.label
      this.candidateFrames = 1
    } else {
      this.candidateFrames += 1
    }
    if (this.candidateFrames >= 5) this.stable = next
    return this.stable
  }

  reset(): void {
    this.stable = UNKNOWN
    this.candidate = 'UNKNOWN'
    this.candidateFrames = 0
  }
}
