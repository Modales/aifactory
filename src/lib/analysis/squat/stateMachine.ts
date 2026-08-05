import type { SquatAnalyzerConfig, SquatDepth, SquatPhase, SquatSide } from './types.ts'

export interface SquatKinematicFrame {
  mediaTimeMs: number
  side: SquatSide
  kneeAngle: number
  hipAngle: number
  torsoInclination: number
  normalizedDepth: number
  hipVerticalRatio: number
  kneeVelocity: number | null
  confidence: number
}

export interface RepDraft {
  startedAtMs: number
  completedAtMs: number
  durationMs: number
  descentMs: number | null
  ascentMs: number | null
  side: SquatSide
  depth: SquatDepth
  minimumKneeAngle: number
  minimumHipAngle: number
  maximumDepth: number
  baselineTorsoInclination: number
  maximumTorsoInclination: number
  movementControlObserved: boolean
  interrupted: boolean
  confidence: number
}

export interface StateMachineResult {
  completed: RepDraft | null
  partial: RepDraft | null
}

interface ActiveRep {
  startedAtMs: number
  side: SquatSide
  descentCompletedAtMs: number | null
  ascentStartedAtMs: number | null
  minimumKneeAngle: number
  minimumHipAngle: number
  maximumDepth: number
  validDepthSamples: number
  maximumTorsoInclination: number
  minimumConfidence: number
  movementControlObserved: boolean
  interrupted: boolean
}

export class SquatStateMachine {
  private readonly config: SquatAnalyzerConfig
  private currentPhase: SquatPhase = 'not_ready'
  private stableStandingSince: number | null = null
  private descentEvidenceSince: number | null = null
  private bottomEvidenceSince: number | null = null
  private ascentEvidenceSince: number | null = null
  private recoverySince: number | null = null
  private baselineKnee = 180
  private baselineHip = 180
  private baselineTorso = 0
  private baselineHipVertical = 0
  private activeRep: ActiveRep | null = null
  private lastVelocity: number | null = null
  private lastFrameAt: number | null = null

  constructor(config: SquatAnalyzerConfig) {
    this.config = config
  }

  get phase(): SquatPhase {
    return this.currentPhase
  }

  update(frame: SquatKinematicFrame): StateMachineResult {
    const result: StateMachineResult = { completed: null, partial: null }
    if (!Number.isFinite(frame.mediaTimeMs)) return result

    if (this.activeRep && frame.mediaTimeMs - this.activeRep.startedAtMs > this.config.stalledRepTimeoutMs) {
      this.resetTransient()
      return result
    }

    if (this.activeRep) this.updateActiveRep(frame)

    switch (this.currentPhase) {
      case 'not_ready':
        this.updateReadiness(frame)
        break
      case 'standing':
        this.updateStanding(frame)
        break
      case 'descending':
        this.updateDescending(frame)
        break
      case 'bottom':
        this.updateBottom(frame)
        break
      case 'ascending': {
        const draft = this.updateAscending(frame)
        if (draft) {
          if (draft.depth === 'reached' && draft.durationMs >= this.config.minimumRepDurationMs) result.completed = draft
          else result.partial = draft
        }
        break
      }
    }

    this.lastVelocity = frame.kneeVelocity
    this.lastFrameAt = frame.mediaTimeMs
    return result
  }

  noteInterruption(): void {
    if (this.activeRep) this.activeRep.interrupted = true
  }

  resetTransient(): void {
    this.currentPhase = 'not_ready'
    this.stableStandingSince = null
    this.descentEvidenceSince = null
    this.bottomEvidenceSince = null
    this.ascentEvidenceSince = null
    this.recoverySince = null
    this.activeRep = null
    this.lastVelocity = null
    this.lastFrameAt = null
  }

  private updateReadiness(frame: SquatKinematicFrame): void {
    const upright = frame.kneeAngle >= this.config.standingKneeAngle && frame.hipAngle >= this.config.standingHipAngle
    const stableVelocity = frame.kneeVelocity === null || Math.abs(frame.kneeVelocity) <= this.config.bottomVelocityDegPerSec
    if (!upright || !stableVelocity) {
      this.stableStandingSince = null
      return
    }
    this.stableStandingSince ??= frame.mediaTimeMs
    if (frame.mediaTimeMs - this.stableStandingSince >= this.config.standingCalibrationMs) {
      this.baselineKnee = frame.kneeAngle
      this.baselineHip = frame.hipAngle
      this.baselineTorso = frame.torsoInclination
      this.baselineHipVertical = frame.hipVerticalRatio
      this.currentPhase = 'standing'
      this.stableStandingSince = null
    }
  }

  private updateStanding(frame: SquatKinematicFrame): void {
    const descending =
      frame.kneeAngle <= this.baselineKnee - this.config.descentAngleDropDeg &&
      frame.kneeVelocity !== null &&
      frame.kneeVelocity <= this.config.descentVelocityDegPerSec &&
      frame.hipVerticalRatio >= this.baselineHipVertical + this.config.minimumHipDropRatio
    if (!descending) {
      this.descentEvidenceSince = null
      return
    }
    this.descentEvidenceSince ??= frame.mediaTimeMs
    if (frame.mediaTimeMs - this.descentEvidenceSince < this.config.directionPersistenceMs) return
    this.activeRep = {
      startedAtMs: this.descentEvidenceSince,
      side: frame.side,
      descentCompletedAtMs: null,
      ascentStartedAtMs: null,
      minimumKneeAngle: frame.kneeAngle,
      minimumHipAngle: frame.hipAngle,
      maximumDepth: frame.normalizedDepth,
      validDepthSamples: 1,
      maximumTorsoInclination: frame.torsoInclination,
      minimumConfidence: frame.confidence,
      movementControlObserved: false,
      interrupted: false,
    }
    this.currentPhase = 'descending'
    this.descentEvidenceSince = null
  }

  private updateDescending(frame: SquatKinematicFrame): void {
    const nearBottom =
      frame.kneeVelocity !== null && frame.kneeVelocity >= -this.config.bottomVelocityDegPerSec
    if (!nearBottom) {
      this.bottomEvidenceSince = null
      return
    }
    this.bottomEvidenceSince ??= frame.mediaTimeMs
    if (frame.mediaTimeMs - this.bottomEvidenceSince < this.config.directionPersistenceMs) return
    if (this.activeRep) this.activeRep.descentCompletedAtMs = this.bottomEvidenceSince
    this.currentPhase = 'bottom'
    this.bottomEvidenceSince = null
  }

  private updateBottom(frame: SquatKinematicFrame): void {
    const ascending = frame.kneeVelocity !== null && frame.kneeVelocity >= this.config.ascentVelocityDegPerSec
    if (!ascending) {
      this.ascentEvidenceSince = null
      return
    }
    this.ascentEvidenceSince ??= frame.mediaTimeMs
    if (frame.mediaTimeMs - this.ascentEvidenceSince < this.config.directionPersistenceMs) return
    if (this.activeRep) this.activeRep.ascentStartedAtMs = this.ascentEvidenceSince
    this.currentPhase = 'ascending'
    this.ascentEvidenceSince = null
  }

  private updateAscending(frame: SquatKinematicFrame): RepDraft | null {
    const recovered =
      frame.kneeAngle >= this.baselineKnee - this.config.standingReturnToleranceDeg &&
      frame.hipAngle >= this.baselineHip - this.config.standingReturnToleranceDeg
    if (!recovered) {
      this.recoverySince = null
      return null
    }
    this.recoverySince ??= frame.mediaTimeMs
    if (frame.mediaTimeMs - this.recoverySince < this.config.standingRecoveryMs || !this.activeRep) return null

    const active = this.activeRep
    const rawDuration = frame.mediaTimeMs - active.startedAtMs
    const depth: SquatDepth = active.interrupted || active.validDepthSamples < this.config.minimumDepthSamples
      ? 'unknown'
      : active.maximumDepth >= this.config.depthThreshold ? 'reached' : 'not-reached'
    const draft: RepDraft = {
      startedAtMs: active.startedAtMs,
      completedAtMs: frame.mediaTimeMs,
      durationMs: Number.isFinite(rawDuration) && rawDuration >= 0 ? rawDuration : 0,
      descentMs: active.descentCompletedAtMs === null ? null : active.descentCompletedAtMs - active.startedAtMs,
      ascentMs: active.ascentStartedAtMs === null ? null : frame.mediaTimeMs - active.ascentStartedAtMs,
      side: active.side,
      depth,
      minimumKneeAngle: active.minimumKneeAngle,
      minimumHipAngle: active.minimumHipAngle,
      maximumDepth: active.maximumDepth,
      baselineTorsoInclination: this.baselineTorso,
      maximumTorsoInclination: active.maximumTorsoInclination,
      movementControlObserved: active.movementControlObserved,
      interrupted: active.interrupted,
      confidence: active.minimumConfidence,
    }
    this.activeRep = null
    this.currentPhase = 'standing'
    this.recoverySince = null
    return draft
  }

  private updateActiveRep(frame: SquatKinematicFrame): void {
    const active = this.activeRep
    if (!active) return
    active.minimumKneeAngle = Math.min(active.minimumKneeAngle, frame.kneeAngle)
    active.minimumHipAngle = Math.min(active.minimumHipAngle, frame.hipAngle)
    active.maximumDepth = Math.max(active.maximumDepth, frame.normalizedDepth)
    active.validDepthSamples += 1
    active.maximumTorsoInclination = Math.max(active.maximumTorsoInclination, frame.torsoInclination)
    active.minimumConfidence = Math.min(active.minimumConfidence, frame.confidence)
    if (
      this.currentPhase === 'descending' &&
      frame.kneeVelocity !== null &&
      this.lastVelocity !== null &&
      this.lastFrameAt !== null &&
      frame.mediaTimeMs - this.lastFrameAt > 0 &&
      frame.mediaTimeMs - this.lastFrameAt <= this.config.maximumMeasurementDeltaMs &&
      Math.abs(frame.kneeVelocity - this.lastVelocity) >= this.config.movementControlVelocityDelta
    ) {
      active.movementControlObserved = true
    }
  }
}
