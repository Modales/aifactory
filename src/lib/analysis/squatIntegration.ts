import { SquatAnalyzer } from './squat/index.ts'
import type {
  SquatAnalysisEvent,
  SquatAnalysisSnapshot,
  SquatProcessResult,
  SquatRepResult,
} from './squat/types.ts'
import type { PoseTrackingSample } from '../pose/poseSampleTimeline.ts'

export interface SquatIntegrationState {
  active: boolean
  analysisLifecycleKey: string | null
  snapshot: SquatAnalysisSnapshot
  completedReps: readonly SquatRepResult[]
  events: readonly SquatAnalysisEvent[]
  eventBatchId: number
}

export interface SquatIntegrationProcessResult {
  accepted: boolean
  state: SquatIntegrationState
}

interface SquatProcessor {
  process(input: {
    pose: PoseTrackingSample['frame']['poses'][number] | null
    timestampMs: number
    mediaTimeMs: number
    timelineRevision: number
    lifecycleKey: string
    videoSize: { width: number; height: number }
  }): SquatProcessResult
  reset(): SquatAnalysisSnapshot
}

type SquatProcessorFactory = () => SquatProcessor
type Listener = () => void

const EMPTY_SNAPSHOT: SquatAnalysisSnapshot = {
  readiness: 'not-ready',
  phase: 'not_ready',
  selectedSide: null,
  repCount: 0,
  measurements: null,
  trackingConfidence: 0,
}

/** Pure lifecycle, deduplication, and event boundary around SquatAnalyzer. */
export class SquatAnalysisController {
  private readonly analyzer: SquatProcessor
  private readonly listeners = new Set<Listener>()
  private mediaLifecycleKey: string | null = null
  private exerciseId: string | null = null
  private timelineRevision: number | null = null
  private activation = 0
  private lastSample: Pick<PoseTrackingSample, 'lifecycleKey' | 'timelineRevision' | 'sequence'> | null = null
  private batchId = 0
  private state: SquatIntegrationState = initialState()

  constructor(factory: SquatProcessorFactory = () => new SquatAnalyzer()) {
    this.analyzer = factory()
  }

  readonly subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  readonly getState = (): SquatIntegrationState => this.state

  configure(exerciseId: string | null, mediaLifecycleKey: string): SquatIntegrationState {
    if (this.exerciseId === exerciseId && this.mediaLifecycleKey === mediaLifecycleKey) return this.state
    this.exerciseId = exerciseId
    this.mediaLifecycleKey = mediaLifecycleKey
    this.activation += 1
    this.timelineRevision = null
    this.lastSample = null
    const snapshot = this.analyzer.reset()
    this.state = {
      active: exerciseId === 'squat',
      analysisLifecycleKey: exerciseId === 'squat'
        ? `${mediaLifecycleKey}:squat:${this.activation}`
        : null,
      snapshot,
      completedReps: [],
      events: [],
      eventBatchId: ++this.batchId,
    }
    this.emit()
    return this.state
  }

  process(
    sample: PoseTrackingSample,
    videoSize: { width: number; height: number },
  ): SquatIntegrationProcessResult {
    if (
      !this.state.active ||
      !this.state.analysisLifecycleKey ||
      sample.lifecycleKey !== this.mediaLifecycleKey
    ) {
      return { accepted: false, state: this.state }
    }
    if (this.timelineRevision !== null && sample.timelineRevision < this.timelineRevision) {
      return { accepted: false, state: this.state }
    }
    if (this.timelineRevision !== sample.timelineRevision) {
      this.setTimelineRevision(sample.timelineRevision)
    }
    if (
      this.lastSample &&
      sample.lifecycleKey === this.lastSample.lifecycleKey &&
      (sample.timelineRevision < this.lastSample.timelineRevision ||
        (sample.timelineRevision === this.lastSample.timelineRevision &&
          sample.sequence <= this.lastSample.sequence))
    ) {
      return { accepted: false, state: this.state }
    }
    this.lastSample = {
      lifecycleKey: sample.lifecycleKey,
      timelineRevision: sample.timelineRevision,
      sequence: sample.sequence,
    }

    const result = this.analyzer.process({
      pose: sample.frame.poses[0] ?? null,
      timestampMs: sample.timestampMs,
      mediaTimeMs: sample.mediaTimeMs,
      timelineRevision: sample.timelineRevision,
      lifecycleKey: this.state.analysisLifecycleKey,
      videoSize,
    })
    const timelineReset = result.snapshot.repCount < this.state.completedReps.length
    const completedReps = timelineReset ? [] : [...this.state.completedReps]
    for (const event of result.events) {
      if (event.type === 'rep-completed') completedReps.push(event.rep)
    }
    this.state = {
      ...this.state,
      snapshot: result.snapshot,
      completedReps,
      events: result.events,
      eventBatchId: ++this.batchId,
    }
    this.emit()
    return { accepted: true, state: this.state }
  }

  dispose(): void {
    this.analyzer.reset()
    this.mediaLifecycleKey = null
    this.exerciseId = null
    this.timelineRevision = null
    this.lastSample = null
    this.state = initialState()
  }

  setTimelineRevision(revision: number): SquatIntegrationState {
    if (!Number.isFinite(revision) || revision < 0 || this.timelineRevision === revision) return this.state
    if (this.timelineRevision !== null && revision < this.timelineRevision) return this.state
    this.timelineRevision = revision
    this.lastSample = null
    const snapshot = this.analyzer.reset()
    this.state = {
      ...this.state,
      snapshot,
      completedReps: [],
      events: [],
      eventBatchId: ++this.batchId,
    }
    this.emit()
    return this.state
  }

  private emit(): void {
    this.listeners.forEach((listener) => listener())
  }
}

function initialState(): SquatIntegrationState {
  return {
    active: false,
    analysisLifecycleKey: null,
    snapshot: EMPTY_SNAPSHOT,
    completedReps: [],
    events: [],
    eventBatchId: 0,
  }
}
