import type { DetectedPose, PoseLandmark } from '../../src/lib/pose/types.ts'
import type { RepDraft, SquatKinematicFrame } from '../../src/lib/analysis/squat/stateMachine.ts'
import { DEFAULT_SQUAT_ANALYZER_CONFIG, type SquatAnalyzerConfig, type SquatFrameInput } from '../../src/lib/analysis/squat/types.ts'

export function config(overrides: Partial<SquatAnalyzerConfig> = {}): SquatAnalyzerConfig {
  return { ...DEFAULT_SQUAT_ANALYZER_CONFIG, ...overrides }
}

export function landmark(x: number, y: number, visibility = 0.95, z?: number): PoseLandmark {
  return { x, y, visibility, ...(z === undefined ? {} : { z }) }
}

export function poseWithSides(options: {
  leftVisibility?: number
  rightVisibility?: number
  separation?: number
  world?: boolean
} = {}): DetectedPose {
  const points = Array.from({ length: 33 }, () => landmark(0.5, 0.5, 0.1))
  const leftVisibility = options.leftVisibility ?? 0.95
  const rightVisibility = options.rightVisibility ?? 0.8
  const separation = options.separation ?? 0.005
  const setSide = (indexes: number[], offset: number, visibility: number) => {
    const coordinates = [
      [0.5 + offset, 0.25],
      [0.5 + offset, 0.5],
      [0.5 + offset, 0.7],
      [0.5 + offset, 0.9],
      [0.5 + offset, 0.94],
      [0.53 + offset, 0.96],
    ]
    indexes.forEach((index, position) => {
      const coordinate = coordinates[position]!
      points[index] = landmark(coordinate[0]!, coordinate[1]!, visibility)
    })
  }
  setSide([11, 23, 25, 27, 29, 31], -separation / 2, leftVisibility)
  setSide([12, 24, 26, 28, 30, 32], separation / 2, rightVisibility)
  return { landmarks: points, ...(options.world ? { worldLandmarks: points.map((point) => ({ ...point })) } : {}) }
}

export function squatPose(kneeAngleDegrees: number, visibility = 0.95): DetectedPose {
  const points = Array.from({ length: 33 }, () => landmark(0.5, 0.5, 0.1))
  const width = 640
  const height = 480
  const knee = { x: 320, y: 300 }
  const radians = (kneeAngleDegrees * Math.PI) / 180
  const hip = { x: knee.x - Math.sin(radians) * 100, y: knee.y + Math.cos(radians) * 100 }
  const ankle = { x: knee.x, y: knee.y + 100 }
  const shoulder = { x: hip.x + (hip.x - knee.x), y: hip.y + (hip.y - knee.y) }
  const coordinates = [shoulder, hip, knee, ankle, { x: ankle.x, y: ankle.y + 12 }, { x: ankle.x + 30, y: ankle.y + 12 }]
  const setSide = (indexes: number[], offset: number, confidence: number) => {
    indexes.forEach((index, position) => {
      const value = coordinates[position]!
      points[index] = landmark((value.x + offset) / width, value.y / height, confidence)
    })
  }
  setSide([11, 23, 25, 27, 29, 31], -1, visibility)
  setSide([12, 24, 26, 28, 30, 32], 1, visibility - 0.1)
  return { landmarks: points }
}

export function input(pose: DetectedPose | null, mediaTimeMs: number, overrides: Partial<SquatFrameInput> = {}): SquatFrameInput {
  return {
    pose,
    timestampMs: mediaTimeMs,
    mediaTimeMs,
    timelineRevision: 0,
    lifecycleKey: 'source:1',
    videoSize: { width: 640, height: 480 },
    ...overrides,
  }
}

export function frame(mediaTimeMs: number, overrides: Partial<SquatKinematicFrame> = {}): SquatKinematicFrame {
  return {
    mediaTimeMs,
    side: 'left',
    kneeAngle: 175,
    hipAngle: 175,
    torsoInclination: 5,
    normalizedDepth: -0.8,
    hipVerticalRatio: 2,
    kneeVelocity: 0,
    confidence: 0.95,
    ...overrides,
  }
}

export function repDraft(overrides: Partial<RepDraft> = {}): RepDraft {
  return {
    startedAtMs: 0,
    completedAtMs: 2400,
    durationMs: 2400,
    descentMs: 1400,
    ascentMs: 1000,
    side: 'left',
    depth: 'reached',
    minimumKneeAngle: 85,
    minimumHipAngle: 90,
    maximumDepth: 0.05,
    baselineTorsoInclination: 5,
    maximumTorsoInclination: 15,
    movementControlObserved: false,
    interrupted: false,
    confidence: 0.9,
    ...overrides,
  }
}
