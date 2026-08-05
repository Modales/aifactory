import { test } from 'vitest'
import assert from 'node:assert/strict'
import { SquatSideSelector } from '../../src/lib/analysis/squat/sideSelection.ts'
import { config, poseWithSides } from './fixtures.ts'

const size = { width: 640, height: 480 }

test('acquires the stronger left or right side', () => {
  const leftSelector = new SquatSideSelector(config())
  assert.equal(leftSelector.update(poseWithSides({ leftVisibility: 0.95, rightVisibility: 0.7 }), size, 0).selectedSide, 'left')
  const rightSelector = new SquatSideSelector(config())
  assert.equal(rightSelector.update(poseWithSides({ leftVisibility: 0.7, rightVisibility: 0.95 }), size, 0).selectedSide, 'right')
})

test('returns no side when neither side meets the threshold', () => {
  const selector = new SquatSideSelector(config())
  const result = selector.update(poseWithSides({ leftVisibility: 0.5, rightVisibility: 0.6 }), size, 0)
  assert.equal(result.selectedSide, null)
})

test('does not switch below the challenger margin', () => {
  const selector = new SquatSideSelector(config())
  selector.update(poseWithSides({ leftVisibility: 0.9, rightVisibility: 0.7 }), size, 0)
  for (let index = 1; index <= 8; index += 1) {
    assert.equal(selector.update(poseWithSides({ leftVisibility: 0.8, rightVisibility: 0.9 }), size, index * 80).selectedSide, 'left')
  }
})

test('requires persistent challenger evidence before switching', () => {
  const selector = new SquatSideSelector(config({ sideSwitchFrames: 5 }))
  selector.update(poseWithSides({ leftVisibility: 0.95, rightVisibility: 0.7 }), size, 0)
  for (let index = 1; index < 5; index += 1) {
    const result = selector.update(poseWithSides({ leftVisibility: 0.7, rightVisibility: 0.95 }), size, index * 80)
    assert.equal(result.selectedSide, 'left')
    assert.equal(result.switched, false)
  }
  const switched = selector.update(poseWithSides({ leftVisibility: 0.7, rightVisibility: 0.95 }), size, 400)
  assert.equal(switched.selectedSide, 'right')
  assert.equal(switched.switched, true)
})

test('holds a selected side briefly through occlusion then releases it', () => {
  const selector = new SquatSideSelector(config({ sideOcclusionHoldMs: 450 }))
  selector.update(poseWithSides({ leftVisibility: 0.95, rightVisibility: 0.5 }), size, 0)
  assert.equal(selector.update(poseWithSides({ leftVisibility: 0.2, rightVisibility: 0.2 }), size, 400).selectedSide, 'left')
  assert.equal(selector.update(poseWithSides({ leftVisibility: 0.2, rightVisibility: 0.2 }), size, 451).selectedSide, null)
})

test('rejects a frontal or strong three-quarter view independently of side quality', () => {
  const selector = new SquatSideSelector(config())
  const result = selector.update(poseWithSides({ leftVisibility: 0.95, rightVisibility: 0.9, separation: 0.25 }), size, 0)
  assert.equal(result.selectedSide, 'left')
  assert.equal(result.viewSuitable, false)
})

test('clearing a challenge prevents rapid oscillation and reset clears selection', () => {
  const selector = new SquatSideSelector(config({ sideSwitchFrames: 3 }))
  selector.update(poseWithSides({ leftVisibility: 0.95, rightVisibility: 0.7 }), size, 0)
  selector.update(poseWithSides({ leftVisibility: 0.7, rightVisibility: 0.95 }), size, 80)
  selector.update(poseWithSides({ leftVisibility: 0.95, rightVisibility: 0.7 }), size, 160)
  selector.update(poseWithSides({ leftVisibility: 0.7, rightVisibility: 0.95 }), size, 240)
  assert.equal(selector.update(poseWithSides({ leftVisibility: 0.95, rightVisibility: 0.7 }), size, 320).selectedSide, 'left')
  selector.reset()
  assert.equal(selector.update(poseWithSides({ leftVisibility: 0.5, rightVisibility: 0.5 }), size, 400).selectedSide, null)
})
