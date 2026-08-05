import { describe, expect, it } from 'vitest'
import { SquatAnalysisController } from '../../src/lib/analysis/squatIntegration.ts'
import type { SquatAnalysisEvent, SquatAnalysisSnapshot, SquatProcessResult } from '../../src/lib/analysis/squat/types.ts'
import type { PoseTrackingSample } from '../../src/lib/pose/poseSampleTimeline.ts'

const EMPTY_SNAPSHOT: SquatAnalysisSnapshot = {
  readiness: 'not-ready',
  phase: 'not_ready',
  selectedSide: null,
  repCount: 0,
  measurements: null,
  trackingConfidence: 0,
}

class FakeAnalyzer {
  processCalls = 0
  resetCalls = 0
  nextResult: SquatProcessResult = { snapshot: EMPTY_SNAPSHOT, events: [], diagnostics: [] }

  process(): SquatProcessResult {
    this.processCalls += 1
    return this.nextResult
  }

  reset(): SquatAnalysisSnapshot {
    this.resetCalls += 1
    return EMPTY_SNAPSHOT
  }
}

function sample(
  lifecycleKey: string,
  sequence: number,
  overrides: Partial<PoseTrackingSample> = {},
): PoseTrackingSample {
  return {
    sequence,
    lifecycleKey,
    timelineRevision: 0,
    frame: { timestampMs: sequence * 100, poses: [] },
    mediaTimeMs: sequence * 100,
    timestampMs: sequence * 100,
    ...overrides,
  }
}

const videoSize = { width: 640, height: 480 }

describe('SquatAnalysisController', () => {
  it('activates only for explicit squat selection', () => {
    const analyzer = new FakeAnalyzer()
    const controller = new SquatAnalysisController(() => analyzer)
    expect(controller.configure('bench', 'camera:1').active).toBe(false)
    expect(controller.process(sample('camera:1', 1), videoSize).accepted).toBe(false)
    expect(analyzer.processCalls).toBe(0)
    expect(controller.configure('squat', 'camera:1').active).toBe(true)
    expect(controller.process(sample('camera:1', 2), videoSize).accepted).toBe(true)
  })

  it('keeps one analyzer instance across ordinary equivalent updates', () => {
    const analyzer = new FakeAnalyzer()
    let factoryCalls = 0
    const controller = new SquatAnalysisController(() => {
      factoryCalls += 1
      return analyzer
    })
    const first = controller.configure('squat', 'camera:1')
    const second = controller.configure('squat', 'camera:1')
    expect(factoryCalls).toBe(1)
    expect(second).toBe(first)
    expect(analyzer.resetCalls).toBe(1)
  })

  it('switching away and back starts a new analysis lifecycle', () => {
    const controller = new SquatAnalysisController(() => new FakeAnalyzer())
    const firstKey = controller.configure('squat', 'camera:1').analysisLifecycleKey
    expect(controller.configure('curl', 'camera:1').active).toBe(false)
    const returnedKey = controller.configure('squat', 'camera:1').analysisLifecycleKey
    expect(returnedKey).not.toBe(firstKey)
    expect(controller.getState().snapshot.repCount).toBe(0)
  })

  it('processes each sample once and rejects duplicate or older callbacks', () => {
    const analyzer = new FakeAnalyzer()
    const controller = new SquatAnalysisController(() => analyzer)
    controller.configure('squat', 'upload:1')
    expect(controller.process(sample('upload:1', 2), videoSize).accepted).toBe(true)
    expect(controller.process(sample('upload:1', 2), videoSize).accepted).toBe(false)
    expect(controller.process(sample('upload:1', 1), videoSize).accepted).toBe(false)
    expect(analyzer.processCalls).toBe(1)
  })

  it('ignores stale samples after camera/upload/file lifecycle changes', () => {
    const analyzer = new FakeAnalyzer()
    const controller = new SquatAnalysisController(() => analyzer)
    controller.configure('squat', 'camera:1')
    controller.process(sample('camera:1', 1), videoSize)
    controller.configure('squat', 'upload:2')
    expect(controller.process(sample('camera:1', 2), videoSize).accepted).toBe(false)
    expect(controller.process(sample('upload:2', 1), videoSize).accepted).toBe(true)
    controller.configure('squat', 'upload:3')
    expect(controller.process(sample('upload:2', 2), videoSize).accepted).toBe(false)
    expect(analyzer.processCalls).toBe(2)
  })

  it('consumes a discrete completion event once', () => {
    const analyzer = new FakeAnalyzer()
    const completion: SquatAnalysisEvent = {
      type: 'rep-completed',
      rep: {
        repIndex: 1,
        startedAtMs: 0,
        completedAtMs: 2000,
        durationMs: 2000,
        descentMs: 1200,
        ascentMs: 800,
        side: 'left',
        depth: 'reached',
        signals: [{ code: 'tempo', message: 'Rep tempo: 2.0 s.', confidence: 0.9 }],
        confidence: 0.9,
      },
    }
    analyzer.nextResult = {
      snapshot: { ...EMPTY_SNAPSHOT, readiness: 'ready', phase: 'standing', repCount: 1 },
      events: [completion],
      diagnostics: [],
    }
    const controller = new SquatAnalysisController(() => analyzer)
    controller.configure('squat', 'upload:1')
    const first = controller.process(sample('upload:1', 1), videoSize)
    const duplicate = controller.process(sample('upload:1', 1), videoSize)
    expect(first.state.completedReps).toHaveLength(1)
    expect(first.state.events).toEqual([completion])
    expect(duplicate.accepted).toBe(false)
    expect(analyzer.processCalls).toBe(1)
  })

  it('clears old completed results when a new timeline reports reset count', () => {
    const analyzer = new FakeAnalyzer()
    analyzer.nextResult = {
      snapshot: { ...EMPTY_SNAPSHOT, repCount: 1 },
      events: [{
        type: 'rep-completed',
        rep: { repIndex: 1, startedAtMs: 0, completedAtMs: 1000, durationMs: 1000, descentMs: null, ascentMs: null, side: 'right', depth: 'reached', signals: [], confidence: 0.9 },
      }],
      diagnostics: [],
    }
    const controller = new SquatAnalysisController(() => analyzer)
    controller.configure('squat', 'upload:1')
    controller.process(sample('upload:1', 1), videoSize)
    const immediatelyReset = controller.setTimelineRevision(1)
    expect(immediatelyReset.completedReps).toHaveLength(0)
    expect(immediatelyReset.snapshot.repCount).toBe(0)
    expect(controller.process(sample('upload:1', 2, { timelineRevision: 0 }), videoSize).accepted).toBe(false)
    analyzer.nextResult = { snapshot: EMPTY_SNAPSHOT, events: [], diagnostics: [] }
    const afterSeek = controller.process(sample('upload:1', 3, { timelineRevision: 1, mediaTimeMs: 0 }), videoSize)
    expect(afterSeek.state.completedReps).toHaveLength(0)
    expect(afterSeek.state.snapshot.repCount).toBe(0)
  })

  it('preserves unknown evidence and exposes no score or effort fields', () => {
    const analyzer = new FakeAnalyzer()
    analyzer.nextResult = {
      snapshot: EMPTY_SNAPSHOT,
      events: [{
        type: 'partial-rep',
        partial: { startedAtMs: 0, completedAtMs: 1000, depth: 'unknown', signals: [], confidence: 0.5 },
      }],
      diagnostics: [],
    }
    const controller = new SquatAnalysisController(() => analyzer)
    controller.configure('squat', 'camera:1')
    const state = controller.process(sample('camera:1', 1), videoSize).state
    expect(state.events[0]?.type === 'partial-rep' && state.events[0].partial.depth).toBe('unknown')
    expect(JSON.stringify(state)).not.toContain('formScore')
    expect(JSON.stringify(state)).not.toContain('effort')
  })

  it('cleanup prevents further stale processing', () => {
    const analyzer = new FakeAnalyzer()
    const controller = new SquatAnalysisController(() => analyzer)
    controller.configure('squat', 'camera:1')
    controller.dispose()
    expect(controller.process(sample('camera:1', 1), videoSize).accepted).toBe(false)
    expect(analyzer.processCalls).toBe(0)
  })
})
