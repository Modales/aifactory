import { calculateSquatGeometry } from './geometry.ts'
import { SquatSideSelector } from './sideSelection.ts'
import { buildRepSignals } from './signals.ts'
import { BoundedScalarSmoother } from './smoothing.ts'
import { SquatStateMachine } from './stateMachine.ts'
import {
  DEFAULT_SQUAT_ANALYZER_CONFIG,
  type SquatAnalysisEvent,
  type SquatAnalysisSnapshot,
  type SquatAnalyzerConfig,
  type SquatDiagnostic,
  type SquatFrameInput,
  type SquatMeasurements,
  type SquatProcessResult,
  type SquatRepResult,
} from './types.ts'

type MeasurementName = 'knee' | 'hip' | 'torso' | 'shin' | 'depth' | 'hipVertical'

export class SquatAnalyzer {
  readonly config: Readonly<SquatAnalyzerConfig>
  private selector: SquatSideSelector
  private stateMachine: SquatStateMachine
  private smoothers: Record<MeasurementName, BoundedScalarSmoother>
  private snapshot: SquatAnalysisSnapshot = initialSnapshot()
  private lifecycleKey: string | null = null
  private timelineRevision: number | null = null
  private lastMediaTimeMs: number | null = null
  private lastValidProcessingAt: number | null = null
  private poseLossStartedAt: number | null = null
  private previousKnee: number | null = null
  private previousKneeAt: number | null = null
  private completedReps: SquatRepResult[] = []

  constructor(overrides: Partial<SquatAnalyzerConfig> = {}) {
    this.config = Object.freeze({ ...DEFAULT_SQUAT_ANALYZER_CONFIG, ...overrides })
    this.selector = new SquatSideSelector(this.config)
    this.stateMachine = new SquatStateMachine(this.config)
    this.smoothers = this.createSmoothers()
  }

  process(input: SquatFrameInput): SquatProcessResult {
    const events: SquatAnalysisEvent[] = []
    const diagnostics: SquatDiagnostic[] = []
    if (this.lifecycleKey !== input.lifecycleKey || this.timelineRevision !== input.timelineRevision) {
      this.fullReset(input.lifecycleKey, input.timelineRevision)
    }

    if (!this.validInput(input)) {
      diagnostics.push({ code: 'invalid-input', message: 'The squat sample contained invalid time or video dimensions.' })
      return this.result(events, diagnostics)
    }
    if (this.lastMediaTimeMs !== null && input.mediaTimeMs === this.lastMediaTimeMs) {
      diagnostics.push({ code: 'duplicate-media-time', message: 'A duplicate media-time sample was ignored.' })
      return this.result(events, diagnostics)
    }
    if (this.lastMediaTimeMs !== null && input.mediaTimeMs < this.lastMediaTimeMs) {
      this.resetTransient()
      this.lastMediaTimeMs = input.mediaTimeMs
      diagnostics.push({ code: 'backward-media-time', message: 'Media time moved backward without a timeline revision; in-progress analysis was reset.' })
      return this.result(events, diagnostics)
    }
    this.lastMediaTimeMs = input.mediaTimeMs

    if (!input.pose) {
      const loss = this.handlePoseLoss(input.timestampMs)
      if (!loss.reset) {
        this.snapshot = {
          ...this.snapshot,
          readiness: 'not-ready',
          selectedSide:
            loss.elapsedMs <= Math.min(this.config.briefPoseLossMs, this.config.sideOcclusionHoldMs)
              ? this.snapshot.selectedSide
              : null,
          measurements: this.heldMeasurements(input.mediaTimeMs),
          trackingConfidence: 0,
        }
      }
      return this.result(events, diagnostics)
    }

    if (
      this.lastValidProcessingAt !== null &&
      input.timestampMs - this.lastValidProcessingAt >= this.config.prolongedPoseLossMs
    ) {
      this.resetTransient()
    } else if (this.poseLossStartedAt !== null) {
      this.stateMachine.noteInterruption()
    }
    this.poseLossStartedAt = null

    const selection = this.selector.update(input.pose, input.videoSize, input.timestampMs)
    if (selection.switched) this.resetMotionForSideSwitch()
    if (!selection.selectedSide) {
      this.handlePoseLoss(input.timestampMs)
      this.snapshot = { ...this.snapshot, readiness: 'insufficient-view', selectedSide: null, measurements: null, trackingConfidence: 0 }
      return this.result(events, diagnostics)
    }
    if (selection.quality < this.config.minimumSideScore) {
      const loss = this.handlePoseLoss(input.timestampMs)
      this.snapshot = { ...this.snapshot, readiness: 'insufficient-view', selectedSide: loss.reset ? null : selection.selectedSide, measurements: null, trackingConfidence: selection.quality }
      return this.result(events, diagnostics)
    }
    if (!selection.viewSuitable) {
      const loss = this.handlePoseLoss(input.timestampMs)
      this.snapshot = { ...this.snapshot, readiness: 'insufficient-view', selectedSide: loss.reset ? null : selection.selectedSide, measurements: null, trackingConfidence: selection.quality }
      return this.result(events, diagnostics)
    }

    const geometry = calculateSquatGeometry(input.pose, selection.selectedSide, input.videoSize, this.config.minimumVisibility)
    if (!geometry) {
      this.handlePoseLoss(input.timestampMs)
      this.snapshot = { ...this.snapshot, readiness: 'not-ready', selectedSide: selection.selectedSide, measurements: null, trackingConfidence: selection.quality }
      return this.result(events, diagnostics)
    }
    this.lastValidProcessingAt = input.timestampMs

    const knee = this.smoothers.knee.update(geometry.kneeAngle, input.mediaTimeMs)
    const hip = this.smoothers.hip.update(geometry.hipAngle, input.mediaTimeMs)
    const torso = this.smoothers.torso.update(geometry.torsoInclination, input.mediaTimeMs)
    const shin = this.smoothers.shin.update(geometry.shinInclination, input.mediaTimeMs)
    const depth = this.smoothers.depth.update(geometry.normalizedDepth, input.mediaTimeMs)
    const hipVertical = this.smoothers.hipVertical.update(geometry.hipVerticalRatio, input.mediaTimeMs)
    const velocity = this.angularVelocity(knee, input.mediaTimeMs)
    const measurements: SquatMeasurements = {
      kneeAngle: knee,
      hipAngle: hip,
      torsoInclination: torso,
      shinInclination: shin,
      normalizedDepth: depth,
      kneeAngularVelocity: velocity,
      trackingConfidence: geometry.confidence,
    }

    if (knee !== null && hip !== null && torso !== null && depth !== null && hipVertical !== null) {
      const transition = this.stateMachine.update({
        mediaTimeMs: input.mediaTimeMs,
        side: selection.selectedSide,
        kneeAngle: knee,
        hipAngle: hip,
        torsoInclination: torso,
        normalizedDepth: depth,
        hipVerticalRatio: hipVertical,
        kneeVelocity: velocity,
        confidence: geometry.confidence,
      })
      if (transition.completed) {
        const draft = transition.completed
        const rep: SquatRepResult = {
          repIndex: this.completedReps.length + 1,
          startedAtMs: draft.startedAtMs,
          completedAtMs: draft.completedAtMs,
          durationMs: draft.durationMs,
          descentMs: draft.descentMs,
          ascentMs: draft.ascentMs,
          side: draft.side,
          depth: draft.depth,
          signals: buildRepSignals(draft, this.config),
          confidence: draft.confidence,
        }
        this.completedReps.push(rep)
        events.push({ type: 'rep-completed', rep })
      }
      if (transition.partial) {
        const draft = transition.partial
        events.push({
          type: 'partial-rep',
          partial: {
            startedAtMs: draft.startedAtMs,
            completedAtMs: draft.completedAtMs,
            depth: draft.depth === 'reached' ? 'unknown' : draft.depth,
            signals: buildRepSignals(draft, this.config),
            confidence: draft.confidence,
          },
        })
      }
    }

    this.snapshot = {
      readiness: this.stateMachine.phase === 'not_ready' ? 'not-ready' : 'ready',
      phase: this.stateMachine.phase,
      selectedSide: selection.selectedSide,
      repCount: this.completedReps.length,
      measurements,
      trackingConfidence: geometry.confidence,
    }
    return this.result(events, diagnostics)
  }

  reset(): SquatAnalysisSnapshot {
    this.fullReset(null, null)
    return this.getSnapshot()
  }

  getSnapshot(): SquatAnalysisSnapshot {
    return { ...this.snapshot, measurements: this.snapshot.measurements ? { ...this.snapshot.measurements } : null }
  }

  private handlePoseLoss(timestampMs: number): { reset: boolean; elapsedMs: number } {
    const start = this.poseLossStartedAt ?? this.lastValidProcessingAt ?? timestampMs
    this.poseLossStartedAt ??= start
    const elapsedMs = timestampMs - start
    if (elapsedMs >= this.config.prolongedPoseLossMs) {
      this.resetTransient()
      return { reset: true, elapsedMs }
    }
    this.stateMachine.noteInterruption()
    return { reset: false, elapsedMs }
  }

  private heldMeasurements(mediaTimeMs: number): SquatMeasurements | null {
    if (!this.snapshot.measurements) return null
    const kneeAngle = this.smoothers.knee.update(null, mediaTimeMs)
    const hipAngle = this.smoothers.hip.update(null, mediaTimeMs)
    const torsoInclination = this.smoothers.torso.update(null, mediaTimeMs)
    const shinInclination = this.smoothers.shin.update(null, mediaTimeMs)
    const normalizedDepth = this.smoothers.depth.update(null, mediaTimeMs)
    if (
      kneeAngle === null &&
      hipAngle === null &&
      torsoInclination === null &&
      shinInclination === null &&
      normalizedDepth === null
    ) return null
    return {
      kneeAngle,
      hipAngle,
      torsoInclination,
      shinInclination,
      normalizedDepth,
      kneeAngularVelocity: null,
      trackingConfidence: 0,
    }
  }

  private angularVelocity(knee: number | null, mediaTimeMs: number): number | null {
    if (knee === null) return null
    let velocity: number | null = null
    if (this.previousKnee !== null && this.previousKneeAt !== null) {
      const deltaMs = mediaTimeMs - this.previousKneeAt
      if (deltaMs > 0 && deltaMs <= this.config.maximumMeasurementDeltaMs) {
        velocity = ((knee - this.previousKnee) / deltaMs) * 1000
      }
    }
    this.previousKnee = knee
    this.previousKneeAt = mediaTimeMs
    return velocity
  }

  private resetMotionForSideSwitch(): void {
    this.resetSmoothers()
    this.stateMachine.resetTransient()
    this.previousKnee = null
    this.previousKneeAt = null
  }

  private resetTransient(): void {
    this.selector.reset()
    this.resetMotionForSideSwitch()
    this.poseLossStartedAt = null
    this.lastValidProcessingAt = null
    this.snapshot = { ...initialSnapshot(), repCount: this.completedReps.length }
  }

  private fullReset(lifecycleKey: string | null, timelineRevision: number | null): void {
    this.completedReps = []
    this.lifecycleKey = lifecycleKey
    this.timelineRevision = timelineRevision
    this.lastMediaTimeMs = null
    this.resetTransient()
    this.snapshot = initialSnapshot()
  }

  private createSmoothers(): Record<MeasurementName, BoundedScalarSmoother> {
    const config = {
      referenceIntervalMs: this.config.smoothingReferenceIntervalMs,
      alphaAtReference: this.config.smoothingAlphaAtReference,
      holdMs: this.config.smoothingHoldMs,
      maximumDeltaMs: this.config.maximumMeasurementDeltaMs,
    }
    return {
      knee: new BoundedScalarSmoother(config),
      hip: new BoundedScalarSmoother(config),
      torso: new BoundedScalarSmoother(config),
      shin: new BoundedScalarSmoother(config),
      depth: new BoundedScalarSmoother(config),
      hipVertical: new BoundedScalarSmoother(config),
    }
  }

  private resetSmoothers(): void {
    Object.values(this.smoothers).forEach((smoother) => smoother.reset())
  }

  private validInput(input: SquatFrameInput): boolean {
    return Number.isFinite(input.timestampMs) && Number.isFinite(input.mediaTimeMs) && Number.isFinite(input.timelineRevision) && Number.isFinite(input.videoSize.width) && Number.isFinite(input.videoSize.height) && input.videoSize.width > 0 && input.videoSize.height > 0
  }

  private result(events: SquatAnalysisEvent[], diagnostics: SquatDiagnostic[]): SquatProcessResult {
    return { snapshot: this.getSnapshot(), events, diagnostics }
  }
}

function initialSnapshot(): SquatAnalysisSnapshot {
  return { readiness: 'not-ready', phase: 'not_ready', selectedSide: null, repCount: 0, measurements: null, trackingConfidence: 0 }
}
