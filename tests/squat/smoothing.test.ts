import { test } from 'vitest'
import assert from 'node:assert/strict'
import { BoundedScalarSmoother } from '../../src/lib/analysis/squat/smoothing.ts'

function smoother(overrides = {}) {
  return new BoundedScalarSmoother({ referenceIntervalMs: 100, alphaAtReference: 0.4, holdMs: 250, maximumDeltaMs: 1000, ...overrides })
}

test('three-sample median rejects a spike', () => {
  const value = smoother({ alphaAtReference: 0.999 })
  value.update(10, 0)
  value.update(100, 100)
  const output = value.update(11, 200)
  assert.ok(output !== null && output < 12)
})

test('EMA follows gradual movement without jumping directly', () => {
  const value = smoother()
  assert.equal(value.update(0, 0), 0)
  value.update(10, 100)
  const output = value.update(20, 200)
  assert.ok(output !== null && output > 0 && output < 20)
})

test('invalid observations are not inserted and short gaps hold output', () => {
  const value = smoother()
  assert.equal(value.update(5, 0), 5)
  assert.equal(value.update(Number.NaN, 100), 5)
  assert.equal(value.update(null, 250), 5)
})

test('hold expires after the configured duration', () => {
  const value = smoother()
  value.update(5, 0)
  assert.equal(value.update(null, 251), null)
})

test('reset clears the bounded history and held value', () => {
  const value = smoother()
  value.update(5, 0)
  value.update(10, 100)
  value.reset()
  assert.equal(value.update(null, 150), null)
  assert.equal(value.update(20, 200), 20)
})

test('time-aware EMA responds more over a longer valid interval', () => {
  const short = smoother()
  const long = smoother()
  short.update(0, 0); short.update(10, 100); const shortOutput = short.update(10, 200)
  long.update(0, 0); long.update(10, 100); const longOutput = long.update(10, 500)
  assert.ok(shortOutput !== null && longOutput !== null && longOutput > shortOutput)
})

test('duplicate and backward deltas are ignored while a large gap starts fresh', () => {
  const value = smoother()
  value.update(5, 100)
  assert.equal(value.update(10, 100), 5)
  assert.equal(value.update(10, 90), null)
  assert.equal(value.update(10, 1200), 10)
})
