import { extractFrameAngles } from './jointAngles'
import type { PoseLandmark } from './types'

export type ExerciseLabel = 'SQUAT' | 'BICEP_CURL' | 'PUSH_UP' | 'UNKNOWN'

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
  reason: 'Insufficient visible pose evidence',
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

/** Classifies only observable geometry; weak or occluded evidence stays UNKNOWN. */
export function classifyExercise(
  landmarks: PoseLandmark[],
  aspectRatio: number,
): ExerciseClassification {
  const angles = extractFrameAngles(landmarks, aspectRatio)
  if (!angles || angles.confidence < 0.65) return UNKNOWN

  const horizontal = horizontalAlignment(landmarks, aspectRatio)
  const pushUp = horizontal * clamp01((angles.shoulder - 25) / 55)
  const squat = (1 - horizontal) * clamp01((170 - angles.knee) / 55 + 0.35) *
    clamp01((175 - angles.hip) / 55 + 0.3)
  const curl = (1 - horizontal) * clamp01((155 - angles.elbow) / 85 + 0.25) *
    clamp01((80 - angles.shoulder) / 60)

  const candidates: Array<[Exclude<ExerciseLabel, 'UNKNOWN'>, number, string]> = [
    ['PUSH_UP', pushUp, 'Horizontal shoulder-to-ankle alignment with usable arm geometry'],
    ['SQUAT', squat, 'Usable hip-knee-ankle chain with squat-compatible posture'],
    ['BICEP_CURL', curl, 'Usable shoulder-elbow-wrist chain with curl-compatible arm posture'],
  ]
  candidates.sort((a, b) => b[1] - a[1])
  const [label, score, reason] = candidates[0]
  const confidence = clamp01(score * angles.confidence)
  if (confidence < 0.58 || confidence - candidates[1][1] * angles.confidence < 0.08) return UNKNOWN
  return { label, confidence, source: 'heuristic', reason }
}

/** Requires repeated evidence before changing a stable label. */
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
    if (this.candidateFrames >= 3) this.stable = next
    return this.stable
  }

  reset(): void {
    this.stable = UNKNOWN
    this.candidate = 'UNKNOWN'
    this.candidateFrames = 0
  }
}
