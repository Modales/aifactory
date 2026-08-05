import { describe, expect, it } from 'vitest'
import { PoseSampleTimeline } from '../../src/lib/pose/poseSampleTimeline.ts'

describe('PoseSampleTimeline', () => {
  it('uses authoritative uploaded-video playback time', () => {
    const timeline = new PoseSampleTimeline('upload:1')
    const sample = timeline.capture('upload', 2.4, 10_000)
    expect(sample?.mediaTimeMs).toBe(2400)
    expect(sample?.timestampMs).toBe(10_000)
  })

  it('uses one monotonic source-relative camera timeline', () => {
    const timeline = new PoseSampleTimeline('camera:1')
    expect(timeline.capture('camera', 50, 5000)?.mediaTimeMs).toBe(0)
    expect(timeline.capture('camera', 51, 5083)?.mediaTimeMs).toBe(83)
    expect(timeline.timelineRevision).toBe(0)
  })

  it('restarts the camera origin for a new source lifecycle', () => {
    const first = new PoseSampleTimeline('camera:1')
    const second = new PoseSampleTimeline('camera:2')
    first.capture('camera', 10, 1000)
    expect(first.capture('camera', 11, 1200)?.mediaTimeMs).toBe(200)
    expect(second.capture('camera', 11, 1200)?.mediaTimeMs).toBe(0)
  })

  it('ordinary pause and resume do not alter the upload revision', () => {
    const timeline = new PoseSampleTimeline('upload:1')
    const before = timeline.capture('upload', 1, 1000)
    expect(timeline.markPlay()).toBe(false)
    const after = timeline.capture('upload', 1.5, 2500)
    expect(after?.timelineRevision).toBe(before?.timelineRevision)
    expect(after?.mediaTimeMs).toBe(1500)
  })

  it('seek increments revision and invalidates stale inference metadata', () => {
    const timeline = new PoseSampleTimeline('upload:1')
    const stale = timeline.capture('upload', 3, 3000)!
    timeline.markSeeked(8)
    expect(timeline.timelineRevision).toBe(1)
    expect(timeline.isCurrent(stale.timelineRevision)).toBe(false)
    expect(timeline.capture('upload', 8, 3100)?.timelineRevision).toBe(1)
  })

  it('replay after end increments revision exactly once', () => {
    const timeline = new PoseSampleTimeline('upload:1')
    timeline.capture('upload', 10, 1000)
    timeline.markEnded()
    expect(timeline.markPlay()).toBe(true)
    expect(timeline.markPlay()).toBe(false)
    expect(timeline.capture('upload', 0, 1100)?.timelineRevision).toBe(1)
  })

  it('a backward jump that bypasses seek fails safe with a new revision', () => {
    const timeline = new PoseSampleTimeline('upload:1')
    timeline.capture('upload', 5, 1000)
    const restarted = timeline.capture('upload', 1, 1100)
    expect(restarted?.timelineRevision).toBe(1)
    expect(restarted?.mediaTimeMs).toBe(1000)
  })

  it('rejects non-finite timing inputs', () => {
    const timeline = new PoseSampleTimeline('upload:1')
    expect(timeline.capture('upload', Number.NaN, 1000)).toBeNull()
    expect(timeline.capture('camera', 0, Number.POSITIVE_INFINITY)).toBeNull()
  })
})
