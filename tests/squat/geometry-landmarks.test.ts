import { test } from 'vitest'
import assert from 'node:assert/strict'
import { angle, calculateSquatGeometry, normalizedHipToKneeDepth, toImagePoint } from '../../src/lib/analysis/squat/geometry.ts'
import { extractSideLandmarks, landmarkConfidence, SQUAT_LANDMARK_INDEXES } from '../../src/lib/analysis/squat/landmarks.ts'
import { landmark, poseWithSides } from './fixtures.ts'

test('three-point angle handles straight, right, and degenerate vectors', () => {
  assert.equal(angle({ x: -1, y: 0 }, { x: 0, y: 0 }, { x: 1, y: 0 }), 180)
  assert.equal(angle({ x: 0, y: -1 }, { x: 0, y: 0 }, { x: 1, y: 0 }), 90)
  assert.equal(angle({ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 1, y: 0 }), null)
})

test('image conversion corrects landscape and portrait aspect ratios', () => {
  assert.deepEqual(toImagePoint({ x: 0.5, y: 0.25 }, 800, 400), { x: 400, y: 100 })
  assert.deepEqual(toImagePoint({ x: 0.5, y: 0.25 }, 400, 800), { x: 200, y: 200 })
  assert.equal(toImagePoint({ x: 0.5, y: 0.25 }, 0, 800), null)
})

test('signed depth is positive below the knee and negative above it', () => {
  assert.equal(normalizedHipToKneeDepth({ x: 0, y: 11 }, { x: 0, y: 10 }, 2), 0.5)
  assert.equal(normalizedHipToKneeDepth({ x: 0, y: 9 }, { x: 0, y: 10 }, 2), -0.5)
  assert.equal(normalizedHipToKneeDepth({ x: 0, y: 9 }, { x: 0, y: 10 }, 0), null)
})

test('landmark extraction uses the correct anatomical indexes', () => {
  const pose = poseWithSides()
  const left = extractSideLandmarks(pose, 'left', 0.65)
  const right = extractSideLandmarks(pose, 'right', 0.65)
  assert.equal(left?.shoulder.x, pose.landmarks[SQUAT_LANDMARK_INDEXES.left.shoulder]?.x)
  assert.equal(right?.ankle.x, pose.landmarks[SQUAT_LANDMARK_INDEXES.right.ankle]?.x)
  assert.equal(left?.side, 'left')
  assert.equal(right?.side, 'right')
})

test('missing, non-finite, low, and absent visibility are rejected', () => {
  const missing = poseWithSides()
  missing.landmarks.length = 20
  assert.equal(extractSideLandmarks(missing, 'left', 0.65), null)
  const invalid = poseWithSides()
  invalid.landmarks[25] = landmark(Number.NaN, 0.5)
  assert.equal(extractSideLandmarks(invalid, 'left', 0.65), null)
  assert.equal(extractSideLandmarks(poseWithSides({ leftVisibility: 0.5 }), 'left', 0.65), null)
  assert.equal(landmarkConfidence({ x: 0.5, y: 0.5 }), 0)
})

test('world angles are preferred only when the complete world chain is valid', () => {
  const withWorld = poseWithSides({ world: true })
  const worldGeometry = calculateSquatGeometry(withWorld, 'left', { width: 640, height: 480 }, 0.65)
  assert.equal(worldGeometry?.angleSpace, 'world')
  withWorld.worldLandmarks![25] = landmark(Number.NaN, 0.5)
  const fallback = calculateSquatGeometry(withWorld, 'left', { width: 640, height: 480 }, 0.65)
  assert.equal(fallback?.angleSpace, 'image')
})

test('missing optional world landmarks use aspect-corrected image geometry', () => {
  const geometry = calculateSquatGeometry(poseWithSides(), 'left', { width: 1280, height: 720 }, 0.65)
  assert.equal(geometry?.angleSpace, 'image')
  assert.ok(geometry && Number.isFinite(geometry.kneeAngle))
})
