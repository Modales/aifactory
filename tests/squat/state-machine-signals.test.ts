import { test } from 'vitest'
import assert from 'node:assert/strict'
import { buildRepSignals } from '../../src/lib/analysis/squat/signals.ts'
import { SquatStateMachine } from '../../src/lib/analysis/squat/stateMachine.ts'
import { config, frame, repDraft } from './fixtures.ts'

function calibratedMachine() {
  const machine = new SquatStateMachine(config({ standingCalibrationMs: 100, standingRecoveryMs: 100, directionPersistenceMs: 0, minimumRepDurationMs: 300, minimumDepthSamples: 1 }))
  machine.update(frame(0))
  machine.update(frame(100))
  return machine
}

function completeCycle(machine: SquatStateMachine, depth = 0.05, completion = 600) {
  machine.update(frame(200, { kneeAngle: 150, hipAngle: 165, hipVerticalRatio: 2.2, kneeVelocity: -100 }))
  machine.update(frame(300, { kneeAngle: 90, hipAngle: 100, normalizedDepth: depth, hipVerticalRatio: 2.8, kneeVelocity: 0 }))
  machine.update(frame(400, { kneeAngle: 110, hipAngle: 120, normalizedDepth: depth, hipVerticalRatio: 2.7, kneeVelocity: 100 }))
  machine.update(frame(completion - 100, { kneeAngle: 173, hipAngle: 173, hipVerticalRatio: 2.05, kneeVelocity: 100 }))
  return machine.update(frame(completion, { kneeAngle: 175, hipAngle: 175, hipVerticalRatio: 2, kneeVelocity: 0 }))
}

test('stable standing calibrates before movement can start', () => {
  const machine = new SquatStateMachine(config({ standingCalibrationMs: 100 }))
  machine.update(frame(0))
  assert.equal(machine.phase, 'not_ready')
  machine.update(frame(100))
  assert.equal(machine.phase, 'standing')
})

test('a complete depth-qualified rep emits exactly once with media-time tempo', () => {
  const machine = calibratedMachine()
  const result = completeCycle(machine)
  assert.equal(result.completed?.durationMs, 400)
  assert.equal(result.completed?.depth, 'reached')
  assert.equal(machine.update(frame(700)).completed, null)
})

test('a shallow cycle is partial and not completed', () => {
  const result = completeCycle(calibratedMachine(), -0.2)
  assert.equal(result.completed, null)
  assert.equal(result.partial?.depth, 'not-reached')
})

test('threshold noise and ascent-only movement do not count', () => {
  const machine = calibratedMachine()
  for (let time = 200; time <= 700; time += 100) machine.update(frame(time, { kneeAngle: 170 + (time % 200 ? 1 : -1), kneeVelocity: time % 200 ? 5 : -5 }))
  assert.equal(machine.phase, 'standing')
  assert.equal(machine.update(frame(800, { kneeAngle: 175, kneeVelocity: 100 })).completed, null)
})

test('slow reps and long bottom pauses remain valid', () => {
  const machine = calibratedMachine()
  machine.update(frame(500, { kneeAngle: 145, hipAngle: 160, hipVerticalRatio: 2.2, kneeVelocity: -30 }))
  machine.update(frame(1500, { kneeAngle: 85, hipAngle: 95, normalizedDepth: 0.1, hipVerticalRatio: 2.8, kneeVelocity: 0 }))
  machine.update(frame(5000, { kneeAngle: 85, hipAngle: 95, normalizedDepth: 0.1, hipVerticalRatio: 2.8, kneeVelocity: 0 }))
  machine.update(frame(7000, { kneeAngle: 120, hipAngle: 130, hipVerticalRatio: 2.5, kneeVelocity: 30 }))
  machine.update(frame(7900, { kneeAngle: 174, hipAngle: 174, hipVerticalRatio: 2, kneeVelocity: 30 }))
  const result = machine.update(frame(8000))
  assert.equal(result.completed?.durationMs, 7500)
})

test('minimum-duration guard rejects an otherwise complete cycle', () => {
  const machine = new SquatStateMachine(config({ standingCalibrationMs: 0, standingRecoveryMs: 100, directionPersistenceMs: 0, minimumRepDurationMs: 800, minimumDepthSamples: 1 }))
  machine.update(frame(0))
  const result = completeCycle(machine, 0.1, 600)
  assert.equal(result.completed, null)
  assert.ok(result.partial)
})

test('an interrupted lower phase produces unknown depth and withholds torso/control claims', () => {
  const machine = calibratedMachine()
  machine.update(frame(200, { kneeAngle: 150, hipAngle: 165, hipVerticalRatio: 2.2, kneeVelocity: -100 }))
  machine.noteInterruption()
  machine.update(frame(300, { kneeAngle: 90, hipAngle: 100, normalizedDepth: 0.1, hipVerticalRatio: 2.8, kneeVelocity: 0 }))
  machine.update(frame(400, { kneeAngle: 110, hipAngle: 120, hipVerticalRatio: 2.7, kneeVelocity: 100 }))
  machine.update(frame(500, { kneeAngle: 175, hipAngle: 175, hipVerticalRatio: 2, kneeVelocity: 100 }))
  const result = machine.update(frame(600))
  assert.equal(result.partial?.depth, 'unknown')
})

test('a descent without a valid return never emits completion', () => {
  const machine = calibratedMachine()
  machine.update(frame(200, { kneeAngle: 145, hipAngle: 160, hipVerticalRatio: 2.2, kneeVelocity: -50 }))
  machine.update(frame(300, { kneeAngle: 90, hipAngle: 100, normalizedDepth: 0.1, hipVerticalRatio: 2.8, kneeVelocity: 0 }))
  assert.equal(machine.phase, 'bottom')
  assert.equal(machine.update(frame(400, { kneeAngle: 90, hipAngle: 100, normalizedDepth: 0.1, hipVerticalRatio: 2.8, kneeVelocity: 0 })).completed, null)
})

test('a stalled in-progress attempt returns to not ready without an event', () => {
  const machine = new SquatStateMachine(config({ standingCalibrationMs: 100, directionPersistenceMs: 0, stalledRepTimeoutMs: 500 }))
  machine.update(frame(0)); machine.update(frame(100))
  machine.update(frame(200, { kneeAngle: 145, hipAngle: 160, hipVerticalRatio: 2.2, kneeVelocity: -50 }))
  const result = machine.update(frame(701, { kneeAngle: 90, hipAngle: 100, normalizedDepth: 0.1, hipVerticalRatio: 2.8, kneeVelocity: 0 }))
  assert.equal(machine.phase, 'not_ready')
  assert.equal(result.completed, null)
  assert.equal(result.partial, null)
})

test('signals describe reached, not reached, torso, tempo, and movement control evidence', () => {
  const settings = config({ torsoInclinationDeltaDeg: 20 })
  const reached = buildRepSignals(repDraft({ maximumTorsoInclination: 30, movementControlObserved: true }), settings)
  assert.deepEqual(reached.map((signal) => signal.code), ['depth-reached', 'torso-inclination', 'tempo', 'movement-control'])
  const shallow = buildRepSignals(repDraft({ depth: 'not-reached' }), settings)
  assert.equal(shallow[0]?.message, 'Squat depth was not clearly observed on this rep.')
})

test('weak/interrupted evidence withholds depth, torso, movement-control, and invalid tempo', () => {
  const signals = buildRepSignals(repDraft({ depth: 'unknown', interrupted: true, durationMs: Number.NaN, maximumTorsoInclination: 50, movementControlObserved: true }), config())
  assert.deepEqual(signals, [])
})
