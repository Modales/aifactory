import type { DetectedPose } from '../../pose/types.ts'

export type SquatSide = 'left' | 'right'
export type SquatPhase = 'not_ready' | 'standing' | 'descending' | 'bottom' | 'ascending'
export type SquatReadiness = 'not-ready' | 'ready' | 'insufficient-view'
export type SquatDepth = 'reached' | 'not-reached' | 'unknown'

export interface SquatFrameInput {
  pose: DetectedPose | null
  /** Monotonic processing clock used only for tracking-loss handling. */
  timestampMs: number
  /** Authoritative source timeline used for movement transitions and rep tempo. */
  mediaTimeMs: number
  timelineRevision: number
  lifecycleKey: string
  videoSize: {
    width: number
    height: number
  }
}

export interface SquatMeasurements {
  kneeAngle: number | null
  hipAngle: number | null
  torsoInclination: number | null
  shinInclination: number | null
  normalizedDepth: number | null
  kneeAngularVelocity: number | null
  trackingConfidence: number
}

export type SquatSignalCode =
  | 'depth-reached'
  | 'depth-not-reached'
  | 'torso-inclination'
  | 'tempo'
  | 'movement-control'

export interface SquatFormSignal {
  code: SquatSignalCode
  message: string
  confidence: number
  evidence?: Readonly<Record<string, number | string>>
}

export interface SquatRepResult {
  repIndex: number
  startedAtMs: number
  completedAtMs: number
  durationMs: number
  descentMs: number | null
  ascentMs: number | null
  side: SquatSide
  depth: SquatDepth
  signals: SquatFormSignal[]
  confidence: number
}

export interface SquatPartialRepResult {
  startedAtMs: number
  completedAtMs: number
  depth: Exclude<SquatDepth, 'reached'>
  signals: SquatFormSignal[]
  confidence: number
}

export type SquatAnalysisEvent =
  | { type: 'rep-completed'; rep: SquatRepResult }
  | { type: 'partial-rep'; partial: SquatPartialRepResult }

export type SquatDiagnosticCode =
  | 'duplicate-media-time'
  | 'backward-media-time'
  | 'invalid-input'

export interface SquatDiagnostic {
  code: SquatDiagnosticCode
  message: string
}

export interface SquatAnalysisSnapshot {
  readiness: SquatReadiness
  phase: SquatPhase
  selectedSide: SquatSide | null
  repCount: number
  measurements: SquatMeasurements | null
  trackingConfidence: number
}

export interface SquatProcessResult {
  snapshot: SquatAnalysisSnapshot
  events: SquatAnalysisEvent[]
  diagnostics: SquatDiagnostic[]
}

export interface SquatAnalyzerConfig {
  minimumVisibility: number
  minimumSideScore: number
  sideSwitchAdvantage: number
  sideSwitchFrames: number
  sideOcclusionHoldMs: number
  unsuitableViewSeparation: number
  smoothingReferenceIntervalMs: number
  smoothingAlphaAtReference: number
  smoothingHoldMs: number
  maximumMeasurementDeltaMs: number
  briefPoseLossMs: number
  prolongedPoseLossMs: number
  standingCalibrationMs: number
  standingKneeAngle: number
  standingHipAngle: number
  standingRecoveryMs: number
  standingReturnToleranceDeg: number
  descentAngleDropDeg: number
  descentVelocityDegPerSec: number
  ascentVelocityDegPerSec: number
  bottomVelocityDegPerSec: number
  directionPersistenceMs: number
  minimumHipDropRatio: number
  depthThreshold: number
  minimumDepthSamples: number
  minimumRepDurationMs: number
  stalledRepTimeoutMs: number
  torsoInclinationDeltaDeg: number
  movementControlVelocityDelta: number
}

/** Engineering calibration defaults; they are not universal fitness standards. */
export const DEFAULT_SQUAT_ANALYZER_CONFIG: Readonly<SquatAnalyzerConfig> = {
  minimumVisibility: 0.65,
  minimumSideScore: 0.65,
  sideSwitchAdvantage: 0.12,
  sideSwitchFrames: 5,
  sideOcclusionHoldMs: 450,
  unsuitableViewSeparation: 0.25,
  smoothingReferenceIntervalMs: 1000 / 12,
  smoothingAlphaAtReference: 0.4,
  smoothingHoldMs: 250,
  maximumMeasurementDeltaMs: 1000,
  briefPoseLossMs: 500,
  prolongedPoseLossMs: 750,
  standingCalibrationMs: 500,
  standingKneeAngle: 160,
  standingHipAngle: 155,
  standingRecoveryMs: 250,
  standingReturnToleranceDeg: 8,
  descentAngleDropDeg: 8,
  descentVelocityDegPerSec: -20,
  ascentVelocityDegPerSec: 20,
  bottomVelocityDegPerSec: 12,
  directionPersistenceMs: 160,
  minimumHipDropRatio: 0.03,
  depthThreshold: -0.05,
  minimumDepthSamples: 2,
  minimumRepDurationMs: 800,
  stalledRepTimeoutMs: 20_000,
  torsoInclinationDeltaDeg: 20,
  movementControlVelocityDelta: 180,
}
