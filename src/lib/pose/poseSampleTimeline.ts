import type { PoseFrame } from './types'

export type PoseSampleSource = 'camera' | 'upload'

export interface PoseTrackingSample {
  sequence: number
  lifecycleKey: string
  timelineRevision: number
  frame: PoseFrame
  /** Source-relative camera time or authoritative uploaded-video playback time. */
  mediaTimeMs: number
  /** Monotonic processing timestamp supplied to the pose estimator. */
  timestampMs: number
}

export interface PoseSampleMetadata {
  sequence: number
  lifecycleKey: string
  timelineRevision: number
  mediaTimeMs: number
  timestampMs: number
}

/**
 * Pure source timeline used by browser pose tracking.
 * Camera time is normalized to the first processing timestamp in a lifecycle;
 * upload time always comes directly from HTMLMediaElement.currentTime.
 */
export class PoseSampleTimeline {
  private readonly lifecycleKey: string
  private revision = 0
  private sequence = 0
  private cameraOriginMs: number | null = null
  private lastMediaTimeMs: number | null = null
  private ended = false

  constructor(lifecycleKey: string) {
    this.lifecycleKey = lifecycleKey
  }

  get timelineRevision(): number {
    return this.revision
  }

  capture(
    source: PoseSampleSource,
    videoTimeSeconds: number,
    processingTimestampMs: number,
  ): PoseSampleMetadata | null {
    if (!Number.isFinite(videoTimeSeconds) || !Number.isFinite(processingTimestampMs)) return null
    const mediaTimeMs = source === 'upload'
      ? videoTimeSeconds * 1000
      : this.cameraMediaTime(processingTimestampMs)
    if (!Number.isFinite(mediaTimeMs) || mediaTimeMs < 0) return null

    if (this.lastMediaTimeMs !== null && mediaTimeMs < this.lastMediaTimeMs) {
      this.revision += 1
    }
    this.lastMediaTimeMs = mediaTimeMs
    this.ended = false
    return {
      sequence: ++this.sequence,
      lifecycleKey: this.lifecycleKey,
      timelineRevision: this.revision,
      mediaTimeMs,
      timestampMs: processingTimestampMs,
    }
  }

  markSeeked(videoTimeSeconds: number): void {
    this.revision += 1
    this.lastMediaTimeMs = Number.isFinite(videoTimeSeconds) && videoTimeSeconds >= 0
      ? videoTimeSeconds * 1000
      : null
    this.ended = false
  }

  markEnded(): void {
    this.ended = true
  }

  /** Returns true only when play starts a genuinely new replay timeline. */
  markPlay(): boolean {
    if (!this.ended) return false
    this.revision += 1
    this.lastMediaTimeMs = null
    this.ended = false
    return true
  }

  isCurrent(revision: number): boolean {
    return revision === this.revision
  }

  private cameraMediaTime(processingTimestampMs: number): number {
    this.cameraOriginMs ??= processingTimestampMs
    return processingTimestampMs - this.cameraOriginMs
  }
}
