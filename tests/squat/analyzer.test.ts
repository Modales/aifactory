import { test } from 'vitest'
import assert from 'node:assert/strict'
import { SquatAnalyzer } from '../../src/lib/analysis/squat/squatAnalyzer.ts'
import { input, poseWithSides, squatPose } from './fixtures.ts'

function analyzer() {
  return new SquatAnalyzer({
    standingCalibrationMs: 100,
    standingRecoveryMs: 100,
    directionPersistenceMs: 0,
    minimumRepDurationMs: 300,
    minimumDepthSamples: 1,
    smoothingReferenceIntervalMs: 1,
    smoothingAlphaAtReference: 0.999,
  })
}

function runPoseRep(subject: SquatAnalyzer, offset = 0) {
  const samples = [
    [0, 175], [100, 175], [200, 175],
    [300, 150], [400, 120], [500, 85], [600, 85],
    [700, 120], [800, 150], [900, 175], [1000, 175], [1100, 175],
  ] as const
  return samples.map(([time, angle]) => subject.process(input(squatPose(angle), time + offset)))
}

test('analyzer counts a synthetic side-view rep once and emits no UI-only metrics', () => {
  const subject = analyzer()
  const results = runPoseRep(subject)
  const completions = results.flatMap((result) => result.events).filter((event) => event.type === 'rep-completed')
  assert.equal(completions.length, 1)
  assert.equal(subject.getSnapshot().repCount, 1)
  const rep = completions[0]!.rep
  assert.equal('formScore' in rep, false)
  assert.equal('effort' in rep, false)
  assert.equal(rep.durationMs, rep.completedAtMs - rep.startedAtMs)
})

test('duplicate media timestamps are ignored and completion is not re-emitted', () => {
  const subject = analyzer()
  subject.process(input(squatPose(175), 0))
  const duplicate = subject.process(input(squatPose(90), 0))
  assert.equal(duplicate.diagnostics[0]?.code, 'duplicate-media-time')
  assert.deepEqual(duplicate.events, [])
})

test('backward media time fails safely without a negative rep', () => {
  const subject = analyzer()
  subject.process(input(squatPose(175), 100))
  const result = subject.process(input(squatPose(90), 50))
  assert.equal(result.diagnostics[0]?.code, 'backward-media-time')
  assert.equal(result.snapshot.phase, 'not_ready')
  assert.equal(result.snapshot.repCount, 0)
})

test('lifecycle and timeline changes fully reset completed results', () => {
  const subject = analyzer()
  runPoseRep(subject)
  assert.equal(subject.getSnapshot().repCount, 1)
  const lifecycle = subject.process(input(squatPose(175), 2000, { lifecycleKey: 'source:2' }))
  assert.equal(lifecycle.snapshot.repCount, 0)
  runPoseRep(subject, 3000)
  assert.equal(subject.getSnapshot().repCount, 1)
  const timeline = subject.process(input(squatPose(175), 5000, { lifecycleKey: 'source:2', timelineRevision: 1 }))
  assert.equal(timeline.snapshot.repCount, 0)
})

test('brief loss preserves phase while prolonged loss discards only in-progress work', () => {
  const subject = analyzer()
  subject.process(input(squatPose(175), 0))
  subject.process(input(squatPose(175), 100))
  subject.process(input(squatPose(175), 200))
  subject.process(input(squatPose(150), 300))
  const brief = subject.process(input(null, 700, { timestampMs: 700 }))
  assert.notEqual(brief.snapshot.phase, 'not_ready')
  const prolonged = subject.process(input(null, 1100, { timestampMs: 1100 }))
  assert.equal(prolonged.snapshot.phase, 'not_ready')
  assert.equal(prolonged.snapshot.repCount, 0)
})

test('pose-loss snapshots hold measurements briefly and then expire them', () => {
  const subject = analyzer()
  subject.process(input(squatPose(175), 0))
  const tracked = subject.process(input(squatPose(175), 100))
  assert.ok(tracked.snapshot.measurements)
  const held = subject.process(input(null, 300, { timestampMs: 300 }))
  assert.ok(held.snapshot.measurements)
  const expired = subject.process(input(null, 400, { timestampMs: 400 }))
  assert.equal(expired.snapshot.measurements, null)
  assert.equal(expired.snapshot.phase, tracked.snapshot.phase)
})

test('completed reps survive prolonged pose loss within one lifecycle', () => {
  const subject = analyzer()
  runPoseRep(subject)
  assert.equal(subject.getSnapshot().repCount, 1)
  subject.process(input(null, 1200, { timestampMs: 1200 }))
  const lost = subject.process(input(null, 2000, { timestampMs: 2000 }))
  assert.equal(lost.snapshot.repCount, 1)
  assert.equal(lost.snapshot.phase, 'not_ready')
})

test('explicit reset is idempotent and clears all results', () => {
  const subject = analyzer()
  runPoseRep(subject)
  assert.equal(subject.reset().repCount, 0)
  assert.deepEqual(subject.reset(), subject.getSnapshot())
})

test('unsuitable and missing views remain withheld', () => {
  const subject = analyzer()
  const frontal = subject.process(input(poseWithSides({ separation: 0.25 }), 0))
  assert.equal(frontal.snapshot.readiness, 'insufficient-view')
  const missing = subject.process(input(poseWithSides({ leftVisibility: 0.2, rightVisibility: 0.2 }), 100))
  assert.equal(missing.snapshot.readiness, 'insufficient-view')
})

test('a persistent anatomical-side switch resets in-progress movement', () => {
  const subject = new SquatAnalyzer({ standingCalibrationMs: 100, directionPersistenceMs: 0, sideSwitchFrames: 2, smoothingReferenceIntervalMs: 1, smoothingAlphaAtReference: 0.999 })
  subject.process(input(squatPose(175), 0))
  subject.process(input(squatPose(175), 100))
  subject.process(input(squatPose(150), 200))
  const challenger = squatPose(120)
  for (const index of [11, 23, 25, 27]) challenger.landmarks[index]!.visibility = 0.7
  for (const index of [12, 24, 26, 28]) challenger.landmarks[index]!.visibility = 0.95
  subject.process(input(challenger, 300))
  const switched = subject.process(input(challenger, 400))
  assert.equal(switched.snapshot.phase, 'not_ready')
  assert.equal(switched.snapshot.selectedSide, 'right')
  assert.equal(switched.snapshot.repCount, 0)
})

test('invalid non-finite input produces a nonfatal diagnostic and no event', () => {
  const subject = analyzer()
  const result = subject.process(input(squatPose(175), Number.NaN))
  assert.equal(result.diagnostics[0]?.code, 'invalid-input')
  assert.deepEqual(result.events, [])
  assert.equal(result.snapshot.phase, 'not_ready')
})
