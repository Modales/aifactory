export interface ScalarSmootherConfig {
  referenceIntervalMs: number
  alphaAtReference: number
  holdMs: number
  maximumDeltaMs: number
}

export class BoundedScalarSmoother {
  private readonly config: ScalarSmootherConfig
  private readonly values: number[] = []
  private output: number | null = null
  private lastValidAt: number | null = null
  private lastUpdateAt: number | null = null

  constructor(config: ScalarSmootherConfig) {
    this.config = config
  }

  update(value: number | null, mediaTimeMs: number): number | null {
    if (!Number.isFinite(mediaTimeMs)) return null
    if (value === null || !Number.isFinite(value)) return this.heldValue(mediaTimeMs)
    if (this.lastUpdateAt !== null) {
      const delta = mediaTimeMs - this.lastUpdateAt
      if (delta <= 0) return this.heldValue(mediaTimeMs)
      if (delta > this.config.maximumDeltaMs) this.reset()
    }

    this.values.push(value)
    if (this.values.length > 3) this.values.shift()
    const median = this.median()
    if (this.output === null || this.lastUpdateAt === null) {
      this.output = median
    } else {
      const delta = mediaTimeMs - this.lastUpdateAt
      const alpha = this.timeAwareAlpha(delta)
      this.output += alpha * (median - this.output)
    }
    this.lastUpdateAt = mediaTimeMs
    this.lastValidAt = mediaTimeMs
    return this.output
  }

  reset(): void {
    this.values.length = 0
    this.output = null
    this.lastValidAt = null
    this.lastUpdateAt = null
  }

  private heldValue(mediaTimeMs: number): number | null {
    if (this.output === null || this.lastValidAt === null || mediaTimeMs < this.lastValidAt) return null
    return mediaTimeMs - this.lastValidAt <= this.config.holdMs ? this.output : null
  }

  private median(): number {
    const sorted = [...this.values].sort((a, b) => a - b)
    const middle = Math.floor(sorted.length / 2)
    return sorted.length % 2 === 0
      ? ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
      : (sorted[middle] ?? 0)
  }

  private timeAwareAlpha(deltaMs: number): number {
    const alpha = Math.max(Number.EPSILON, Math.min(1 - Number.EPSILON, this.config.alphaAtReference))
    const tau = -this.config.referenceIntervalMs / Math.log(1 - alpha)
    return 1 - Math.exp(-deltaMs / tau)
  }
}
